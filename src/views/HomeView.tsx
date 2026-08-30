/**
 * Beranda (Staff/Manager) — greeting hero with live WIB clock, break timer,
 * shift countdown, quick actions, weekly schedule strip, personal stats
 * (hours ring, punctuality, streak, overtime), team presence, activity.
 */
import { useEffect, useMemo, useState } from "react";
import { NavFn } from "../App";
import { useApp } from "../lib/store";
import { daySummary, LEAVE_QUOTAS, leaveUsed } from "../lib/database";
import { formatMeters, GeoReading } from "../lib/geoUtils";
import { fmtDuration, relTime, todayKey, wibClock, wibDate, wibDayKey, wibTime } from "../lib/format";
import { Chip, InitialsAvatar, SectionLabel } from "../components/bits";
import {
  IconArrowRight, IconBriefcase, IconCamera, IconCheck, IconClock, IconCoffee,
  IconFace, IconFlame, IconHistory, IconMoon, IconPin, IconSignal, IconStar, IconSun, IconUsers, IconWallet, IconX,
} from "../components/icons";

function partOfDay(h: number): "pagi" | "siang" | "sore" | "malam" {
  if (h < 11) return "pagi";
  if (h < 15) return "siang";
  if (h < 18.5) return "sore";
  return "malam";
}
const GREET: Record<string, string> = {
  pagi: "Selamat Pagi", siang: "Selamat Siang", sore: "Selamat Sore", malam: "Selamat Malam",
};

function wibHourNow(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(new Date()));
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(iv);
  }, []);
  return (
    <>
      <p className="font-mono text-[38px] leading-none font-bold tracking-tight tabular-nums">
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
      : geo.status === "denied" ? "Izin lokasi ditolak" : "Mencari sinyal GPS…";
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

/** Personal performance stats for the last 7 days. */
function StatsCard({ staffId }: { staffId: string }) {
  const { logs, breaks, leaves, shifts, session, company } = useApp();
  const me = session!;
  const shiftId = me.shiftId;

  const stats = useMemo(() => {
    let workMin = 0, lateMin = 0, otMin = 0, inDays = 0, lateDays = 0;
    const days = 7;
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const s = daySummary(staffId, wibDayKey(d), logs, breaks, leaves, shifts, shiftId, company.holidays);
      if (s.inTs) {
        inDays++;
        workMin += s.workMin;
        otMin += s.overtimeMin;
        if (s.lateMin > 0) { lateMin += s.lateMin; lateDays++; }
      }
    }
    let streak = 0;
    // today counts only if already clocked in
    if (daySummary(staffId, todayKey(), logs, breaks, leaves, shifts, shiftId, company.holidays).inTs === null) {
      for (let i = 1; i < 60; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const s = daySummary(staffId, wibDayKey(d), logs, breaks, leaves, shifts, shiftId, company.holidays);
        if (s.inTs) streak++;
        else break;
      }
    } else {
      streak = 1;
      for (let i = 1; i < 60; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const s = daySummary(staffId, wibDayKey(d), logs, breaks, leaves, shifts, shiftId, company.holidays);
        if (s.inTs) streak++;
        else break;
      }
    }
    const punctual = inDays ? Math.round(((inDays - lateDays) / inDays) * 100) : 100;
    return { workMin, lateMin, otMin, streak, punctual, inDays };
  }, [staffId, logs, breaks, leaves, shifts, shiftId, company.holidays]);

  const target = 40 * 60;
  const pct = Math.min(100, Math.round((stats.workMin / target) * 100));
  const circ = 2 * Math.PI * 15.5;

  return (
    <section className="card p-4">
      <SectionLabel right={<Chip tone="sun">7 hari terakhir</Chip>}>Statistik Saya</SectionLabel>
      <div className="flex items-center gap-4">
        <div className="relative grid h-20 w-20 shrink-0 place-items-center">
          <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-ink-100)" strokeWidth="3.5" />
            <circle
              cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-sun-500)" strokeWidth="3.5" strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * circ} ${circ}`}
              style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.22,1,0.36,1)" }}
            />
          </svg>
          <span className="absolute text-center">
            <span className="block font-display text-[15px] leading-none font-extrabold text-ink-900">{pct}%</span>
            <span className="block text-[8.5px] font-extrabold tracking-wide text-ink-400 uppercase">40 jam</span>
          </span>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2">
          <div>
            <p className="text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">Jam kerja</p>
            <p className="font-display text-[17px] leading-tight font-extrabold text-ink-900">{fmtDuration(stats.workMin)}</p>
          </div>
          <div>
            <p className="text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">Tepat waktu</p>
            <p className={`font-display text-[17px] leading-tight font-extrabold ${stats.punctual >= 90 ? "text-ok-600" : stats.punctual >= 70 ? "text-warn-600" : "text-danger-600"}`}>{stats.punctual}%</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase"><IconFlame size={10} className="text-coral-500" /> Streak</p>
            <p className="font-display text-[17px] leading-tight font-extrabold text-ink-900">{stats.streak} hari</p>
          </div>
          <div>
            <p className="text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">Lembur</p>
            <p className="font-display text-[17px] leading-tight font-extrabold text-ink-900">{fmtDuration(stats.otMin)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** This week's shifts & holidays at a glance. */
function WeekStrip() {
  const { session, shifts, company, leaves } = useApp();
  const me = session!;
  const shift = shifts.find((s) => s.id === me.shiftId);
  const today = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1 + i); // Monday-first
    const key = wibDayKey(d);
    const dow = d.getDay();
    const holiday = company.holidays?.find((h) => h.date === key) ?? null;
    const onLeave = leaves.some((l) => l.staffId === me.staffId && l.status === "approved" && l.date <= key && key <= l.date);
    return { key, label: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][dow], num: d.getDate(), isToday: key === today, weekend: dow === 0 || dow === 6, holiday, onLeave };
  });
  return (
    <section className="card p-4">
      <SectionLabel right={shift && shift.id !== "sh-fleks" ? <Chip tone="sun">{shift.name} · {shift.start}–{shift.end}</Chip> : <Chip tone="ink">Fleksibel</Chip>}>
        Jadwal Minggu Ini
      </SectionLabel>
      <div className="flex gap-1.5">
        {days.map((d) => (
          <div
            key={d.key}
            className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 ${
              d.isToday ? "bg-sun-500 text-white shadow-[0_8px_18px_rgba(240,115,0,0.35)]" : d.holiday ? "bg-grape-100 text-grape-600" : d.weekend ? "bg-ink-50 text-ink-400" : "bg-ink-50 text-ink-700"
            }`}
          >
            <span className="text-[9px] font-extrabold tracking-wide uppercase">{d.label}</span>
            <span className="font-display text-[15px] leading-none font-extrabold">{d.num}</span>
            {d.holiday ? <IconStar size={10} /> : d.onLeave ? <IconBriefcase size={10} /> : d.isToday || !d.weekend ? <span className={`h-1 w-1 rounded-full ${d.isToday ? "bg-white" : "bg-ok-500"}`} /> : <span className="h-1 w-1" />}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Break start/stop card with live timer. */
function BreakCard() {
  const { activeBreak, startBreak, endBreak, breaks } = useApp();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!activeBreak) return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [activeBreak]);

  const today = todayKey();
  const doneToday = breaks.filter((b) => b.day === today && b.end).reduce((a, b) => a + (b.end! - b.start), 0);

  if (activeBreak) {
    const secs = Math.floor((now - activeBreak.start) / 1000);
    const hh = String(Math.floor(secs / 3600)).padStart(2, "0");
    const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    return (
      <div className="card card-press border-warn-300 bg-warn-100/70 p-4">
        <div className="flex items-center gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-warn-500 text-white"><IconCoffee size={20} /></span>
          <div className="flex-1">
            <p className="text-[12px] font-extrabold text-warn-600">Sedang istirahat</p>
            <p className="font-mono text-[24px] leading-tight font-bold text-ink-900 tabular-nums">{hh}:{mm}:{ss}</p>
          </div>
          <button className="btn-sun !rounded-xl !px-4 !py-2.5 text-[13px]" onClick={endBreak}>Selesai</button>
        </div>
      </div>
    );
  }
  return (
    <div className="card card-press flex items-center gap-3.5 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink-100 text-ink-500"><IconCoffee size={20} /></span>
      <div className="flex-1">
        <p className="text-[13px] font-extrabold text-ink-900">Istirahat</p>
        <p className="text-[11px] font-semibold text-ink-400">Terpakai hari ini: {fmtDuration(Math.round(doneToday / 60000))}</p>
      </div>
      <button className="btn-ghost !rounded-xl !px-4 !py-2.5 text-[13px]" onClick={startBreak}>Mulai</button>
    </div>
  );
}

export default function HomeView({ nav }: { nav: NavFn }) {
  const { session, logs, breaks, leaves, employees, fence, geo, company, shifts } = useApp();
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
  const pendingCount = leaves.filter((l) => l.staffId === me.staffId && l.status === "pending" || l.status === "pending_hr").filter((l) => l.staffId === me.staffId).length;

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
  const part = partOfDay(wibHourNow() + 0.25);
  const hasFace = !!me.descriptor || !!me.hash;

  const quick = [
    { label: "Absensi", icon: <IconCamera size={18} />, tint: "bg-sun-100 text-sun-600", onClick: () => nav("absen", inLog && !outLog ? "OUT" : "IN") },
    { label: "Cuti", icon: <IconBriefcase size={18} />, tint: "bg-sky-100 text-sky-600", onClick: () => nav("cuti") },
    { label: "Gaji", icon: <IconWallet size={18} />, tint: "bg-teal-100 text-teal-600", onClick: () => nav("gaji") },
    { label: "Riwayat", icon: <IconHistory size={18} />, tint: "bg-grape-100 text-grape-600", onClick: () => nav("riwayat") },
  ];

  return (
    <div className="space-y-5">
      {/* greeting hero */}
      <section className={`relative overflow-hidden rounded-[26px] p-5 text-white shadow-[0_24px_60px_rgba(23,42,89,0.25)] ${part === "malam" ? "grad-night" : "grad-morning"}`}>
        <div className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -right-4 top-6 opacity-90">
          {part === "malam" ? <IconMoon size={54} className="text-sun-300" /> : <IconSun size={54} className="text-sun-300" />}
        </div>

        <div className="relative">
          <div className="flex items-center gap-3">
            <InitialsAvatar name={me.name} photo={me.photo} seedKey={me.staffId} size="h-12 w-12 text-[16px]" />
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-white/75">{me.staffId} · {me.department} · {me.position}</p>
              <h1 className="truncate font-display text-[23px] leading-tight font-extrabold">Halo, {me.name.split(" ")[0]}!</h1>
            </div>
          </div>

          <div className="mt-4"><LiveClock /></div>

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
            {myShift && <Chip tone="ink" className="border-white/25 bg-black/25 text-white backdrop-blur"><IconClock size={11} /> {myShift.name}</Chip>}
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

      <BreakCard />

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

      <WeekStrip />

      {(me.role === "employee" || me.role === "manager") && <StatsCard staffId={me.staffId} />}

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
                <p className="font-mono text-[10.5px] font-semibold text-ink-400">{e.staffId} · {e.department}</p>
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

      {/* activity */}
      <section>
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
      </section>

    </div>
  );
}
