/** Beranda — greeting hero, break timer, shift progress, quick actions,
 *  announcement teaser, team presence, personal stats. */
import { useEffect, useMemo, useState } from "react";
import { NavFn } from "../App";
import { useApp } from "../lib/store";
import { daySummary, SITE_STYLE, SiteColor } from "../lib/database";
import { formatMeters, GeoReading } from "../lib/geoUtils";
import { relTime, todayKey, wibClock, wibDate, wibDayKey, wibTime } from "../lib/format";
import { useToast } from "../components/Toast";
import { Chip, InitialsAvatar, SectionLabel } from "../components/bits";
import {
  IconArrowRight, IconBell, IconBriefcase, IconBuilding, IconCamera, IconCheck, IconClock, IconCoffee,
  IconFace, IconFlame, IconHistory, IconInfo, IconMoon, IconPin, IconSignal, IconStar, IconSun, IconUsers, IconWallet, IconX,
} from "../components/icons";

function partOfDay(h: number): "pagi" | "siang" | "sore" | "malam" {
  if (h < 11) return "pagi";
  if (h < 15) return "siang";
  if (h < 18.5) return "sore";
  return "malam";
}
const GREET: Record<string, string> = { pagi: "Selamat Pagi", siang: "Selamat Siang", sore: "Selamat Sore", malam: "Selamat Malam" };

function wibHourNow(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(new Date()));
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(iv);
  }, []);
  const part = partOfDay(wibHourNow());
  return (
    <>
      <p className="font-mono text-[38px] leading-none font-bold tracking-tight tabular-nums">
        {wibClock(now)} <span className="text-[15px] font-semibold text-white/60">WIB</span>
      </p>
      <p className="mt-1.5 text-[12px] font-semibold text-white/70">{wibDate(now)} · {GREET[part]}</p>
    </>
  );
}

function GeoChip({ geo }: { geo: GeoReading | null }) {
  const tone = !geo ? "warn" : geo.status === "locked" || geo.status === "sim" ? "ok" : geo.status === "denied" ? "danger" : "warn";
  const label = !geo ? "Mencari GPS…"
    : geo.status === "locked" || geo.status === "sim" ? `${geo.simulated ? "SIM" : "GPS"} · ±${Math.round(geo.accuracy)} m`
    : geo.status === "denied" ? "Izin lokasi ditolak" : "Mencari sinyal GPS…";
  return (
    <Chip tone={tone} className="border-white/25 bg-black/25 text-white backdrop-blur">
      <IconSignal size={11} /> {label}
    </Chip>
  );
}

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
        <div className="prog-fill h-full rounded-full bg-gradient-to-r from-sun-300 to-sun-500 shadow-[0_0_10px_rgba(255,198,132,0.6)]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9.5px] font-bold text-white/55 tabular-nums">
        <span>{start}</span><span>{end}</span>
      </div>
    </div>
  );
}

function BreakCard() {
  const { activeBreak, startBreak, endBreak } = useApp();
  const toast = useToast();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!activeBreak) return;
    const iv = window.setInterval(() => tick((t) => t + 1), 1000);
    return () => window.clearInterval(iv);
  }, [activeBreak]);

  if (!activeBreak) {
    return (
      <button className="card card-press flex w-full cursor-pointer items-center gap-3 p-3.5 text-left" onClick={() => { startBreak(); toast.push("info", "Istirahat dimulai", "Timer berjalan — akhiri saat kembali."); }}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-600"><IconCoffee size={18} /></span>
        <span className="flex-1">
          <span className="block text-[13px] font-extrabold text-ink-900">Mulai Istirahat</span>
          <span className="block text-[10.5px] font-semibold text-ink-400">Dipotong otomatis dari jam kerja</span>
        </span>
        <IconArrowRight size={15} className="text-ink-300" />
      </button>
    );
  }
  const sec = Math.max(0, Math.floor((Date.now() - activeBreak.start) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return (
    <div className="card flex items-center gap-3 border-teal-300 bg-teal-100/50 p-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-500 text-white"><IconCoffee size={18} /></span>
      <div className="flex-1">
        <p className="text-[13px] font-extrabold text-ink-900">Sedang istirahat</p>
        <p className="font-mono text-[16px] font-bold text-teal-600 tabular-nums">{mm}:{ss}</p>
      </div>
      <button className="btn-teal !rounded-xl !px-3.5 !py-2 !text-[12px]" onClick={() => { endBreak(); toast.push("ok", "Istirahat selesai", "Kerja semangat lagi!"); }}>Akhiri</button>
    </div>
  );
}

function StatsCard({ staffId }: { staffId: string }) {
  const { logs, breaks, leaves, shifts, company, leaveQuotas } = useApp();
  const year = new Date().getFullYear();
  const stats = useMemo(() => {
    let inDays = 0, late = 0, workMin = 0, otMin = 0;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const s = daySummary(staffId, wibDayKey(d), logs, breaks, leaves, shifts, shifts.find((x) => x.id)?.id ?? "sh-pagi", company.holidays);
      if (s.inTs) { inDays++; if (s.lateMin > 0) late++; workMin += s.workMin; otMin += s.overtimeMin; }
    }
    let streak = 0;
    const myShiftId = logs.length ? undefined : undefined;
    void myShiftId;
    for (let i = 0; i < 60; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const s = daySummary(staffId, wibDayKey(d), logs, breaks, leaves, shifts, "sh-pagi", company.holidays);
      if (i === 0 && !s.inTs) continue;
      if (s.inTs || s.kind === "holiday" || s.kind === "leave") streak++;
      else break;
    }
    return { inDays, late, workMin, otMin, streak, punctual: inDays ? Math.round(((inDays - late) / inDays) * 100) : 100 };
  }, [staffId, logs, breaks, leaves, shifts, company.holidays]);

  const usedTahunan = leaves.filter((l) => l.staffId === staffId && l.type === "Tahunan" && l.status !== "rejected" && l.date.startsWith(String(year))).reduce((a, l) => a + l.days, 0);

  return (
    <section>
      <SectionLabel right={<Chip tone="coral"><IconFlame size={11} /> {stats.streak} hari beruntun</Chip>}>Performa 7 Hari</SectionLabel>
      <div className="grid grid-cols-2 gap-2.5 min-[420px]:grid-cols-4">
        <div className="card card-press p-3 text-center">
          <p className="font-display text-[24px] leading-none font-extrabold text-ink-900">{stats.inDays}<span className="text-[12px] text-ink-400">/7</span></p>
          <p className="mt-1 text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">Hadir</p>
        </div>
        <div className="card card-press p-3 text-center">
          <p className="font-display text-[24px] leading-none font-extrabold text-ok-600">{stats.punctual}%</p>
          <p className="mt-1 text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">Tepat waktu</p>
        </div>
        <div className="card card-press p-3 text-center">
          <p className="font-display text-[24px] leading-none font-extrabold text-sky-600">{Math.floor(stats.workMin / 60)}<span className="text-[12px]">j</span></p>
          <p className="mt-1 text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">Jam kerja</p>
        </div>
        <div className="card card-press p-3 text-center">
          <p className="font-display text-[24px] leading-none font-extrabold text-sun-700">{stats.otMin}<span className="text-[12px]">m</span></p>
          <p className="mt-1 text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">Lembur</p>
        </div>
      </div>
      <p className="mt-2 text-center text-[10.5px] font-bold text-ink-300">Sisa cuti tahunan: {Math.max(0, leaveQuotas.Tahunan - usedTahunan)} hari</p>
    </section>
  );
}

export default function HomeView({ nav }: { nav: NavFn }) {
  const { session, logs, leaves, employees, fence, geo, company, activeSite, shifts, board, ackBoard } = useApp();
  const toast = useToast();
  const me = session!;
  const today = todayKey();
  const part = partOfDay(wibHourNow());

  const myShift = shifts.find((s) => s.id === me.shiftId);
  const holiday = company.holidays.find((h) => h.date === today) ?? null;

  const myLogsToday = useMemo(
    () => logs.filter((l) => l.staffId === me.staffId && wibDayKey(new Date(l.ts)) === today && l.status === "VERIFIED"),
    [logs, me.staffId, today],
  );
  const inLog = [...myLogsToday].reverse().find((l) => l.type === "IN");
  const outLog = [...myLogsToday].reverse().find((l) => l.type === "OUT" && (!inLog || l.ts >= inLog.ts));

  const unreadPost = useMemo(
    () => board.find((p) => (p.siteId === null || p.siteId === activeSite.id) && !p.acks.includes(me.staffId)) ?? null,
    [board, activeSite.id, me.staffId],
  );

  const teamToday = useMemo(
    () => employees.filter((e) => (e.role === "employee" || e.role === "manager") && e.status === "active").map((e) => {
      const theirs = logs.filter((l) => l.staffId === e.staffId && wibDayKey(new Date(l.ts)) === today && l.status === "VERIFIED");
      const tIn = [...theirs].reverse().find((l) => l.type === "IN");
      const tOut = [...theirs].reverse().find((l) => l.type === "OUT" && (!tIn || l.ts >= tIn.ts));
      return { e, tIn, tOut };
    }),
    [employees, logs, today],
  );

  const myActivity = logs.filter((l) => l.staffId === me.staffId).slice(0, 4);

  const quick = [
    { label: "Absensi", icon: <IconCamera size={18} />, tint: "bg-sun-100 text-sun-600", onClick: () => nav("absen", inLog && !outLog ? "OUT" : "IN") },
    { label: "Cuti", icon: <IconBriefcase size={18} />, tint: "bg-sky-100 text-sky-600", onClick: () => nav("cuti") },
    { label: "Pengumuman", icon: <IconBell size={18} />, tint: "bg-coral-100 text-coral-600", onClick: () => nav("pengumuman") },
    { label: "Struktur", icon: <IconBuilding size={18} />, tint: "bg-grape-100 text-grape-600", onClick: () => nav("org") },
    { label: "Gaji", icon: <IconWallet size={18} />, tint: "bg-teal-100 text-teal-600", onClick: () => nav("gaji") },
    { label: "Riwayat", icon: <IconHistory size={18} />, tint: "bg-ink-100 text-ink-600", onClick: () => nav("riwayat") },
  ];

  const hasFace = !!me.descriptor || !!me.hash;

  return (
    <div className="space-y-5 pb-2">
      {/* hero */}
      <section className={`relative overflow-hidden rounded-[26px] p-5 text-white shadow-[0_24px_60px_rgba(240,115,0,0.28)] ${part === "malam" ? "grad-night" : "grad-morning"}`}>
        <div className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -right-3 top-5 opacity-90">
          {part === "malam" ? <IconMoon size={52} className="floaty text-sun-300" /> : <IconSun size={52} className="floaty text-sun-300" />}
        </div>
        <div className="relative">
          <div className="flex items-center gap-3">
            <InitialsAvatar name={me.name} photo={me.photo} seedKey={me.staffId} size="h-12 w-12 text-[16px]" rounded="rounded-2xl" />
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-white/75">{me.staffId} · {activeSite.shortName}</p>
              <h1 className="truncate font-display text-[22px] leading-tight font-extrabold">Halo, {me.name.split(" ")[0]}!</h1>
            </div>
          </div>
          <div className="mt-4"><LiveClock /></div>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-black/20 p-3 backdrop-blur-sm">
              <p className="text-[10px] font-extrabold tracking-[0.12em] text-white/65 uppercase">Check-In</p>
              {inLog ? <p className="mt-1 flex items-center gap-1.5 font-mono text-[19px] font-bold tabular-nums"><IconCheck size={15} className="text-ok-500" /> {wibTime(new Date(inLog.ts))}</p>
                : <p className="mt-1 font-mono text-[19px] font-bold text-white/40">—:—</p>}
            </div>
            <div className="rounded-2xl bg-black/20 p-3 backdrop-blur-sm">
              <p className="text-[10px] font-extrabold tracking-[0.12em] text-white/65 uppercase">Check-Out</p>
              {outLog ? <p className="mt-1 flex items-center gap-1.5 font-mono text-[19px] font-bold tabular-nums"><IconCheck size={15} className="text-ok-500" /> {wibTime(new Date(outLog.ts))}</p>
                : <p className="mt-1 font-mono text-[19px] font-bold text-white/40">—:—</p>}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip tone="ink" className="border-white/25 bg-black/25 text-white backdrop-blur"><IconClock size={11} /> {myShift?.name ?? "Shift"}</Chip>
            {fence && <Chip tone={fence.inside ? "ok" : "danger"} className="border-white/25 bg-black/25 text-white backdrop-blur"><IconPin size={11} /> {formatMeters(fence.distanceM)} dari {activeSite.shortName}</Chip>}
            <GeoChip geo={geo} />
          </div>

          {holiday && (
            <p className="mt-3 flex items-center gap-2 rounded-2xl bg-black/20 px-3.5 py-2.5 text-[12.5px] font-bold text-white/90 backdrop-blur-sm">
              <IconStar size={15} className="shrink-0 text-sun-300" /> Hari ini libur: {holiday.name}
            </p>
          )}
          {myShift && myShift.id !== "sh-fleks" && !holiday && <ShiftProgress start={myShift.start} end={myShift.end} />}

          {!inLog ? (
            <button className="btn-sun mt-4 w-full !py-4 text-base" onClick={() => nav("absen", "IN")}><IconCamera size={19} /> Check-In Sekarang</button>
          ) : !outLog ? (
            <button className="btn-teal mt-4 w-full !py-4 text-base" onClick={() => nav("absen", "OUT")}><IconCamera size={19} /> Check-Out</button>
          ) : (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-black/20 py-3 text-[13px] font-bold text-white/85">
              <IconCheck size={16} className="text-ok-500" /> Shift tercatat lengkap hari ini
            </div>
          )}
        </div>
      </section>

      {/* reminders */}
      {!hasFace && (
        <button onClick={() => nav("profil")} className="card card-press flex w-full cursor-pointer items-center gap-3 border-sun-300 bg-sun-100/60 p-3.5 text-left">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sun-500 text-white"><IconFace size={20} /></span>
          <span className="flex-1 text-[13px] leading-snug font-bold text-ink-800">Foto tanda tangan belum ada — ambil sekarang agar absensi wajah aktif.</span>
          <IconArrowRight size={16} className="text-sun-600" />
        </button>
      )}

      <BreakCard />

      {/* announcement teaser */}
      {unreadPost && (
        <section className={`card anim-fade-up border-l-4 p-4 ${unreadPost.tone === "danger" ? "border-l-danger-500" : unreadPost.tone === "warn" ? "border-l-warn-500" : unreadPost.tone === "ok" ? "border-l-ok-500" : "border-l-sky-500"}`}>
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-600"><IconInfo size={17} /></span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink-900">
                <span className="truncate">{unreadPost.title}</span>
                <Chip tone="sky" className="!px-1.5 !py-0.5 !text-[8.5px]">BARU</Chip>
              </p>
              <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug font-semibold text-ink-400">{unreadPost.body}</p>
            </div>
          </div>
          <div className="mt-2.5 flex gap-2">
            <button className="btn-sun flex-1 !py-2 !text-[12px]" onClick={() => { ackBoard(unreadPost.id); toast.push("ok", "Sudah dibaca", "Konfirmasi Anda tercatat."); }}>
              <IconCheck size={13} /> Mengerti
            </button>
            <button className="btn-ghost flex-1 !py-2 !text-[12px]" onClick={() => nav("pengumuman")}>Selengkapnya <IconArrowRight size={12} /></button>
          </div>
        </section>
      )}

      {/* quick actions */}
      <section>
        <SectionLabel>Aksi Cepat</SectionLabel>
        <div className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-6">
          {quick.map((q) => (
            <button key={q.label} onClick={q.onClick} className="card card-press flex flex-col items-center gap-1.5 py-3">
              <span className={`grid h-10 w-10 place-items-center rounded-2xl ${q.tint}`}>{q.icon}</span>
              <span className="text-[10px] font-extrabold text-ink-700">{q.label}</span>
            </button>
          ))}
        </div>
      </section>

      {(me.role === "employee" || me.role === "manager") && <StatsCard staffId={me.staffId} />}

      {/* team presence */}
      <section>
        <SectionLabel right={<Chip tone="ink">{teamToday.filter((t) => t.tIn).length}/{teamToday.length} hadir</Chip>}>Tim Hari Ini</SectionLabel>
        <div className="card divide-y divide-ink-100/80">
          {teamToday.map(({ e, tIn, tOut }, i) => (
            <div key={e.staffId} className="tile-pop flex items-center gap-3 px-3.5 py-2.5" style={{ animationDelay: `${i * 40}ms` }}>
              <InitialsAvatar name={e.name} photo={e.photo} seedKey={e.staffId} size="h-9 w-9 text-[12px]" rounded="rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-extrabold text-ink-900">{e.name}</p>
                <p className="font-mono text-[10.5px] font-semibold text-ink-400">{e.staffId} · {shifts.find((s) => s.id === e.shiftId)?.name ?? "—"}</p>
              </div>
              {tIn ? (
                tOut ? <Chip tone="ink"><IconCheck size={10} /> {wibTime(new Date(tIn.ts))}–{wibTime(new Date(tOut.ts))}</Chip>
                  : <Chip tone="ok"><IconCheck size={10} /> Masuk {wibTime(new Date(tIn.ts))}</Chip>
              ) : (
                <Chip tone="warn">Belum hadir</Chip>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* my activity */}
      <section className="pb-2">
        <SectionLabel right={<button onClick={() => nav("riwayat")} className="flex cursor-pointer items-center gap-1 text-[12px] font-extrabold text-sun-700 hover:underline">Semua <IconArrowRight size={12} /></button>}>Aktivitasku</SectionLabel>
        {myActivity.length === 0 ? (
          <p className="card px-4 py-5 text-center text-[13px] font-semibold text-ink-400">Belum ada aktivitas — mulai dengan Check-In.</p>
        ) : (
          <div className="card divide-y divide-ink-100/80">
            {myActivity.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${l.status === "REJECTED" ? "bg-danger-100 text-danger-600" : l.type === "IN" ? "bg-sun-100 text-sun-600" : "bg-teal-100 text-teal-600"}`}>
                  {l.status === "REJECTED" ? <IconX size={15} /> : <IconCheck size={15} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-extrabold text-ink-900">{l.type === "IN" ? "Check-In" : "Check-Out"} {l.status === "REJECTED" ? "· Ditolak" : ""}</p>
                  <p className="text-[11px] font-semibold text-ink-400">{relTime(l.ts)} · {formatMeters(l.distanceM)} dari gudang</p>
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


