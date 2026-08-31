/**
 * Ruang Kendali — full-screen dark live-operations board for the warehouse.
 * Giant WIB clock, live headcounts, roster status wall, streaming event feed.
 */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { SITE_STYLE } from "../lib/database";
import { formatMeters } from "../lib/geoUtils";
import { relTime, wibDayKey, todayKey } from "../lib/format";
import { InitialsAvatar } from "../components/bits";
import { IconArrowRight, IconClock, IconCoffee, IconFlame, IconX } from "../components/icons";

function nowParts() {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => String(f.find((p) => p.type === t)?.value ?? "00");
  return { h: g("hour"), m: g("minute"), s: g("second") };
}

export default function LiveOpsView({ onExit }: { onExit: () => void }) {
  const { employees, logs, breaks, shifts, activeSite, company, fence } = useApp();
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(iv);
  }, []);
  const { h, m, s } = nowParts();
  const today = todayKey();
  const st = SITE_STYLE[activeSite.color];

  const staff = useMemo(
    () => employees.filter((e) => e.status === "active" && (e.role === "employee" || e.role === "manager") && (e.siteId === null || e.siteId === activeSite.id)),
    [employees, activeSite.id],
  );

  const rows = useMemo(() => {
    const wibMin = Number(h) * 60 + Number(m);
    return staff.map((e) => {
      const day = (t: "IN" | "OUT") =>
        logs.find((l) => l.staffId === e.staffId && l.type === t && l.status === "VERIFIED" && wibDayKey(new Date(l.ts)) === today);
      const inLog = day("IN");
      const outLog = day("OUT");
      const onBreak = breaks.some((b) => b.staffId === e.staffId && b.day === today && !b.end);
      const sh = shifts.find((x) => x.id === e.shiftId);
      let late = false;
      if (inLog && sh && sh.id !== "sh-fleks") {
        const start = Number(sh.start.slice(0, 2)) * 60 + Number(sh.start.slice(3));
        const inMin = new Date(inLog.ts);
        const im = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(inMin)) * 60 +
          Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", minute: "2-digit" }).format(inMin));
        late = im > start + sh.graceMin;
      }
      let status: "onshift" | "break" | "late" | "notin" | "done" = "notin";
      if (inLog && !outLog) status = onBreak ? "break" : late ? "late" : "onshift";
      else if (inLog && outLog) status = "done";
      else if (sh && sh.id !== "sh-fleks") {
        const start = Number(sh.start.slice(0, 2)) * 60 + Number(sh.start.slice(3));
        const end = Number(sh.end.slice(0, 2)) * 60 + Number(sh.start.slice(3));
        const inWin = end > start ? wibMin >= start && wibMin <= end : wibMin >= start || wibMin <= end;
        if (!inWin) status = "done"; // off-shift window
      }
      return { e, inLog, status, sh };
    });
  }, [staff, logs, breaks, shifts, today, h, m]);

  const counts = useMemo(() => {
    const c = { onshift: 0, break: 0, late: 0, notin: 0, done: 0 };
    rows.forEach((r) => { c[r.status]++; });
    return c;
  }, [rows]);

  const feed = useMemo(() => logs.filter((l) => wibDayKey(new Date(l.ts)) === today).slice(0, 9), [logs, today]);

  const statusMeta: Record<string, { label: string; dot: string; text: string }> = {
    onshift: { label: "DI SHIFT", dot: "bg-emerald-400", text: "text-emerald-300" },
    break: { label: "ISTIRAHAT", dot: "bg-amber-400", text: "text-amber-300" },
    late: { label: "TERLAMBAT", dot: "bg-orange-400", text: "text-orange-300" },
    notin: { label: "BELUM MASUK", dot: "bg-rose-400", text: "text-rose-300" },
    done: { label: "SELESAI", dot: "bg-slate-500", text: "text-slate-400" },
  };

  return (
    <div className="ops-bg min-h-dvh text-slate-200">
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
        {/* header */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`relative grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br ${st.grad} text-white shadow-lg`}>
              <span className="absolute inset-0 rounded-2xl bg-white/20 halo-pulse" />
              <IconClock size={20} />
            </span>
            <div>
              <p className="font-display text-[20px] leading-none font-extrabold tracking-wide text-white">RUANG KENDALI</p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                <span className={`h-2 w-2 rounded-full ${st.dot}`} /> {activeSite.name} · {company.shortName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10.5px] font-extrabold tracking-widest text-emerald-300 sm:inline-flex">
              <span className="anim-blink h-1.5 w-1.5 rounded-full bg-emerald-400" /> LIVE
            </span>
            {fence && (
              <span className={`hidden rounded-full px-3 py-1.5 text-[10.5px] font-extrabold md:inline-block ${fence.inside ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
                GPS {formatMeters(fence.distanceM)}
              </span>
            )}
            <button
              onClick={onExit}
              className="grid h-10 w-10 cursor-pointer place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white active:scale-90"
              aria-label="Keluar dari ruang kendali"
            >
              <IconX size={17} />
            </button>
          </div>
        </header>

        {/* clock + counters */}
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="ops-panel relative overflow-hidden rounded-3xl p-6">
            <span className="scan-line" />
            <p className="text-[10.5px] font-extrabold tracking-[0.22em] text-slate-500 uppercase">Waktu Indonesia Barat</p>
            <p className="mt-2 font-mono text-[64px] leading-none font-bold tracking-tight text-white tabular-nums sm:text-[84px]">
              {h}:{m}<span className="text-slate-500">:{s}</span>
            </p>
            <p className="mt-3 text-[13px] font-bold capitalize text-slate-400">
              {new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}
            </p>
            {/* counters */}
            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {([
                ["Di Shift", counts.onshift, "text-emerald-300", "border-emerald-500/25 bg-emerald-500/10"],
                ["Istirahat", counts.break, "text-amber-300", "border-amber-500/25 bg-amber-500/10"],
                ["Terlambat", counts.late, "text-orange-300", "border-orange-500/25 bg-orange-500/10"],
                ["Belum Masuk", counts.notin, "text-rose-300", "border-rose-500/25 bg-rose-500/10"],
              ] as const).map(([label, n, txt, brd]) => (
                <div key={label} className={`rounded-2xl border px-3.5 py-3 ${brd}`}>
                  <p className={`font-display text-[30px] leading-none font-extrabold tabular-nums ${txt}`}>{n}</p>
                  <p className="mt-1 text-[9.5px] font-extrabold tracking-[0.14em] text-slate-400 uppercase">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* event feed */}
          <div className="ops-panel flex flex-col overflow-hidden rounded-3xl">
            <p className="border-b border-white/5 px-5 py-3.5 text-[10.5px] font-extrabold tracking-[0.22em] text-slate-500 uppercase">
              Arus Aktivitas Hari Ini
            </p>
            <div className="flex-1 space-y-1 overflow-y-auto px-3 py-2" style={{ maxHeight: 300 }}>
              {feed.length === 0 && <p className="px-2 py-6 text-center text-[12px] font-bold text-slate-500">Belum ada aktivitas.</p>}
              {feed.map((l, i) => (
                <div key={l.id} className="tile-pop flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-white/5" style={{ animationDelay: `${i * 50}ms` }}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${l.status === "REJECTED" ? "bg-rose-400" : l.type === "IN" ? "bg-emerald-400" : "bg-sky-400"}`} />
                  <p className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-300">
                    {l.name} <span className="text-slate-500">· {l.status === "REJECTED" ? "ditolak" : l.type === "IN" ? "masuk" : "pulang"}</span>
                  </p>
                  <span className="font-mono text-[10.5px] font-bold text-slate-500 tabular-nums">{relTime(l.ts)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* roster wall */}
        <div className="ops-panel mt-4 overflow-hidden rounded-3xl">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3.5">
            <p className="text-[10.5px] font-extrabold tracking-[0.22em] text-slate-500 uppercase">Status Staf — {staff.length} orang</p>
            <p className="flex items-center gap-1.5 text-[10.5px] font-extrabold text-slate-500"><IconCoffee size={13} /> {counts.break} rehat</p>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4">
            {rows.map((r, i) => {
              const meta = statusMeta[r.status];
              return (
                <div key={r.e.staffId} className="tile-pop flex items-center gap-2.5 rounded-2xl border border-white/5 bg-white/[0.03] p-2.5 transition hover:border-white/15 hover:bg-white/[0.06]" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="relative shrink-0">
                    <InitialsAvatar name={r.e.name} photo={r.e.photo} seedKey={r.e.staffId} size="h-10 w-10 text-[13px]" rounded="rounded-xl" />
                    <span className={`absolute -right-1 -bottom-1 h-3 w-3 rounded-full border-2 border-[#101826] ${meta.dot}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-extrabold text-white">{r.e.name}</p>
                    <p className={`flex items-center gap-1 text-[9px] font-extrabold tracking-wider ${meta.text}`}>
                      {r.status === "break" && <IconCoffee size={9} />}
                      {meta.label}
                      {r.inLog && r.status !== "notin" && (
                        <span className="font-mono text-slate-500 normal-case">
                          · {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(r.inLog.ts))}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button onClick={onExit} className="mx-auto mt-5 flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-[12px] font-extrabold text-slate-300 transition hover:bg-white/10 hover:text-white active:scale-95">
          Kembali ke Dashboard <IconArrowRight size={14} />
        </button>
        <span className="hidden"><IconFlame size={1} /></span>
      </div>
    </div>
  );
}
