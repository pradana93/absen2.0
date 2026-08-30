/**
 * Dashboard (Admin HR / Super Admin) — KPIs with shift-aware lateness,
 * live ops ticker, anomaly detection, department chart, 7-day trend,
 * geofence map (true map, default) / radar toggle, leave queue, activity
 * feed and report presets.
 */
import { useEffect, useMemo, useState } from "react";
import { NavFn } from "../App";
import { useApp } from "../lib/store";
import { AttendanceLog, buildCsv, downloadTextFile } from "../lib/database";
import { formatMeters } from "../lib/geoUtils";
import { relTime, todayKey, wibDayKey, wibShortDate, wibTime } from "../lib/format";
import Radar from "../components/Radar";
import GeofenceMap from "../components/GeofenceMap";
import { useToast } from "../components/Toast";
import { Chip, InitialsAvatar, SectionLabel, StatTile } from "../components/bits";
import {
  IconAlert, IconArrowRight, IconCheck, IconClipboard, IconClock, IconDownload, IconFile, IconPin, IconPlus, IconUsers, IconX,
} from "../components/icons";

function wibMinutes(ts: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ts));
  return (Number(parts.find((p) => p.type === "hour")?.value) % 24) * 60 + Number(parts.find((p) => p.type === "minute")?.value);
}

function OpsTicker() {
  const { employees, logs, breaks, shifts, company } = useApp();
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = window.setInterval(() => tick((t) => t + 1), 20_000);
    return () => window.clearInterval(iv);
  }, []);
  const today = todayKey();
  const now = new Date();
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(now)) % 24;
  const m = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", minute: "2-digit" }).format(now));
  const wibMin = h * 60 + m;
  const isHoliday = company.holidays?.some((x) => x.date === today) ?? false;

  let onShift = 0, onBreak = 0, notIn = 0;
  for (const e of employees) {
    if ((e.role !== "employee" && e.role !== "manager") || e.status !== "active") continue;
    const day = (t: "IN" | "OUT") => logs.some((l) => l.staffId === e.staffId && l.type === t && l.status === "VERIFIED" && wibDayKey(new Date(l.ts)) === today);
    if (day("IN") && !day("OUT")) {
      onShift++;
      if (breaks.some((b) => b.staffId === e.staffId && b.day === today && !b.end)) onBreak++;
    } else if (!day("IN") && !isHoliday) {
      const sh = shifts.find((s) => s.id === e.shiftId);
      if (sh && sh.id !== "sh-fleks") {
        const s = Number(sh.start.slice(0, 2)) * 60 + Number(sh.start.slice(3));
        const en = Number(sh.end.slice(0, 2)) * 60 + Number(sh.end.slice(3));
        const inWin = en > s ? wibMin >= s && wibMin <= en : wibMin >= s || wibMin <= en;
        if (inWin) notIn++;
      }
    }
  }
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ok-100 text-ok-600">
        <span className="absolute inset-0 animate-ping rounded-xl bg-ok-500/15" />
        <IconClock size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold tracking-[0.14em] text-ink-400 uppercase">Operasional Langsung</p>
        <p className="truncate text-[13px] font-extrabold text-ink-900">
          {onShift} di shift · {onBreak} istirahat · {notIn} belum hadir{isHoliday ? " · hari libur" : ""}
        </p>
      </div>
      <span className="anim-blink h-2 w-2 shrink-0 rounded-full bg-ok-500" />
    </div>
  );
}

function AnomalyWidget() {
  const { logs, employees } = useApp();
  const flagged = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400_000;
    const counts = new Map<string, { n: number; reasons: Set<string> }>();
    for (const l of logs) {
      if (l.status !== "REJECTED" || l.ts < weekAgo) continue;
      const c = counts.get(l.staffId) ?? { n: 0, reasons: new Set<string>() };
      c.n++;
      if (l.reason) c.reasons.add(l.reason.split(" (")[0]);
      counts.set(l.staffId, c);
    }
    return [...counts.entries()]
      .filter(([, c]) => c.n >= 1)
      .map(([id, c]) => ({ e: employees.find((x) => x.staffId === id), n: c.n, why: [...c.reasons].slice(0, 2).join(" · ") }))
      .filter((x) => !!x.e);
  }, [logs, employees]);
  if (!flagged.length) return null;
  return (
    <section className="card border-warn-300 bg-warn-100/50 p-4">
      <SectionLabel right={<Chip tone="warn">{flagged.length} staff</Chip>}>
        <span className="inline-flex items-center gap-1.5"><IconAlert size={16} /> Peringatan Anomali</span>
      </SectionLabel>
      <div className="space-y-1.5">
        {flagged.map(({ e, n, why }) => (
          <p key={e!.staffId} className="text-[12.5px] leading-snug font-bold text-warn-600">
            {e!.name} — {n}× ditolak dalam 7 hari{why ? ` (${why})` : ""}
          </p>
        ))}
      </div>
      <p className="mt-2 text-[10.5px] font-semibold text-warn-600/75">Pola penolakan berulang dapat mengindikasikan upaya titip absen.</p>
    </section>
  );
}

export default function DashboardView({ nav }: { nav: NavFn }) {
  const { employees, logs, leaves, company, shifts, geo, decideLeave, audit } = useApp();
  const toast = useToast();
  const [geoMode, setGeoMode] = useState<"map" | "radar">("map");
  const today = todayKey();

  const activeStaff = employees.filter((e) => e.status === "active" && (e.role === "employee" || e.role === "manager"));
  const staffById = useMemo(() => new Map(employees.map((e) => [e.staffId, e])), [employees]);
  const todayLogs = useMemo(() => logs.filter((l) => wibDayKey(new Date(l.ts)) === today), [logs, today]);

  const kpi = useMemo(() => {
    const verifiedIn = new Map<string, AttendanceLog>();
    for (const l of [...todayLogs].reverse()) {
      if (l.type === "IN" && l.status === "VERIFIED" && !verifiedIn.has(l.staffId)) verifiedIn.set(l.staffId, l);
    }
    let late = 0;
    for (const [staffId, log] of verifiedIn) {
      const emp = staffById.get(staffId);
      const sh = emp ? shifts.find((s) => s.id === emp.shiftId) : null;
      if (sh && sh.id !== "sh-fleks") {
        const start = Number(sh.start.slice(0, 2)) * 60 + Number(sh.start.slice(3));
        if (wibMinutes(log.ts) > start + sh.graceMin) late++;
      }
    }
    const onLeaveToday = leaves.filter((lv) => lv.status === "approved" && lv.date <= today && today <= lv.date).length;
    return {
      hadir: verifiedIn.size, late, cuti: onLeaveToday,
      belum: Math.max(0, activeStaff.length - verifiedIn.size),
      rejected: todayLogs.filter((l) => l.status === "REJECTED").length,
    };
  }, [todayLogs, activeStaff, staffById, shifts, leaves, today]);

  const weekly = useMemo(() => {
    const days: Array<{ label: string; count: number; isToday: boolean }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = wibDayKey(d);
      const label = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "short" }).format(d).replace(".", "");
      const count = logs.filter((l) => l.type === "IN" && l.status === "VERIFIED" && wibDayKey(new Date(l.ts)) === key).length;
      days.push({ label, count, isToday: i === 0 });
    }
    return days;
  }, [logs]);
  const maxCount = Math.max(1, ...weekly.map((w) => w.count));

  const deptStats = useMemo(() => {
    const map = new Map<string, { hadir: number; total: number }>();
    for (const e of activeStaff) {
      const s = map.get(e.department) ?? { hadir: 0, total: 0 };
      s.total++;
      if (todayLogs.some((l) => l.staffId === e.staffId && l.type === "IN" && l.status === "VERIFIED")) s.hadir++;
      map.set(e.department, s);
    }
    return [...map.entries()];
  }, [activeStaff, todayLogs]);

  const hrQueue = useMemo(() => leaves.filter((l) => l.status === "pending_hr").sort((a, b) => b.createdAt - a.createdAt), [leaves]);
  const feed = todayLogs.slice(0, 8);

  const exportRange = (days: number, label: string) => {
    const from = Date.now() - days * 86400_000;
    const rows = logs.filter((l) => l.ts >= from);
    downloadTextFile(`laporan-${label}-${today}.csv`, buildCsv(rows), "text/csv;charset=utf-8");
    toast.push("ok", "Laporan diekspor", `${rows.length} catatan · ${label}`);
    audit("REPORT_EXPORT", "logs", `${label} · ${rows.length} catatan`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">Dashboard HR</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-400">
            {wibShortDate(new Date())} · {activeStaff.length} staff aktif · radius {company.radiusM} m
          </p>
        </div>
        <button className="btn-sun !rounded-xl !px-3.5 !py-2.5 text-[13px]" onClick={() => nav("pengguna")}>
          <IconPlus size={15} /> Staff
        </button>
      </div>

      <OpsTicker />

      <div className="grid grid-cols-4 gap-2.5">
        <StatTile label="Hadir" value={kpi.hadir} tone="ok" sub={`dari ${activeStaff.length}`} />
        <StatTile label="Telat" value={kpi.late} tone="warn" sub="hari ini" />
        <StatTile label="Cuti" value={kpi.cuti} tone="sky" sub="disetujui" />
        <StatTile label="Ditolak" value={kpi.rejected} tone="danger" sub="geofence" />
      </div>
      {kpi.belum > 0 && (
        <div className="card flex items-center gap-3 border-sky-300 bg-sky-100/60 p-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-500 text-white"><IconClock size={16} /></span>
          <p className="text-[13px] font-bold text-sky-600">{kpi.belum} staff belum Check-In hari ini.</p>
        </div>
      )}

      <AnomalyWidget />

      {/* geofence — true map by default */}
      <section>
        <SectionLabel
          right={
            <div className="flex rounded-full border border-ink-100 bg-white p-0.5">
              {(["map", "radar"] as const).map((mo) => (
                <button
                  key={mo}
                  onClick={() => setGeoMode(mo)}
                  className={`cursor-pointer rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide uppercase transition ${
                    geoMode === mo ? "bg-ink-900 text-white shadow" : "text-ink-400 hover:text-ink-600"
                  }`}
                >
                  {mo === "map" ? "Peta" : "Radar"}
                </button>
              ))}
            </div>
          }
        >
          <span className="inline-flex items-center gap-1.5"><IconPin size={16} /> Peta Geofence</span>
        </SectionLabel>
        {geoMode === "map" ? (
          <GeofenceMap
            hq={{ lat: company.hqLat, lon: company.hqLon }}
            radiusM={company.radiusM}
            points={todayLogs}
            live={geo}
            heightClass="h-[320px]"
          />
        ) : (
          <Radar hq={{ lat: company.hqLat, lon: company.hqLon }} radiusM={company.radiusM} points={todayLogs} live={geo} />
        )}
      </section>

      {/* department chart */}
      <section className="card p-4">
        <SectionLabel right={<Chip tone="ink">Check-IN / departemen</Chip>}>Kehadiran Departemen</SectionLabel>
        <div className="space-y-2.5">
          {deptStats.map(([dept, s]) => (
            <div key={dept}>
              <div className="mb-1 flex items-center justify-between text-[11.5px] font-extrabold">
                <span className="text-ink-700">{dept}</span>
                <span className="font-mono text-ink-400">{s.hadir}/{s.total}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-ink-50">
                <div className="bar-grow-x h-full rounded-full bg-gradient-to-r from-sun-400 to-sun-600" style={{ width: `${s.total ? (s.hadir / s.total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* weekly trend */}
      <section className="card p-4">
        <SectionLabel right={<Chip tone="ink">7 hari</Chip>}>Tren Check-In</SectionLabel>
        <div className="flex h-28 items-end gap-2">
          {weekly.map((w, i) => (
            <div key={w.label + i} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="font-mono text-[10.5px] font-bold text-ink-500 tabular-nums">{w.count}</span>
              <div className="flex h-16 w-full items-end rounded-lg bg-ink-50">
                <div
                  className={`bar-grow w-full rounded-lg ${w.isToday ? "bg-gradient-to-t from-sun-600 to-sun-400" : "bg-ink-200"}`}
                  style={{ height: `${Math.max(8, (w.count / maxCount) * 100)}%` }}
                />
              </div>
              <span className={`text-[10px] font-extrabold uppercase ${w.isToday ? "text-sun-700" : "text-ink-300"}`}>{w.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* HR leave queue */}
      <section>
        <SectionLabel right={<Chip tone={hrQueue.length ? "warn" : "ok"}>{hrQueue.length} menunggu</Chip>}>Persetujuan HR</SectionLabel>
        {hrQueue.length === 0 ? (
          <p className="card px-4 py-5 text-center text-[13px] font-semibold text-ink-400">Semua pengajuan sudah diproses.</p>
        ) : (
          <div className="space-y-2.5">
            {hrQueue.map((lv) => (
              <div key={lv.id} className="card anim-fade-up flex items-center gap-3 p-3.5">
                <InitialsAvatar name={lv.name} seedKey={lv.staffId} size="h-10 w-10 text-[13px]" rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-extrabold text-ink-900">{lv.name} <span className="text-[11px] text-ink-400">· {lv.type} {lv.days} hari</span></p>
                  <p className="truncate text-[11.5px] font-semibold text-ink-400">“{lv.reason}” · {lv.managerDecision ? `✓ Mgr: ${lv.managerDecision.by}` : ""}</p>
                </div>
                <button onClick={() => { decideLeave(lv.id, true, "hr"); toast.push("ok", "Cuti disetujui", lv.name); }} className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl bg-ok-100 text-ok-600 transition hover:bg-ok-500 hover:text-white active:scale-90" aria-label="Setujui"><IconCheck size={16} /></button>
                <button onClick={() => { decideLeave(lv.id, false, "hr"); toast.push("danger", "Cuti ditolak", lv.name); }} className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl bg-danger-100 text-danger-600 transition hover:bg-danger-500 hover:text-white active:scale-90" aria-label="Tolak"><IconX size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* report presets */}
      <section className="card p-4">
        <SectionLabel right={<IconFile size={16} className="text-ink-300" />}>Laporan</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          <button className="btn-soft !py-2.5 !text-[12px]" onClick={() => exportRange(1, "harian")}><IconDownload size={13} /> Harian</button>
          <button className="btn-soft !py-2.5 !text-[12px]" onClick={() => exportRange(7, "mingguan")}><IconDownload size={13} /> Mingguan</button>
          <button className="btn-soft !py-2.5 !text-[12px]" onClick={() => exportRange(30, "bulanan")}><IconDownload size={13} /> Bulanan</button>
        </div>
        <p className="mt-2 text-[10.5px] font-bold text-ink-300">CSV lengkap semua kolom — siap diolah di spreadsheet.</p>
      </section>

      {/* activity feed */}
      <section>
        <SectionLabel
          right={
            <button onClick={() => nav("audit")} className="flex cursor-pointer items-center gap-1 text-[12px] font-extrabold text-sun-700 hover:underline">
              Audit <IconArrowRight size={12} />
            </button>
          }
        >
          Aktivitas Hari Ini
        </SectionLabel>
        {feed.length === 0 ? (
          <p className="card px-4 py-5 text-center text-[13px] font-semibold text-ink-400">Belum ada aktivitas hari ini.</p>
        ) : (
          <div className="card divide-y divide-ink-100/80">
            {feed.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <InitialsAvatar name={l.name} seedKey={l.staffId} size="h-9 w-9 text-[12px]" rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink-900">
                    <span className="truncate">{l.name}</span>
                    <Chip tone={l.status === "REJECTED" ? "danger" : l.type === "IN" ? "sun" : "teal"} className="!px-1.5 !py-0.5 !text-[9px]">
                      {l.status === "REJECTED" ? "DITOLAK" : l.type}
                    </Chip>
                  </p>
                  <p className="truncate text-[11px] font-semibold text-ink-400">
                    {l.reason ?? `${formatMeters(l.distanceM)} dari HQ · ${l.method === "face" ? "wajah" : "manual"}`} · {relTime(l.ts)}
                  </p>
                </div>
                <span className="font-mono text-[12px] font-bold text-ink-500 tabular-nums">{wibTime(new Date(l.ts))}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2.5 pb-2">
        <button className="card card-press flex items-center gap-3 p-3.5 text-left" onClick={() => nav("pengguna")}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-grape-100 text-grape-600"><IconUsers size={18} /></span>
          <span className="text-[13px] font-extrabold text-ink-800">Kelola Pengguna</span>
        </button>
        <button className="card card-press flex items-center gap-3 p-3.5 text-left" onClick={() => nav("audit")}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-100 text-teal-600"><IconClipboard size={18} /></span>
          <span className="text-[13px] font-extrabold text-ink-800">Jejak Audit</span>
        </button>
      </div>
    </div>
  );
}
