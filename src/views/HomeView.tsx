/**
 * Beranda — greeting hero with live WIB clock, break timer, shift
 * countdown + progress, personal stats, quick actions, team presence
 * and recent activity.
 */
import { useEffect, useMemo, useState } from "react";
import { NavFn } from "../App";
import { useApp } from "../lib/store";
import { daySummary, LEAVE_QUOTAS, leaveUsed } from "../lib/database";
import { formatMeters, GeoReading } from "../lib/geoUtils";
import { fmtDuration, relTime, todayKey, wibClock, wibDate, wibDayKey, wibTime } from "../lib/format";
import { Chip, InitialsAvatar, SectionLabel } from "../components/bits";
import {
  IconArrowRight, IconBriefcase, IconBuilding, IconCamera, IconCheck, IconClock, IconCoffee,
  IconFace, IconFlame, IconHistory, IconMoon, IconPin, IconSignal, IconStar, IconSun, IconUsers, IconWallet, IconX,
} from "../components/icons";

function wibHourNow(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(new Date()));
}

function partOfDay(h: number): "pagi" | "siang" | "sore" | "malam" {
  if (h < 11) return "pagi";
  if (h < 15) return "siang";
  if (h < 18.5) return "sore";
  return "malam";
}
const GREET: Record<string, string> = {
  pagi: "Selamat Pagi", siang: "Selamat Siang", sore: "Selamat Sore", malam: "Selamat Malam",
};

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(iv);
  }, []);
  return (
    <>
      <p className="font-mono text-[38px] leading-none font-bold tracking-tight text-white tabular-nums">
        {wibClock(now)} <span className="text-[15px] font-semibold text-white/60">WIB</span>
      </p>
      <p className="mt-1.5 text-[12px] font-semibold text-white/70">{wibDate(now)}</p>
    </>
  );
}

function GeoChip({ geo }: { geo: GeoReading | null }) {
  const tone = !geo ? "warn" : geo.status === "locked" || geo.status === "sim" ? "ok" : geo.status === "denied" ? "danger" : "warn";
  const label = !geo
    ? "Mencari GPS…"
    : geo.status === "locked" || geo.status === "sim"
      ? `${geo.simulated ? "SIM" : "GPS"} · ±${Math.round(geo.accuracy)} m`
      : geo.status === "denied"
        ? "Izin lokasi ditolak"
        : "Mencari sinyal GPS…";
  return (
    <Chip tone={tone} className="border-white/25 bg-black/25 text-white backdrop-blur">
      <IconSignal size={11} /> {label}
    </Chip>
  );
}

/** Live countdown relative to the shift window. */
function ShiftCountdown({ start, end, graceMin }: { start: string; end: string; graceMin: number }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(iv);
  }, []);
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const wibMin = wibHourNow() * 60 + Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", minute: "2-digit" }).format(now));
  const s = toMin(start);
  const en = toMin(end);
  let text = "";
  if (wibMin < s) {
    const d = s - wibMin;
    text = `Shift mulai ${Math.floor(d / 60)}j ${String(d % 60).padStart(2, "0")}m lagi`;
  } else if (wibMin <= s + graceMin) {
    text = "Jendela grace — absen sekarang tepat waktu";
  } else if ((en > s && wibMin <= en) || (en < s && wibMin >= s)) {
    text = "Sedang dalam jam shift";
  } else if (en > s && wibMin > en) {
    text = `Lembur +${wibMin - en} mnt dari jadwal`;
  } else {
    text = "Di luar jam shift";
  }
  return (
    <Chip tone="ink" className="border-white/25 bg-black/25 text-white backdrop-blur">
      <IconClock size={11} /> {text}
    </Chip>
  );
}

/** Live progress bar across the shift window (handles overnight shifts). */
function ShiftProgress({ start, end }: { start: string; end: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(iv);
  }, []);
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const wibMin = wibHourNow() * 60 + Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", minute: "2-digit" }).format(now));
  const s = toMin(start);
  const en = toMin(end);
  const span = en > s ? en - s : 24 * 60 - s + en;
  const elapsed = en > s ? wibMin - s : (wibMin >= s ? wibMin - s : 24 * 60 - s + wibMin);
  const pct = Math.max(0, Math.min(100, Math.round((elapsed / span) * 100)));
  return (
    <div className="mt-3.5 rounded-2xl bg-black/20 px-3.5 py-2.5 backdrop-blur-sm">
      <div className="flex items-center justify-between text-[10px] font-extrabold tracking-wide text-white/75 uppercase">
        <span>Progress shift</span>
        <span className="font-mono !text-[11px] text-white tabular-nums">{pct}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/20">
        <div
          className="prog-fill h-full rounded-full bg-gradient-to-r from-sun-300 to-sun-500 shadow-[0_0_10px_rgba(255,198,132,0.6)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9.5px] font-bold text-white/55 tabular-nums">
        <span>{start}</span><span>{end}</span>
      </div>
    </div>
  );
}

/** Personal performance stats for the last 7 days. */
function StatsCard({ staffId }: { staffId: string }) {
  const { logs, breaks, leaves, shifts, session, company } = useApp();
  const me = session!;
  const shiftId = me.shiftId;

  const stats = useMemo(() => {
    let workMin = 0, lateDays = 0, inDays = 0, streak = 0, otMin = 0;
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const s = daySummary(staffId, wibDayKey(d), logs, breaks, leaves, shifts, shiftId, company.holidays);
      if (s.inTs) {
        inDays++;
        workMin += s.workMin;
        otMin += s.overtimeMin;
        if (s.lateMin > 0) lateDays++;
      }
    }
    // streak: walk back from today; leave & holidays don't break it
    for (let i = 0; i < 60; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (i === 0 && daySummary(staffId, todayKey(), logs, breaks, leaves, shifts, shiftId, company.holidays).inTs === null) continue;
      const s = daySummary(staffId, wibDayKey(d), logs, breaks, leaves, shifts, shiftId, company.holidays);
      if (s.inTs || s.kind === "work" || s.kind === "holiday" || s.kind === "leave") streak++;
      else break;
    }
    const punctual = inDays ? Math.round(((inDays - lateDays) / inDays) * 100) : 100;
    return { workMin, punctual, streak, otMin };
  }, [staffId, logs, breaks, leaves, shifts, shiftId, company.holidays]);

  const ring = Math.min(100, Math.round((stats.workMin / (40 * 60)) * 100));

  return (
    <section className="card anim-fade-up p-4">
      <SectionLabel right={<Chip tone="sun">7 hari terakhir</Chip>}>Statistik Saya</SectionLabel>
      <div className="flex items-center gap-4">
        {/* hours ring */}
        <div className="relative grid h-24 w-24 shrink-0 place-items-center">
          <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-ink-100)" strokeWidth="3.6" />
            <circle
              cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-sun-500)" strokeWidth="3.6" strokeLinecap="round"
              strokeDasharray={`${(ring / 100) * 97.4} 97.4`}
            />
          </svg>
          <div className="absolute text-center">
            <p className="font-display text-[17px] leading-none font-extrabold text-ink-900">{Math.floor(stats.workMin / 60)}j</p>
            <p className="text-[8.5px] font-extrabold tracking-wide text-ink-400 uppercase">dari 40j</p>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-2">
          <div className="rounded-xl bg-ok-100/70 px-3 py-2">
            <p className="text-[9px] font-extrabold tracking-wide text-ok-600 uppercase">Tepat waktu</p>
            <p className="font-display text-[18px] leading-tight font-extrabold text-ok-600">{stats.punctual}%</p>
          </div>
          <div className="rounded-xl bg-coral-100/70 px-3 py-2">
            <p className="flex items-center gap-1 text-[9px] font-extrabold tracking-wide text-coral-600 uppercase"><IconFlame size={10} /> Streak</p>
            <p className="font-display text-[18px] leading-tight font-extrabold text-coral-600">{stats.streak} hari</p>
          </div>
          <div className="col-span-2 rounded-xl bg-sun-100/70 px-3 py-2">
            <p className="text-[9px] font-extrabold tracking-wide text-sun-700 uppercase">Lembur minggu ini</p>
            <p className="font-display text-[15px] leading-tight font-extrabold text-sun-700">{fmtDuration(stats.otMin)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Break card with live timer. */
function BreakCard() {
  const { activeBreak, startBreak, endBreak } = useApp();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!activeBreak) return;
    const iv = window.setInterval(() => tick((t) => t + 1), 1000);
    return () => window.clearInterval(iv);
  }, [activeBreak]);

  const elapsed = activeBreak ? Math.max(0, Math.floor((Date.now() - activeBreak.start) / 1000)) : 0;
  const hh = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <section className={`card anim-fade-up flex items-center gap-3.5 p-4 ${activeBreak ? "border-warn-300 bg-warn-100/50" : ""}`}>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${activeBreak ? "bg-warn-500 text-white" : "bg-ink-100 text-ink-500"}`}>
        <IconCoffee size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-extrabold text-ink-900">Istirahat</p>
        {activeBreak ? (
          <p className="font-mono text-[17px] font-bold text-warn-600 tabular-nums">{hh}:{mm}:{ss}</p>
        ) : (
          <p className="text-[11.5px] font-semibold text-ink-400">Jeda terpotong otomatis dari jam kerja</p>
        )}
      </div>
      {activeBreak ? (
        <button className="btn-sun !rounded-xl !px-4 !py-2.5 !text-[13px]" onClick={endBreak}>Akhiri</button>
      ) : (
        <button className="btn-soft !rounded-xl !px-4 !py-2.5 !text-[13px]" onClick={startBreak}>Mulai</button>
      )}
    </section>
  );
}

/** This week's shift strip. */
function WeekStrip() {
  const { session, shifts, company, logs } = useApp();
  const me = session!;
  const myShift = shifts.find((s) => s.id === me.shiftId);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1 + i); // Monday-based
    return d;
  });
  const today = todayKey();
  return (
    <section className="card anim-fade-up p-4">
      <SectionLabel right={<Chip tone="ink">{myShift?.name ?? "—"}</Chip>}>Jadwal Minggu Ini</SectionLabel>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = wibDayKey(d);
          const isToday = key === today;
          const dow = d.getDay();
          const holiday = company.holidays?.find((h) => h.date === key);
          const worked = logs.some((l) => l.staffId === me.staffId && l.type === "IN" && l.status === "VERIFIED" && wibDayKey(new Date(l.ts)) === key);
          const off = dow === 0 || dow === 6 || !!holiday;
          return (
            <div key={key} className={`flex flex-col items-center gap-1 rounded-xl py-2 ${isToday ? "bg-sun-100 ring-2 ring-sun-400" : "bg-ink-50"}`}>
              <span className="text-[8.5px] font-extrabold tracking-wide text-ink-400 uppercase">
                {new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "short" }).format(d).replace(".", "")}
              </span>
              <span className={`font-display text-[13px] font-extrabold ${isToday ? "text-sun-700" : "text-ink-700"}`}>{d.getDate()}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${worked ? "bg-ok-500" : off ? "bg-grape-300" : "bg-ink-200"}`} />
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] font-bold text-ink-300">● hadir · ● libur/akhir pekan · ● jadwal</p>
    </section>
  );
}

export default function HomeView({ nav }: { nav: NavFn }) {
  const { session, logs, leaves, employees, fence, geo, company, shifts } = useApp();
  const me = session!;
  const today = todayKey();
  const myShift = shifts.find((s) => s.id === me.shiftId);
  const holiday = company.holidays?.find((h) => h.date === today) ?? null;

  const myLogsToday = useMemo(
    () => logs.filter((l) => l.staffId === me.staffId && wibDayKey(new Date(l.ts)) === today && l.status === "VERIFIED"),
    [logs, me.staffId, today],
  );
  const inLog = [...myLogsToday].reverse().find((l) => l.type === "IN");
  const outLog = [...myLogsToday].reverse().find((l) => l.type === "OUT" && (!inLog || l.ts >= inLog.ts));
  const rejectedToday = logs.some((l) => l.staffId === me.staffId && l.status === "REJECTED" && wibDayKey(new Date(l.ts)) === today);

  const year = new Date().getFullYear();
  const usedDays = leaveUsed(leaves, me.staffId, year, "Tahunan");
  const pendingCount = leaves.filter((l) => l.staffId === me.staffId && (l.status === "pending" || l.status === "pending_hr")).length;

  const teamToday = useMemo(
    () =>
      employees
        .filter((e) => (e.role === "employee" || e.role === "manager") && e.status === "active")
        .map((e) => {
          const theirs = logs.filter((l) => l.staffId === e.staffId && wibDayKey(new Date(l.ts)) === today && l.status === "VERIFIED");
          const tIn = [...theirs].reverse().find((l) => l.type === "IN");
          const tOut = [...theirs].reverse().find((l) => l.type === "OUT" && (!tIn || l.ts >= tIn.ts));
          return { e, tIn, tOut };
        }),
    [employees, logs, today],
  );

  const myActivity = logs.filter((l) => l.staffId === me.staffId).slice(0, 4);

  const hasFace = !!me.descriptor || !!me.hash;
  const part = partOfDay(wibHourNow());

  const quick = [
    { label: "Absensi", icon: <IconCamera size={18} />, tint: "bg-sun-100 text-sun-600", onClick: () => nav("absen", inLog && !outLog ? "OUT" : "IN") },
    { label: "Cuti", icon: <IconBriefcase size={18} />, tint: "bg-sky-100 text-sky-600", onClick: () => nav("cuti") },
    { label: "Struktur", icon: <IconBuilding size={18} />, tint: "bg-coral-100 text-coral-600", onClick: () => nav("org") },
    { label: "Riwayat", icon: <IconHistory size={18} />, tint: "bg-grape-100 text-grape-600", onClick: () => nav("riwayat") },
  ];

  return (
    <div className="space-y-5">
      {/* ------------------------------ greeting ----------------------------- */}
      <section className={`relative overflow-hidden rounded-[24px] p-5 text-white shadow-lg ${part === "malam" ? "grad-night" : "grad-morning"}`}>
        <div className="pointer-events-none absolute -top-10 -right-10 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -right-4 top-6 opacity-90">
          {part === "malam" ? <IconMoon size={54} className="text-sun-300" /> : <IconSun size={54} className="text-sun-300" />}
        </div>

        <div className="relative">
          <div className="flex items-center gap-3">
            <InitialsAvatar name={me.name} photo={me.photo} seedKey={me.staffId} size="h-12 w-12 text-[16px]" rounded="rounded-2xl" />
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-white/75">{me.staffId} · {me.department}</p>
              <h1 className="truncate font-display text-[22px] leading-tight font-extrabold">Halo, {me.name.split(" ")[0]}!</h1>
            </div>
          </div>

          <div className="mt-4"><LiveClock /></div>
          <p className="mt-0.5 text-[13px] font-bold text-white/80">{GREET[part]} — semangat bekerja!</p>

          {/* hero: attendance state */}
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-black/20 p-3 backdrop-blur-sm">
              <p className="text-[10px] font-extrabold tracking-[0.12em] text-white/65 uppercase">Check-In</p>
              {inLog ? (
                <p className="mt-1 flex items-center gap-1.5 font-mono text-[19px] font-bold tabular-nums">
                  <IconCheck size={15} className="text-ok-300" /> {wibTime(new Date(inLog.ts))}
                </p>
              ) : (
                <p className="mt-1 font-mono text-[19px] font-bold text-white/40">—:—</p>
              )}
            </div>
            <div className="rounded-2xl bg-black/20 p-3 backdrop-blur-sm">
              <p className="text-[10px] font-extrabold tracking-[0.12em] text-white/65 uppercase">Check-Out</p>
              {outLog ? (
                <p className="mt-1 flex items-center gap-1.5 font-mono text-[19px] font-bold tabular-nums">
                  <IconCheck size={15} className="text-ok-300" /> {wibTime(new Date(outLog.ts))}
                </p>
              ) : (
                <p className="mt-1 font-mono text-[19px] font-bold text-white/40">—:—</p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip tone="ink" className="border-white/25 bg-black/25 text-white backdrop-blur">
              <IconClock size={11} /> {myShift?.name ?? "Shift"}{myShift && myShift.id !== "sh-fleks" ? ` · ${myShift.start}–${myShift.end}` : ""}
            </Chip>
            {fence && (
              <Chip tone={fence.inside ? "ok" : "danger"} className="border-white/25 bg-black/25 text-white backdrop-blur">
                <IconPin size={11} /> {formatMeters(fence.distanceM)} dari HQ
              </Chip>
            )}
            {myShift && myShift.id !== "sh-fleks" && (
              <ShiftCountdown start={myShift.start} end={myShift.end} graceMin={myShift.graceMin} />
            )}
            <GeoChip geo={geo} />
          </div>

          {holiday && (
            <p className="mt-3 flex items-center gap-2 rounded-2xl bg-black/20 px-3.5 py-2.5 text-[12.5px] font-bold text-white/90 backdrop-blur-sm">
              <IconStar size={15} className="shrink-0 text-sun-300" /> Hari ini libur: {holiday.name}
            </p>
          )}

          {myShift && myShift.id !== "sh-fleks" && !holiday && (
            <ShiftProgress start={myShift.start} end={myShift.end} />
          )}

          {!inLog ? (
            <button className="btn-sun mt-4 w-full !py-4 text-base" onClick={() => nav("absen", "IN")}>
              <IconCamera size={19} /> Check-In Sekarang
            </button>
          ) : !outLog ? (
            <button className="btn-teal mt-4 w-full !py-4 text-base" onClick={() => nav("absen", "OUT")}>
              <IconCamera size={19} /> Check-Out
            </button>
          ) : (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-black/20 py-3 text-[13px] font-bold text-white/85">
              <IconCheck size={16} className="text-ok-300" /> Shift tercatat lengkap hari ini
            </div>
          )}
        </div>
      </section>

      <BreakCard />

      {/* nudges */}
      {!hasFace && (
        <button onClick={() => nav("profil")} className="card card-press flex w-full cursor-pointer items-center gap-3 border-sun-300 bg-sun-100/60 p-3.5 text-left">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sun-500 text-white"><IconFace size={20} /></span>
          <span className="flex-1 text-[13px] leading-snug font-bold text-ink-800">
            Foto tanda tangan belum ada — ambil sekarang agar absensi wajah aktif.
          </span>
          <IconArrowRight size={16} className="text-sun-600" />
        </button>
      )}
      {rejectedToday && (
        <div className="card flex items-center gap-3 border-danger-300 bg-danger-100/70 p-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-danger-500 text-white"><IconX size={18} /></span>
          <p className="text-[13px] leading-snug font-bold text-danger-600">
            Ada percobaan absen yang ditolak hari ini — cek Riwayat untuk alasannya.
          </p>
        </div>
      )}

      {/* quick actions */}
      <section>
        <SectionLabel>Aksi Cepat</SectionLabel>
        <div className="grid grid-cols-4 gap-2.5">
          {quick.map((q) => (
            <button key={q.label} onClick={q.onClick} className="card card-press flex flex-col items-center gap-2 py-3.5">
              <span className={`grid h-11 w-11 place-items-center rounded-2xl ${q.tint}`}>{q.icon}</span>
              <span className="text-[11px] font-extrabold text-ink-700">{q.label}</span>
            </button>
          ))}
        </div>
      </section>

      <StatsCard staffId={me.staffId} />
      <WeekStrip />

      {/* cuti mini */}
      <section className="card flex items-center gap-4 p-4">
        <div className="relative grid h-14 w-14 shrink-0 place-items-center">
          <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-ink-100)" strokeWidth="4" />
            <circle
              cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-sun-500)" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${((LEAVE_QUOTAS.Tahunan - usedDays) / LEAVE_QUOTAS.Tahunan) * 97.4} 97.4`}
            />
          </svg>
          <span className="absolute font-display text-[15px] font-extrabold text-ink-900">{LEAVE_QUOTAS.Tahunan - usedDays}</span>
        </div>
        <div className="flex-1">
          <p className="font-display text-[15px] font-bold text-ink-900">Sisa Cuti Tahunan</p>
          <p className="text-[12px] font-semibold text-ink-400">
            {usedDays} hari terpakai · {pendingCount > 0 ? `${pendingCount} pengajuan menunggu` : "tidak ada pengajuan menunggu"}
          </p>
        </div>
        <button className="btn-soft !rounded-xl !px-3.5 !py-2 text-[12px]" onClick={() => nav("cuti")}>Ajukan</button>
      </section>

      {/* team presence */}
      <section>
        <SectionLabel right={<Chip tone="ink">{teamToday.filter((t) => t.tIn).length}/{teamToday.length} hadir</Chip>}>
          Tim Hari Ini
        </SectionLabel>
        <div className="card divide-y divide-ink-100/80">
          {teamToday.map(({ e, tIn, tOut }) => (
            <div key={e.staffId} className="flex items-center gap-3 px-3.5 py-2.5">
              <InitialsAvatar name={e.name} photo={e.photo} seedKey={e.staffId} size="h-9 w-9 text-[12px]" rounded="rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-extrabold text-ink-900">{e.name}</p>
                <p className="font-mono text-[10.5px] font-semibold text-ink-400">{e.staffId} · {shifts.find((s) => s.id === e.shiftId)?.name ?? "—"}</p>
              </div>
              {tIn ? (
                tOut ? (
                  <Chip tone="ink"><IconCheck size={10} /> {wibTime(new Date(tIn.ts))}–{wibTime(new Date(tOut.ts))}</Chip>
                ) : (
                  <Chip tone="ok"><IconCheck size={10} /> Masuk {wibTime(new Date(tIn.ts))}</Chip>
                )
              ) : (
                <Chip tone="warn">Belum hadir</Chip>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* my activity */}
      <section className="pb-2">
        <SectionLabel
          right={
            <button onClick={() => nav("riwayat")} className="flex cursor-pointer items-center gap-1 text-[12px] font-extrabold text-sun-700 hover:underline">
              Semua <IconArrowRight size={12} />
            </button>
          }
        >
          Aktivitasku
        </SectionLabel>
        {myActivity.length === 0 ? (
          <p className="card px-4 py-5 text-center text-[13px] font-semibold text-ink-400">Belum ada aktivitas — mulai dengan Check-In.</p>
        ) : (
          <div className="card divide-y divide-ink-100/80">
            {myActivity.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                  l.status === "REJECTED" ? "bg-danger-100 text-danger-600" : l.type === "IN" ? "bg-sun-100 text-sun-600" : "bg-teal-100 text-teal-600"
                }`}>
                  {l.status === "REJECTED" ? <IconX size={15} /> : <IconCheck size={15} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-extrabold text-ink-900">
                    {l.type === "IN" ? "Check-In" : "Check-Out"} {l.status === "REJECTED" ? "· Ditolak" : ""}
                  </p>
                  <p className="text-[11px] font-semibold text-ink-400">{relTime(l.ts)} · {formatMeters(l.distanceM)} dari HQ</p>
                </div>
                <span className="font-mono text-[12px] font-bold text-ink-500 tabular-nums">{wibTime(new Date(l.ts))}</span>
              </div>
            ))}
          </div>
        )}
        <span className="hidden"><IconUsers size={1} /><IconWallet size={1} /></span>
      </section>
    </div>
  );
}
