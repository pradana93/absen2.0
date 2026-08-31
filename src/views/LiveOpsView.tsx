/** Ruang Kendali — full-bleed dark ops board: live clock, headcounts,
 *  roster wall, streaming event feed, geofence status. */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { SITE_STYLE, SiteColor } from "../lib/database";
import { formatMeters } from "../lib/geoUtils";
import { relTime, todayKey, wibClock, wibDayKey, wibTime } from "../lib/format";
import { IconArrowRight, IconCheck, IconClock, IconCoffee, IconPin, IconX } from "../components/icons";

export default function LiveOpsView({ onExit }: { onExit: () => void }) {
  const { company, activeSite, employees, logs, breaks, geo, fence, shifts } = useApp();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(iv);
  }, []);
  const today = todayKey();

  const staff = useMemo(() => employees.filter((e) => (e.role === "employee" || e.role === "manager") && e.status === "active"), [employees]);

  const rows = useMemo(() => staff.map((e) => {
    const dayLogs = logs.filter((l) => l.staffId === e.staffId && wibDayKey(new Date(l.ts)) === today && l.status === "VERIFIED");
    const tIn = [...dayLogs].reverse().find((l) => l.type === "IN");
    const tOut = [...dayLogs].reverse().find((l) => l.type === "OUT" && (!tIn || l.ts >= tIn.ts));
    const onBreakNow = breaks.some((b) => b.staffId === e.staffId && b.day === today && !b.end);
    const sh = shifts.find((s) => s.id === e.shiftId);
    let late = false;
    if (tIn && sh && sh.id !== "sh-fleks") {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(tIn.ts));
      const mins = (Number(parts.find((p) => p.type === "hour")?.value) % 24) * 60 + Number(parts.find((p) => p.type === "minute")?.value);
      late = mins > Number(sh.start.slice(0, 2)) * 60 + Number(sh.start.slice(3)) + sh.graceMin;
    }
    return { e, tIn, tOut, onBreakNow, late };
  }), [staff, logs, breaks, shifts, today]);

  const onShift = rows.filter((r) => r.tIn && !r.tOut).length;
  const onBreak = rows.filter((r) => r.onBreakNow).length;
  const notIn = rows.filter((r) => !r.tIn).length;
  const lateN = rows.filter((r) => r.late).length;
  const feed = logs.slice(0, 9);

  const stat = (label: string, value: number, cls: string, sub: string) => (
    <div className="ops-panel rounded-2xl p-4">
      <p className="text-[10px] font-extrabold tracking-[0.18em] text-white/40 uppercase">{label}</p>
      <p className={`mt-1 font-display text-[38px] leading-none font-extrabold tabular-nums ${cls}`}>{value}</p>
      <p className="mt-1 text-[10.5px] font-bold text-white/35">{sub}</p>
    </div>
  );

  return (
    <div className="ops-bg min-h-dvh text-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-5">
        {/* header */}
        <div className="anim-fade-up flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[10px] font-extrabold tracking-[0.24em] text-sun-300 uppercase">
              <span className="anim-blink h-2 w-2 rounded-full bg-ok-500" /> Ruang Kendali · Live
            </p>
            <h1 className="font-display text-[28px] leading-tight font-extrabold">{company.appName} — {activeSite.name}</h1>
          </div>
          <div className="text-right">
            <p className="font-mono text-[42px] leading-none font-bold tabular-nums">{wibClock(now)}</p>
            <p className="mt-1 text-[11px] font-extrabold tracking-widest text-white/40 uppercase">WIB · {wibDayKey(new Date())}</p>
          </div>
          <button onClick={onExit} className="btn-ghost !border-white/15 !bg-white/5 !px-4 !py-2.5 !text-[12.5px] !text-white hover:!bg-white/10">
            <IconArrowRight size={14} className="rotate-180" /> Kembali
          </button>
        </div>

        {/* stats */}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stat("Di Shift", onShift, "text-ok-500", "sedang bekerja")}
          {stat("Istirahat", onBreak, "text-sky-300", "break berjalan")}
          {stat("Belum Hadir", notIn, "text-warn-300", "dari total staff")}
          {stat("Terlambat", lateN, "text-danger-400", "masuk lewat grace")}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          {/* roster wall */}
          <div className="ops-panel anim-fade-up rounded-2xl p-4">
            <p className="mb-3 flex items-center justify-between text-[11px] font-extrabold tracking-[0.18em] text-white/40 uppercase">
              Status Roster <span className="font-mono text-white/25">{rows.length} staff</span>
            </p>
            <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
              {rows.map((r) => {
                const st = r.onBreakNow ? "BREAK" : r.tIn && !r.tOut ? "ON" : r.tOut ? "DONE" : "OFF";
                const cls = st === "ON" ? "bg-ok-500/15 text-ok-500" : st === "BREAK" ? "bg-sky-500/15 text-sky-300" : st === "DONE" ? "bg-white/10 text-white/50" : "bg-danger-500/10 text-danger-400";
                return (
                  <div key={r.e.staffId} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${st === "ON" ? "anim-blink bg-ok-500" : st === "BREAK" ? "bg-sky-300" : st === "DONE" ? "bg-white/40" : "bg-danger-400"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-extrabold">{r.e.name}</p>
                      <p className="font-mono text-[10px] font-bold text-white/35">{r.e.staffId} · {shifts.find((s) => s.id === r.e.shiftId)?.name ?? "—"}</p>
                    </div>
                    {r.tIn && <span className="font-mono text-[11px] font-bold text-white/60 tabular-nums">IN {wibTime(new Date(r.tIn.ts))}{r.late ? " ⚠" : ""}</span>}
                    {r.tOut && <span className="font-mono text-[11px] font-bold text-white/40 tabular-nums">OUT {wibTime(new Date(r.tOut.ts))}</span>}
                    <span className={`w-16 rounded-md px-2 py-1 text-center text-[9px] font-extrabold tracking-wider ${cls}`}>{st}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            {/* geofence status */}
            <div className="ops-panel anim-fade-up rounded-2xl p-4">
              <p className="mb-2.5 text-[11px] font-extrabold tracking-[0.18em] text-white/40 uppercase">Geofence</p>
              <div className="flex items-center gap-3">
                <span className={`grid h-11 w-11 place-items-center rounded-xl ${fence?.inside ? "bg-ok-500/20 text-ok-500" : "bg-danger-500/15 text-danger-400"}`}><IconPin size={20} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-extrabold">{activeSite.shortName} · radius {activeSite.radiusM} m</p>
                  <p className="font-mono text-[11px] font-bold text-white/40">
                    {fence ? `${formatMeters(fence.distanceM)} dari HQ · ${fence.inside ? "DI DALAM" : "DI LUAR"}` : "GPS mencari…"}
                    {geo?.simulated ? " · SIM" : ""}
                  </p>
                </div>
              </div>
              <div className={`mt-3 h-1.5 overflow-hidden rounded-full bg-white/10`}>
                <div className={`prog-fill h-full rounded-full ${fence?.inside ? "bg-ok-500" : "bg-danger-400"}`} style={{ width: `${fence ? Math.min(100, (fence.distanceM / (activeSite.radiusM * 2)) * 100) : 0}%` }} />
              </div>
            </div>

            {/* event feed */}
            <div className="ops-panel anim-fade-up rounded-2xl p-4">
              <p className="mb-3 flex items-center justify-between text-[11px] font-extrabold tracking-[0.18em] text-white/40 uppercase">
                <span className="flex items-center gap-1.5"><IconClock size={12} /> Aktivitas Terbaru</span>
                <span className="font-mono text-white/25">{logs.length} log</span>
              </p>
              <div className="space-y-1.5">
                {feed.map((l) => (
                  <div key={l.id} className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                    {l.status === "REJECTED" ? <IconX size={13} className="shrink-0 text-danger-400" /> : l.type === "IN" ? <IconCheck size={13} className="shrink-0 text-ok-500" /> : <IconCoffee size={13} className="shrink-0 text-sky-300" />}
                    <p className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-white/75">
                      {l.name} · {l.type}{l.status === "REJECTED" ? " DITOLAK" : ""}
                    </p>
                    <span className="shrink-0 font-mono text-[10px] font-bold text-white/35 tabular-nums">{wibTime(new Date(l.ts))} · {relTime(l.ts)}</span>
                  </div>
                ))}
                {feed.length === 0 && <p className="py-4 text-center text-[11.5px] font-bold text-white/30">Belum ada aktivitas.</p>}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-5 text-center font-mono text-[10px] font-bold tracking-widest text-white/25 uppercase">
          {company.appName} · {SITE_STYLE[(activeSite.color as SiteColor) ?? "sun"].chip ? activeSite.shortName : ""} · mesin SQL lokal · v7.0
        </p>
      </div>
    </div>
  );
}
