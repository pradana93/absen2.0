/**
 * Riwayat — calendar with daily status, monthly summary + payroll-ready
 * slip, photo evidence, filterable records with CSV/Excel export, and a
 * map/radar view of the month's locations.
 */
import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { AttendanceLog, buildCsv, daySummary, downloadTextFile, monthDays, monthLabel } from "../lib/database";
import { formatMeters } from "../lib/geoUtils";
import { fmtDuration, todayKey, wibDayKey, wibShortDate, wibTime } from "../lib/format";
import Radar from "../components/Radar";
import GeofenceMap from "../components/GeofenceMap";
import { Chip, InitialsAvatar, Modal, SectionLabel } from "../components/bits";
import { IconCalendar, IconDownload, IconFile, IconX } from "../components/icons";

type CellKind = "work" | "late" | "leave" | "absent" | "future" | "empty" | "holiday";

const cellStyle: Record<CellKind, string> = {
  work: "bg-ok-100 text-ok-600 border-ok-300",
  late: "bg-warn-100 text-warn-600 border-warn-300",
  leave: "bg-sky-100 text-sky-600 border-sky-300",
  absent: "bg-danger-100 text-danger-600 border-danger-300",
  holiday: "bg-grape-100 text-grape-600 border-grape-300",
  future: "bg-ink-50 text-ink-300 border-ink-100",
  empty: "bg-transparent text-transparent border-transparent",
};

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export default function HistoryView() {
  const { session, employees, logs, breaks, leaves, shifts, company: co, activeSite, geo } = useApp();
  // maps & radar follow the chosen Gudang/Area; holidays stay company-wide
  const company = { ...activeSite, holidays: co.holidays };
  const me = session!;
  const isAdmin = me.role === "companyadmin" || me.role === "superadmin";

  const [staffId, setStaffId] = useState(me.staffId);
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [geoMode, setGeoMode] = useState<"map" | "radar">("map");
  const [type, setType] = useState("Semua");
  const [status, setStatus] = useState("Semua");
  const [evidence, setEvidence] = useState<AttendanceLog | null>(null);
  const today = todayKey();

  const viewStaff = employees.find((e) => e.staffId === staffId) ?? me;
  const shiftId = viewStaff.shiftId;

  /* calendar */
  const cal = useMemo(() => {
    return monthDays(month).map((day) => {
      const s = daySummary(staffId, day, logs, breaks, leaves, shifts, shiftId, company.holidays);
      const isFuture = day > today;
      let kind: CellKind = "empty";
      if (!isFuture) {
        kind = s.inTs ? (s.lateMin > 0 ? "late" : "work") : s.kind === "leave" ? "leave" : s.kind === "holiday" ? "holiday" : "absent";
      } else {
        kind = "future";
      }
      return { day, kind, workMin: s.workMin, lateMin: s.lateMin, otMin: s.overtimeMin, breakMin: s.breakMin };
    });
  }, [staffId, month, logs, breaks, leaves, shifts, shiftId, company.holidays, today]);

  const monthStats = useMemo(() => {
    const real = cal.filter((c) => (c.kind as CellKind) !== "future" && (c.kind as CellKind) !== "empty");
    const hadir = real.filter((c) => c.kind === "work").length;
    const terlambat = real.filter((c) => c.kind === "late").length;
    const cuti = real.filter((c) => c.kind === "leave").length;
    const absen = real.filter((c) => c.kind === "absent").length;
    const libur = real.filter((c) => c.kind === "holiday").length;
    const totalWork = real.reduce((a, c) => a + c.workMin, 0);
    const totalLate = real.reduce((a, c) => a + c.lateMin, 0);
    const totalBreak = real.reduce((a, c) => a + c.breakMin, 0);
    const totalOt = real.reduce((a, c) => a + c.otMin, 0);
    return { hadir, terlambat, cuti, absen, libur, totalWork, totalLate, totalBreak, totalOt };
  }, [cal]);

  /* records */
  const filtered = useMemo(
    () =>
      logs
        .filter((l) => l.staffId === staffId && wibDayKey(new Date(l.ts)).startsWith(month))
        .filter((l) => (type === "Semua" || l.type === type))
        .filter((l) => (status === "Semua" || l.status === status))
        .sort((a, b) => b.ts - a.ts),
    [logs, staffId, month, type, status],
  );

  const exportCsv = () => downloadTextFile(`riwayat-${staffId}-${month}.csv`, buildCsv(filtered), "text/csv;charset=utf-8");
  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const rows = filtered.map((l) => ({
      Waktu: new Date(l.ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
      Tipe: l.type, Status: l.status, "Jarak (m)": l.distanceM,
      "Face Δ": l.faceDist ?? "", Metode: l.method, Alasan: l.reason ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Riwayat");
    XLSX.writeFile(wb, `riwayat-${staffId}-${month}.xlsx`);
  };

  /* calendar offset (Monday first) */
  const firstDay = new Date(`${month}-01T12:00:00+07:00`).getDay();
  const offset = (firstDay + 6) % 7;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">Riwayat</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-400">{monthLabel(month)} · {viewStaff.name}</p>
        </div>
        <div className="flex gap-1.5">
          <button className="btn-soft !rounded-xl !px-3 !py-2.5 !text-[12px]" onClick={exportCsv} disabled={!filtered.length}>
            <IconDownload size={13} /> CSV
          </button>
          <button className="btn-soft !rounded-xl !px-3 !py-2.5 !text-[12px]" onClick={() => void exportXlsx()} disabled={!filtered.length}>
            <IconFile size={13} /> Excel
          </button>
        </div>
      </div>

      {/* filters */}
      <div className="space-y-2.5">
        {isAdmin && (
          <select className="input !py-2.5 text-sm" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {employees.map((e) => <option key={e.staffId} value={e.staffId}>{e.name} · {e.staffId}</option>)}
          </select>
        )}
        <div className="grid grid-cols-3 gap-2">
          <input type="month" className="input !py-2.5 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
          <select className="input !py-2.5 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            {["Semua", "IN", "OUT"].map((t) => <option key={t} value={t}>{t === "Semua" ? "Semua tipe" : t}</option>)}
          </select>
          <select className="input !py-2.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            {["Semua", "VERIFIED", "REJECTED"].map((s) => <option key={s} value={s}>{s === "Semua" ? "Semua status" : s}</option>)}
          </select>
        </div>
      </div>

      {/* calendar */}
      <section className="card p-4">
        <SectionLabel right={<Chip tone="ink"><IconCalendar size={11} /> {cal.length} hari</Chip>}>Kalender Kehadiran</SectionLabel>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => (
            <span key={d} className="pb-1 text-center text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">{d}</span>
          ))}
          {Array.from({ length: offset }).map((_, i) => <span key={`pad${i}`} />)}
          {cal.map((c) => (
            <div
              key={c.day}
              title={`${c.day} · ${c.kind}${c.workMin ? ` · ${fmtDuration(c.workMin)}` : ""}${c.lateMin ? ` · telat ${c.lateMin} mnt` : ""}`}
              className={`flex aspect-square cursor-default flex-col items-center justify-center rounded-xl border text-[12px] font-extrabold transition hover:scale-105 ${cellStyle[c.kind]} ${c.day === today ? "ring-2 ring-sun-400" : ""}`}
            >
              {Number(c.day.slice(-2))}
              {c.kind === "late" && <span className="text-[8px] font-bold">+{c.lateMin}m</span>}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-extrabold text-ink-400">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded border border-ok-300 bg-ok-100" /> Hadir</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded border border-warn-300 bg-warn-100" /> Terlambat</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded border border-sky-300 bg-sky-100" /> Cuti</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded border border-danger-300 bg-danger-100" /> Absen</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded border border-grape-300 bg-grape-100" /> Libur</span>
        </div>
      </section>

      {/* monthly summary + payroll slip */}
      <div className="grid grid-cols-4 gap-2">
        <div className="card px-2.5 py-2 text-center">
          <p className="font-display text-[19px] font-extrabold text-ok-600">{monthStats.hadir + monthStats.terlambat}</p>
          <p className="text-[9px] font-extrabold tracking-wide text-ink-400 uppercase">Hadir</p>
        </div>
        <div className="card px-2.5 py-2 text-center">
          <p className="font-display text-[19px] font-extrabold text-warn-600">{monthStats.terlambat}</p>
          <p className="text-[9px] font-extrabold tracking-wide text-ink-400 uppercase">Telat</p>
        </div>
        <div className="card px-2.5 py-2 text-center">
          <p className="font-display text-[19px] font-extrabold text-sky-600">{monthStats.cuti}</p>
          <p className="text-[9px] font-extrabold tracking-wide text-ink-400 uppercase">Cuti</p>
        </div>
        <div className="card px-2.5 py-2 text-center">
          <p className="font-display text-[19px] font-extrabold text-danger-600">{monthStats.absen}</p>
          <p className="text-[9px] font-extrabold tracking-wide text-ink-400 uppercase">Absen</p>
        </div>
      </div>

      <div className="card flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-[10.5px] font-extrabold tracking-[0.12em] text-ink-400 uppercase">Total jam kerja</p>
          <p className="font-display text-[22px] leading-tight font-extrabold text-ink-900">{fmtDuration(monthStats.totalWork)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10.5px] font-extrabold tracking-[0.12em] text-ink-400 uppercase">Total terlambat</p>
          <p className="font-display text-[22px] leading-tight font-extrabold text-warn-600">{monthStats.totalLate} mnt</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-dashed border-ink-200 bg-ink-900 px-4 py-3">
          <div>
            <p className="font-display text-[15px] font-extrabold text-white">Slip Jam Kerja</p>
            <p className="text-[10.5px] font-bold text-white/55">{viewStaff.name} · {monthLabel(month)} · siap untuk penggajian</p>
          </div>
          <button onClick={() => window.print()} className="btn-sun !rounded-xl !px-3.5 !py-2 text-[12px] print:hidden">
            <IconDownload size={13} /> Cetak
          </button>
        </div>
        <div className="slip-print divide-y divide-dashed divide-ink-100 px-4">
          {[
            ["Hari hadir", `${monthStats.hadir + monthStats.terlambat} hari`],
            ["Jam kerja bersih", fmtDuration(monthStats.totalWork)],
            ["Lembur", fmtDuration(monthStats.totalOt)],
            ["Istirahat", fmtDuration(monthStats.totalBreak)],
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
          Dihitung otomatis dari check-in/out, istirahat, dan shift — bukan merupakan slip gaji resmi.
        </p>
      </div>

      {/* location */}
      <section>
        <SectionLabel
          right={
            <div className="flex rounded-full border border-ink-100 bg-white p-0.5">
              {(["map", "radar"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setGeoMode(m)}
                  className={`cursor-pointer rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide uppercase transition ${
                    geoMode === m ? "bg-ink-900 text-white shadow" : "text-ink-400 hover:text-ink-600"
                  }`}
                >
                  {m === "map" ? "Peta" : "Radar"}
                </button>
              ))}
            </div>
          }
        >
          Lokasi Absen
        </SectionLabel>
        {geoMode === "map" ? (
          <GeofenceMap
            hq={{ lat: company.hqLat, lon: company.hqLon }}
            radiusM={company.radiusM}
            points={logs.filter((l) => l.staffId === staffId && wibDayKey(new Date(l.ts)).startsWith(month))}
            live={geo}
            heightClass="h-[300px]"
          />
        ) : (
          <Radar
            hq={{ lat: company.hqLat, lon: company.hqLon }}
            radiusM={company.radiusM}
            points={logs.filter((l) => l.staffId === staffId && wibDayKey(new Date(l.ts)).startsWith(month))}
            live={geo}
          />
        )}
      </section>

      {/* records */}
      <section className="pb-2">
        <SectionLabel right={<Chip tone="ink">{filtered.length} catatan</Chip>}>Catatan</SectionLabel>
        {filtered.length === 0 ? (
          <p className="card px-4 py-6 text-center text-[13px] font-semibold text-ink-400">Tidak ada catatan untuk filter ini.</p>
        ) : (
          <div className="card divide-y divide-ink-100/80">
            {filtered.map((l, i) => (
              <div key={l.id} className="tile-pop flex items-center gap-3 px-3.5 py-3" style={{ animationDelay: `${i * 40}ms` }}>
                {l.photo ? (
                  <button
                    onClick={() => setEvidence(l)}
                    className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-xl ring-1 ring-ink-200 transition hover:ring-sun-400 active:scale-95"
                    title="Lihat bukti foto"
                  >
                    <img src={l.photo} alt="Bukti" className="h-full w-full object-cover" />
                    <span className="absolute right-0.5 bottom-0.5 grid h-4 w-4 place-items-center rounded-md bg-black/55 text-white">
                      <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M4 8h2.2l1.6-2.4h8.4L17.8 8H20a1.5 1.5 0 0 1 1.5 1.5V18A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9.5A1.5 1.5 0 0 1 4 8Z" /><circle cx="12" cy="13.5" r="3.5" /></svg>
                    </span>
                  </button>
                ) : (
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-[11px] font-extrabold ${
                    l.status === "REJECTED" ? "bg-danger-100 text-danger-600" : l.type === "IN" ? "bg-sun-100 text-sun-700" : "bg-teal-100 text-teal-600"
                  }`}>
                    {l.status === "REJECTED" ? <IconX size={16} /> : l.type}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink-900">
                    {l.type === "IN" ? "Check-In" : "Check-Out"}
                    <Chip tone={l.status === "VERIFIED" ? "ok" : "danger"} className="!px-1.5 !py-0.5 !text-[8.5px]">
                      {l.status === "VERIFIED" ? "SAH" : "DITOLAK"}
                    </Chip>
                    {l.lateMin ? <Chip tone="warn" className="!px-1.5 !py-0.5 !text-[8.5px]">+{l.lateMin}m</Chip> : null}
                  </p>
                  <p className="truncate text-[11px] font-semibold text-ink-400">
                    {l.reason ?? `${formatMeters(l.distanceM)} dari HQ · ${l.method === "face" ? "wajah" : "manual"}${l.workMin ? ` · ${fmtDuration(l.workMin)}` : ""}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[12px] font-bold text-ink-700 tabular-nums">{wibTime(new Date(l.ts))}</p>
                  <p className="text-[9.5px] font-bold text-ink-300">{wibShortDate(new Date(l.ts))}</p>
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
            {evidence.photo && (
              <img src={evidence.photo} alt="Foto saat absen" className="w-full rounded-2xl border border-ink-100" />
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-ink-50 px-3 py-2.5">
                <p className="text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">Waktu (WIB)</p>
                <p className="font-mono text-[13px] font-extrabold text-ink-900">{wibShortDate(new Date(evidence.ts))} · {wibTime(new Date(evidence.ts))}</p>
              </div>
              <div className="rounded-xl bg-ink-50 px-3 py-2.5">
                <p className="text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">Tipe</p>
                <p className="font-display text-[14px] font-extrabold text-ink-900">Check-{evidence.type}</p>
              </div>
              <div className="rounded-xl bg-ink-50 px-3 py-2.5">
                <p className="text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">Jarak GPS</p>
                <p className="font-mono text-[13px] font-extrabold text-ink-900">{formatMeters(evidence.distanceM)} dari HQ</p>
              </div>
              <div className="rounded-xl bg-ink-50 px-3 py-2.5">
                <p className="text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">Face Δ</p>
                <p className="font-mono text-[13px] font-extrabold text-ink-900">{evidence.faceDist?.toFixed(3) ?? "—"}</p>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed font-semibold text-ink-400">
              Foto ini diambil otomatis saat verifikasi {evidence.method === "face" ? "wajah + geofence" : "manual"} dan tersimpan sebagai bukti kehadiran yang sah.
            </p>
          </div>
        )}
      </Modal>
      <span className="hidden"><InitialsAvatar name="" seedKey="" size="h-0 w-0" /></span>
    </div>
  );
}
