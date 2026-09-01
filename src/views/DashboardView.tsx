/** Dashboard (Admin HR / Super Admin) — KPIs, MVP leaderboard, anomaly
 *  alerts, department chart, weekly trend, HR queue, geofence map, feed. */
import { useEffect, useMemo, useState } from "react";
import { NavFn } from "../App";
import { useApp } from "../lib/store";
import { AttendanceLog, buildCsv, daySummary, downloadTextFile } from "../lib/database";
import { formatMeters } from "../lib/geoUtils";
import { relTime, todayKey, wibDayKey, wibShortDate, wibTime } from "../lib/format";
import Radar from "../components/Radar";
import GeofenceMap from "../components/GeofenceMap";
import { useToast } from "../components/Toast";
import { Chip, CountUp, InitialsAvatar, SectionLabel, StatTile } from "../components/bits";
import {
  IconAlert, IconArrowRight, IconCheck, IconClock, IconCpu, IconDownload, IconFile, IconFlame, IconPin, IconPlus, IconUsers, IconX,
} from "../components/icons";

function wibMinutes(ts: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ts));
  return (Number(parts.find((p) => p.type === "hour")?.value) % 24) * 60 + Number(parts.find((p) => p.type === "minute")?.value);
}

function OpsTicker() {
  const { employees, logs, breaks, shifts, activeSite, company } = useApp();
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = window.setInterval(() => tick((t) => t + 1), 20_000);
    return () => window.clearInterval(iv);
  }, []);
  const today = todayKey();
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const wibMin = (Number(parts.find((p) => p.type === "hour")?.value) % 24) * 60 + Number(parts.find((p) => p.type === "minute")?.value);
  const isHoliday = company.holidays.some((h) => h.date === today);
  let onShift = 0, onBreak = 0, notIn = 0;
  for (const e of employees) {
    if ((e.role !== "employee" && e.role !== "manager") || e.status !== "active" || (e.siteId !== activeSite.id && e.siteId !== null)) continue;
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
        <p className="text-[10px] font-extrabold tracking-[0.14em] text-ink-400 uppercase">Operasional · {activeSite.shortName}</p>
        <p className="truncate text-[13px] font-extrabold text-ink-900">
          <CountUp n={onShift} /> di shift · <CountUp n={onBreak} /> istirahat · <CountUp n={notIn} /> belum hadir{isHoliday ? " · libur" : ""}
        </p>
      </div>
      <span className="anim-blink h-2 w-2 shrink-0 rounded-full bg-ok-500" />
    </div>
  );
}

/** Live device presence — visible only while the cloud DB is connected. */
function OnlineWidget() {
  const { cloud, presence } = useApp();
  if (cloud.status !== "on" || presence.length === 0) return null;
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-100 bg-gradient-to-r from-sky-100/70 to-white px-4 py-3">
        <p className="flex items-center gap-2 font-display text-[15px] font-extrabold text-ink-900">
          <span className="anim-blink h-2 w-2 rounded-full bg-ok-500" /> Online Sekarang
        </p>
        <Chip tone="sky">{presence.length} perangkat</Chip>
      </div>
      <div className="flex gap-2.5 overflow-x-auto px-4 py-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {presence.map((p) => (
          <div key={p.deviceId} className="flex shrink-0 items-center gap-2.5 rounded-xl border border-ink-100 bg-white px-3 py-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <span className="relative">
              <InitialsAvatar name={p.name} seedKey={p.staffId ?? p.deviceId} size="h-9 w-9 text-[12px]" rounded="rounded-xl" />
              <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-ok-500" />
            </span>
            <div className="min-w-0">
              <p className="max-w-[120px] truncate text-[12px] font-extrabold text-ink-900">{p.name}</p>
              <p className="text-[9.5px] font-bold text-ink-400">{p.siteName ?? "HQ"} · {relTime(p.lastSeen)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
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
    return [...counts.entries()].filter(([, c]) => c.n >= 1)
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
          <p key={e!.staffId} className="text-[12.5px] leading-snug font-bold text-warn-600">{e!.name} — {n}× ditolak dalam 7 hari{why ? ` (${why})` : ""}</p>
        ))}
      </div>
      <p className="mt-2 text-[10.5px] font-semibold text-warn-600/75">Pola penolakan berulang dapat mengindikasikan upaya titip absen.</p>
    </section>
  );
}

export default function DashboardView({ nav }: { nav: NavFn }) {
  const { session, employees, logs, breaks, leaves, company, activeSite, shifts, geo, decideLeave, audit } = useApp();
  const toast = useToast();
  const today = todayKey();
  const [geoMode, setGeoMode] = useState<"map" | "radar">("map");

  const siteStaff = employees.filter((e) => e.status === "active" && (e.role === "employee" || e.role === "manager") && (e.siteId === activeSite.id || e.siteId === null));
  const todayLogs = useMemo(() => logs.filter((l) => l.siteId === activeSite.id && wibDayKey(new Date(l.ts)) === today), [logs, today, activeSite.id]);

  const kpi = useMemo(() => {
    const verifiedIn = new Map<string, AttendanceLog>();
    for (const l of [...todayLogs].reverse()) if (l.type === "IN" && l.status === "VERIFIED" && !verifiedIn.has(l.staffId)) verifiedIn.set(l.staffId, l);
    let late = 0;
    for (const [staffId, log] of verifiedIn) {
      const emp = employees.find((e) => e.staffId === staffId);
      const sh = emp ? shifts.find((s) => s.id === emp.shiftId) : null;
      if (sh && sh.id !== "sh-fleks" && wibMinutes(log.ts) > Number(sh.start.slice(0, 2)) * 60 + Number(sh.start.slice(3)) + sh.graceMin) late++;
    }
    return {
      hadir: verifiedIn.size, late,
      belum: Math.max(0, siteStaff.length - verifiedIn.size),
      rejected: todayLogs.filter((l) => l.status === "REJECTED").length,
    };
  }, [todayLogs, siteStaff, employees, shifts]);

  const mvp = useMemo(() => siteStaff.map((e) => {
    let hadir = 0, late = 0, streak = 0;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const s = daySummary(e.staffId, wibDayKey(d), logs, breaks, leaves, shifts, e.shiftId, company.holidays);
      if (s.inTs) { hadir++; if (s.lateMin > 0) late++; }
    }
    for (let i = 0; i < 60; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const s = daySummary(e.staffId, wibDayKey(d), logs, breaks, leaves, shifts, e.shiftId, company.holidays);
      if (i === 0 && !s.inTs) continue;
      if (s.inTs || s.kind === "holiday" || s.kind === "leave") streak++;
      else break;
    }
    return { e, hadir, late, streak, score: hadir * 10 - late * 3 + streak * 2 };
  }).sort((a, b) => b.score - a.score).slice(0, 3), [siteStaff, logs, breaks, leaves, shifts, company.holidays]);

  const deptStats = useMemo(() => {
    const map = new Map<string, { hadir: number; total: number }>();
    for (const e of siteStaff) {
      const s = map.get(e.department) ?? { hadir: 0, total: 0 };
      s.total++;
      if (todayLogs.some((l) => l.staffId === e.staffId && l.type === "IN" && l.status === "VERIFIED")) s.hadir++;
      map.set(e.department, s);
    }
    return [...map.entries()];
  }, [siteStaff, todayLogs]);

  const weekly = useMemo(() => {
    const days: Array<{ label: string; count: number; isToday: boolean }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = wibDayKey(d);
      const label = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "short" }).format(d).replace(".", "");
      days.push({ label, count: logs.filter((l) => l.siteId === activeSite.id && l.type === "IN" && l.status === "VERIFIED" && wibDayKey(new Date(l.ts)) === key).length, isToday: i === 0 });
    }
    return days;
  }, [logs, activeSite.id]);
  const maxCount = Math.max(1, ...weekly.map((w) => w.count));

  const hrQueue = useMemo(() => leaves.filter((l) => l.status === "pending_hr").sort((a, b) => b.createdAt - a.createdAt), [leaves]);
  const feed = todayLogs.slice(0, 8);

  const exportRange = (days: number, label: string) => {
    const from = Date.now() - days * 86400_000;
    const rows = logs.filter((l) => l.siteId === activeSite.id && l.ts >= from);
    downloadTextFile(`laporan-${activeSite.shortName}-${label}-${today}.csv`, buildCsv(rows), "text/csv;charset=utf-8");
    toast.push("ok", "Laporan diekspor", `${rows.length} catatan · ${label}`);
    audit("REPORT_EXPORT", "logs", `${label} · ${rows.length} catatan · ${activeSite.shortName}`);
  };

  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">Dashboard HR</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-400">{wibShortDate(new Date())} · {activeSite.name} · radius {activeSite.radiusM} m</p>
        </div>
        <div className="flex gap-1.5">
          <button className="btn-ghost !rounded-xl !px-3 !py-2.5 !text-[12px]" onClick={() => nav("kendali")}>
            <IconCpu size={14} /> R. Kendali
          </button>
          <button className="btn-sun !rounded-xl !px-3 !py-2.5 !text-[12px]" onClick={() => nav("pengguna")}>
            <IconPlus size={14} /> Staff
          </button>
        </div>
      </div>

      <OpsTicker />

      <div className="grid grid-cols-2 gap-2.5 min-[420px]:grid-cols-4">
        <StatTile label="Hadir" value={kpi.hadir} tone="ok" sub={`dari ${siteStaff.length}`} />
        <StatTile label="Telat" value={kpi.late} tone="warn" sub="hari ini" />
        <StatTile label="Belum" value={kpi.belum} tone="sky" sub="belum masuk" />
        <StatTile label="Ditolak" value={kpi.rejected} tone="danger" sub="geofence" />
      </div>

      {/* live presence */}
      <OnlineWidget />

      {/* MVP */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-100 bg-gradient-to-r from-sun-100/70 to-white px-4 py-3">
          <p className="flex items-center gap-2 font-display text-[15px] font-extrabold text-ink-900"><IconFlame size={17} className="text-sun-600" /> MVP Minggu Ini</p>
          <Chip tone="ink">7 hari · {activeSite.shortName}</Chip>
        </div>
        <div className="divide-y divide-ink-100/70">
          {mvp.map((r, i) => (
            <div key={r.e.staffId} className="tile-pop flex items-center gap-3 px-4 py-3" style={{ animationDelay: `${i * 70}ms` }}>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-display text-[14px] font-extrabold text-white shadow ${["bg-gradient-to-br from-amber-300 to-amber-500", "bg-gradient-to-br from-slate-300 to-slate-400", "bg-gradient-to-br from-orange-300 to-orange-500"][i]}`}>{i + 1}</span>
              <InitialsAvatar name={r.e.name} photo={r.e.photo} seedKey={r.e.staffId} size="h-10 w-10 text-[13px]" rounded="rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-extrabold text-ink-900">{r.e.name}</p>
                <p className="text-[10.5px] font-bold text-ink-400">{r.e.position} · {r.e.department}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="chip-ok !px-2 !py-1 !text-[9.5px]">{r.hadir}/7 hadir</span>
                {r.streak > 1 && <span className="chip-coral !px-2 !py-1 !text-[9.5px]"><IconFlame size={9} /> {r.streak}</span>}
                {r.late > 0 && <span className="chip-warn !px-2 !py-1 !text-[9.5px]">{r.late}× telat</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <AnomalyWidget />

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
                <div className={`bar-grow w-full rounded-lg ${w.isToday ? "bg-gradient-to-t from-sun-600 to-sun-400" : "bg-ink-200"}`} style={{ height: `${Math.max(8, (w.count / maxCount) * 100)}%` }} />
              </div>
              <span className={`text-[10px] font-extrabold uppercase ${w.isToday ? "text-sun-700" : "text-ink-300"}`}>{w.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* HR queue */}
      <section>
        <SectionLabel right={<Chip tone={hrQueue.length ? "warn" : "ok"}>{hrQueue.length} menunggu</Chip>}>Persetujuan HR</SectionLabel>
        {hrQueue.length === 0 ? <p className="card px-4 py-5 text-center text-[13px] font-semibold text-ink-400">Semua pengajuan sudah diproses.</p> : (
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

      {/* geofence */}
      <section>
        <SectionLabel
          right={
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-full border border-ink-100 bg-white p-0.5">
                {(["map", "radar"] as const).map((m) => (
                  <button key={m} onClick={() => setGeoMode(m)} className={`cursor-pointer rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide uppercase transition ${geoMode === m ? "bg-ink-900 text-white shadow" : "text-ink-400 hover:text-ink-600"}`}>{m === "map" ? "Peta" : "Radar"}</button>
                ))}
              </div>
              <Chip tone="ink">{todayLogs.length} titik</Chip>
            </div>
          }
        >
          Peta Geofence
        </SectionLabel>
        {geoMode === "map"
          ? <GeofenceMap hq={{ lat: activeSite.hqLat, lon: activeSite.hqLon }} radiusM={activeSite.radiusM} points={todayLogs} live={geo} heightClass="h-[300px]" />
          : <Radar hq={{ lat: activeSite.hqLat, lon: activeSite.hqLon }} radiusM={activeSite.radiusM} points={todayLogs} live={geo} />}
      </section>

      {/* reports */}
      <section className="card p-4">
        <SectionLabel right={<IconFile size={16} className="text-ink-300" />}>Laporan</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          <button className="btn-soft !py-2.5 !text-[12px]" onClick={() => exportRange(1, "harian")}><IconDownload size={13} /> Harian</button>
          <button className="btn-soft !py-2.5 !text-[12px]" onClick={() => exportRange(7, "mingguan")}><IconDownload size={13} /> Mingguan</button>
          <button className="btn-soft !py-2.5 !text-[12px]" onClick={() => exportRange(30, "bulanan")}><IconDownload size={13} /> Bulanan</button>
        </div>
      </section>

      {/* feed */}
      <section>
        <SectionLabel right={<button onClick={() => nav("audit")} className="flex cursor-pointer items-center gap-1 text-[12px] font-extrabold text-sun-700 hover:underline">Audit <IconArrowRight size={12} /></button>}>
          Aktivitas Hari Ini
        </SectionLabel>
        {feed.length === 0 ? <p className="card px-4 py-5 text-center text-[13px] font-semibold text-ink-400">Belum ada aktivitas hari ini.</p> : (
          <div className="card divide-y divide-ink-100/80">
            {feed.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <InitialsAvatar name={l.name} seedKey={l.staffId} size="h-9 w-9 text-[12px]" rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink-900">
                    <span className="truncate">{l.name}</span>
                    <Chip tone={l.status === "REJECTED" ? "danger" : l.type === "IN" ? "sun" : "teal"} className="!px-1.5 !py-0.5 !text-[9px]">{l.status === "REJECTED" ? "DITOLAK" : l.type}</Chip>
                  </p>
                  <p className="truncate text-[11px] font-semibold text-ink-400">{l.reason ?? `${formatMeters(l.distanceM)} dari gudang · ${l.method === "face" ? "wajah" : "manual"}`} · {relTime(l.ts)}</p>
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
        <button className="card card-press flex items-center gap-3 p-3.5 text-left" onClick={() => nav("aturan")}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky-600"><IconPin size={18} /></span>
          <span className="text-[13px] font-extrabold text-ink-800">Geofence & Shift</span>
        </button>
      </div>
      {session ? null : null}
    </div>
  );
}
