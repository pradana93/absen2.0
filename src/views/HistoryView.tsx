/** Riwayat — calendar, payroll-ready work slip, map/radar, filters, exports, photo evidence. */
import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { AttendanceLog, buildCsv, daySummary, downloadTextFile, monthDays, monthLabel } from "../lib/database";
import { formatMeters } from "../lib/geoUtils";
import { todayKey, wibDayKey, wibShortDate, wibTime } from "../lib/format";
import Radar from "../components/Radar";
import GeofenceMap from "../components/GeofenceMap";
import { Chip, Modal, SectionLabel } from "../components/bits";
import { IconCalendar, IconCamera, IconDownload, IconPin, IconX } from "../components/icons";

type CellKind = "work" | "late" | "leave" | "absent" | "future" | "empty" | "holiday";
const cellStyle: Record<CellKind, string> = {
  work: "bg-ok-100 text-ok-600 border-ok-300", late: "bg-warn-100 text-warn-600 border-warn-300",
  leave: "bg-sky-100 text-sky-600 border-sky-300", absent: "bg-danger-100 text-danger-600 border-danger-300",
  holiday: "bg-grape-100 text-grape-600 border-grape-300",
  future: "bg-ink-50 text-ink-300 border-ink-100", empty: "bg-transparent text-transparent border-transparent",
};

export default function HistoryView() {
  const { session, employees, logs, breaks, leaves, shifts, company, activeSite, geo } = useApp();
  const me = session!;
  const isStaff = me.role === "employee" || me.role === "manager";

  const [staffId, setStaffId] = useState(me.staffId);
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [geoMode, setGeoMode] = useState<"map" | "radar">("map");
  const [type, setType] = useState("Semua");
  const [status, setStatus] = useState("Semua");
  const [evidence, setEvidence] = useState<AttendanceLog | null>(null);
  const today = todayKey();

  const viewStaff = employees.find((e) => e.staffId === staffId) ?? me;
  const shiftId = viewStaff.shiftId;

  const cal = useMemo(() => monthDays(month).map((day) => {
    const s = daySummary(staffId, day, logs, breaks, leaves, shifts, shiftId, company.holidays);
    const kind: CellKind = day > today ? "future" : s.inTs ? (s.lateMin > 0 ? "late" : "work") : s.kind === "leave" ? "leave" : s.kind === "holiday" ? "holiday" : day < today ? "absent" : "empty";
    return { day, ...s, kind };
  }), [month, staffId, logs, breaks, leaves, shifts, shiftId, company.holidays, today]);

  const monthStats = useMemo(() => {
    const real = cal.filter((c) => c.kind !== "future" && c.kind !== "empty");
    const hadir = real.filter((c) => c.kind === "work").length;
    const terlambat = real.filter((c) => c.kind === "late").length;
    const cuti = real.filter((c) => c.kind === "leave").length;
    const libur = real.filter((c) => c.kind === "holiday").length;
    const absen = real.filter((c) => c.kind === "absent").length;
    return {
      hadir, terlambat, cuti, libur, absen,
      totalWork: real.reduce((a, c) => a + c.workMin, 0),
      totalLate: real.reduce((a, c) => a + c.lateMin, 0),
      totalBreak: real.reduce((a, c) => a + c.breakMin, 0),
      totalOt: real.reduce((a, c) => a + c.overtimeMin, 0),
    };
  }, [cal]);

  const filtered = useMemo(
    () => logs.filter((l) => l.staffId === staffId && wibDayKey(new Date(l.ts)).startsWith(month)
      && (type === "Semua" || l.type === type) && (status === "Semua" || l.status === status)),
    [logs, staffId, month, type, status],
  );

  const fmtDur = (min: number) => `${Math.floor(min / 60)}j ${String(Math.round(min % 60)).padStart(2, "0")}m`;
  const exportCsv = () => downloadTextFile(`riwayat-${staffId}-${month}.csv`, buildCsv(filtered), "text/csv;charset=utf-8");
  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const rows = filtered.map((l) => ({
      Waktu: new Date(l.ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
      "Staff ID": l.staffId, Nama: l.name, Gudang: l.siteId, Tipe: l.type, Status: l.status,
      "Jarak (m)": Math.round(l.distanceM), "Face Δ": l.faceDist ?? "", Metode: l.method, Alasan: l.reason ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Riwayat");
    XLSX.writeFile(wb, `riwayat-${staffId}-${month}.xlsx`);
  };

  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">Riwayat</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-400">{monthLabel(month)} · {viewStaff.name}</p>
        </div>
        <div className="flex gap-1.5">
          <button className="btn-soft !rounded-xl !px-3 !py-2.5 !text-[12px]" onClick={exportCsv} disabled={!filtered.length}><IconDownload size={13} /> CSV</button>
          <button className="btn-soft !rounded-xl !px-3 !py-2.5 !text-[12px]" onClick={() => void exportXlsx()} disabled={!filtered.length}><IconDownload size={13} /> Excel</button>
        </div>
      </div>

      {/* filters */}
      <div className="space-y-2.5">
        {!isStaff && (
          <select className="input !py-2.5 text-sm" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {employees.map((e) => <option key={e.staffId} value={e.staffId}>{e.name} · {e.staffId}</option>)}
          </select>
        )}
        {/* month takes its own row on narrow phones; type+status share one */}
        <div className="grid grid-cols-2 gap-2.5 min-[420px]:grid-cols-3">
          <input type="month" className="input col-span-2 !py-2.5 min-[420px]:col-span-1" value={month} max={today.slice(0, 7)} onChange={(e) => setMonth(e.target.value)} />
          <select className="input !py-2.5" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter tipe">
            {["Semua", "IN", "OUT"].map((t) => <option key={t}>{t === "Semua" ? "Semua Tipe" : t === "IN" ? "Check-IN" : "Check-OUT"}</option>)}
          </select>
          <select className="input !py-2.5" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
            {["Semua", "VERIFIED", "REJECTED"].map((t) => <option key={t}>{t === "Semua" ? "Semua Status" : t === "VERIFIED" ? "Terverifikasi" : "Ditolak"}</option>)}
          </select>
        </div>
      </div>

      {/* calendar */}
      <section className="card p-4">
        <SectionLabel right={<IconCalendar size={16} className="text-ink-300" />}>{monthLabel(month)}</SectionLabel>
        <div className="grid grid-cols-7 gap-1 text-center">
          {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((d) => (
            <span key={d} className="py-1 text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">{d}</span>
          ))}
          {Array.from({ length: new Date(`${month}-01T00:00:00+07:00`).getDay() }).map((_, i) => <span key={`e${i}`} />)}
          {cal.map((c) => (
            <div key={c.day} title={`${c.day} · ${c.kind}${c.lateMin ? ` · telat ${c.lateMin}m` : ""}${c.workMin ? ` · ${fmtDur(c.workMin)}` : ""}`}
              className={`grid aspect-square cursor-default place-items-center rounded-lg border text-[11px] font-extrabold transition hover:scale-105 ${cellStyle[c.kind]}`}>
              {Number(c.day.slice(8))}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[9.5px] font-extrabold text-ink-400">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded border border-ok-300 bg-ok-100" /> Hadir</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded border border-warn-300 bg-warn-100" /> Terlambat</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded border border-sky-300 bg-sky-100" /> Cuti</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded border border-grape-300 bg-grape-100" /> Libur</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded border border-danger-300 bg-danger-100" /> Absen</span>
        </div>
      </section>

      {/* totals + work slip */}
      <div className="grid grid-cols-2 gap-2.5 min-[420px]:grid-cols-4">
        {[
          ["Hadir", `${monthStats.hadir + monthStats.terlambat}`, "text-ok-600"],
          ["Telat", String(monthStats.terlambat), "text-warn-600"],
          ["Cuti/Libur", `${monthStats.cuti + monthStats.libur}`, "text-sky-600"],
          ["Absen", String(monthStats.absen), "text-danger-600"],
        ].map(([l, v, c]) => (
          <div key={l} className="card card-press p-3 text-center">
            <p className={`font-display text-[22px] leading-none font-extrabold ${c}`}>{v}</p>
            <p className="mt-1 text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">{l}</p>
          </div>
        ))}
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-dashed border-ink-200 bg-ink-900 px-4 py-3">
          <div>
            <p className="font-display text-[15px] font-extrabold text-white">Slip Jam Kerja</p>
            <p className="text-[10.5px] font-bold text-white/55">{viewStaff.name} · {monthLabel(month)} · siap untuk penggajian</p>
          </div>
          <button onClick={() => window.print()} className="btn-sun !rounded-xl !px-3.5 !py-2 text-[12px] print:hidden">Cetak</button>
        </div>
        <div className="slip-print divide-y divide-dashed divide-ink-100 px-4">
          {[
            ["Hari hadir", `${monthStats.hadir + monthStats.terlambat} hari`],
            ["Jam kerja bersih", fmtDur(monthStats.totalWork)],
            ["Lembur", fmtDur(monthStats.totalOt)],
            ["Istirahat", fmtDur(monthStats.totalBreak)],
            ["Keterlambatan", `${monthStats.totalLate} mnt`],
            ["Cuti / libur", `${monthStats.cuti} cuti · ${monthStats.libur} libur`],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2.5">
              <span className="text-[12.5px] font-bold text-ink-500">{k}</span>
              <span className="font-mono text-[13px] font-extrabold text-ink-900">{v}</span>
            </div>
          ))}
        </div>
        <p className="border-t border-dashed border-ink-200 px-4 py-2.5 text-[10px] font-bold text-ink-300">
          Dihitung otomatis dari check-in/out, istirahat, dan shift — bukan slip gaji resmi.
        </p>
      </section>

      {/* location */}
      <section>
        <SectionLabel
          right={
            <div className="flex rounded-full border border-ink-100 bg-white p-0.5">
              {(["map", "radar"] as const).map((m) => (
                <button key={m} onClick={() => setGeoMode(m)} className={`cursor-pointer rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide uppercase transition ${geoMode === m ? "bg-ink-900 text-white shadow" : "text-ink-400 hover:text-ink-600"}`}>
                  {m === "map" ? "Peta" : "Radar"}
                </button>
              ))}
            </div>
          }
        >
          Lokasi Absen
        </SectionLabel>
        {geoMode === "map" ? (
          <GeofenceMap hq={{ lat: activeSite.hqLat, lon: activeSite.hqLon }} radiusM={activeSite.radiusM}
            points={logs.filter((l) => l.staffId === staffId && wibDayKey(new Date(l.ts)).startsWith(month))} live={geo} heightClass="h-[300px]" />
        ) : (
          <Radar hq={{ lat: activeSite.hqLat, lon: activeSite.hqLon }} radiusM={activeSite.radiusM}
            points={logs.filter((l) => l.staffId === staffId && wibDayKey(new Date(l.ts)).startsWith(month))} live={geo} />
        )}
      </section>

      {/* log table */}
      <section className="pb-2">
        <SectionLabel right={<Chip tone="ink">{filtered.length} catatan</Chip>}>Catatan</SectionLabel>
        {filtered.length === 0 ? (
          <p className="card px-4 py-5 text-center text-[13px] font-semibold text-ink-400">Tidak ada catatan untuk filter ini.</p>
        ) : (
          <div className="card divide-y divide-ink-100/80">
            {filtered.map((l, i) => (
              <div key={l.id} className="tile-pop flex items-center gap-3 px-3.5 py-3" style={{ animationDelay: `${i * 40}ms` }}>
                {l.photo ? (
                  <button onClick={() => setEvidence(l)} className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-xl ring-1 ring-ink-200 transition hover:ring-sun-400 active:scale-95" title="Lihat bukti foto">
                    <img src={l.photo} alt="Bukti" className="h-full w-full object-cover" />
                    <span className="absolute right-0.5 bottom-0.5 grid h-4 w-4 place-items-center rounded-md bg-black/55 text-white"><IconCamera size={9} /></span>
                  </button>
                ) : (
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-[11px] font-extrabold ${l.status === "REJECTED" ? "bg-danger-100 text-danger-600" : l.type === "IN" ? "bg-sun-100 text-sun-700" : "bg-teal-100 text-teal-600"}`}>
                    {l.status === "REJECTED" ? <IconX size={16} /> : l.type}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-extrabold text-ink-900">
                    Check-{l.type}
                    <Chip tone={l.status === "REJECTED" ? "danger" : "ok"} className="!px-1.5 !py-0.5 !text-[8.5px]">{l.status === "REJECTED" ? "DITOLAK" : "OK"}</Chip>
                    {l.lateMin ? <Chip tone="warn" className="!px-1.5 !py-0.5 !text-[8.5px]">TELAT {l.lateMin}m</Chip> : null}
                  </p>
                  <p className="truncate text-[11px] font-semibold text-ink-400">
                    {wibShortDate(new Date(l.ts))} · {wibTime(new Date(l.ts))} · {l.status === "REJECTED" ? l.reason : `${formatMeters(l.distanceM)} · Δ ${l.faceDist?.toFixed(2) ?? "—"}${l.method === "manual" ? " · manual" : ""}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* evidence modal */}
      <Modal open={!!evidence} onClose={() => setEvidence(null)} title="Bukti Foto Verifikasi">
        {evidence && (
          <div className="space-y-3">
            {evidence.photo && <img src={evidence.photo} alt="Foto saat absen" className="w-full rounded-2xl border border-ink-100" />}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-ink-50 px-3 py-2.5">
                <p className="text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">Waktu (WIB)</p>
                <p className="font-mono text-[12.5px] font-extrabold text-ink-900">{wibShortDate(new Date(evidence.ts))} · {wibTime(new Date(evidence.ts))}</p>
              </div>
              <div className="rounded-xl bg-ink-50 px-3 py-2.5">
                <p className="text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">Jarak GPS</p>
                <p className="font-mono text-[13px] font-extrabold text-ink-900">{formatMeters(evidence.distanceM)}</p>
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink-400"><IconPin size={12} /> Face Δ {evidence.faceDist?.toFixed(3) ?? "—"} · tersimpan sebagai bukti sah.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
