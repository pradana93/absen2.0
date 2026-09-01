/**
 * Shell — login gate, role-based dock (4 slots + camera FAB), Fitur sheet,
 * notifications, site switcher, maintenance mode, onboarding tour, ErrorNet.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AppProvider, useApp } from "./lib/store";
import { AttendanceType, ROLE_LABEL, Role, SITE_STYLE, SiteColor } from "./lib/database";
import { fmtExpLeft } from "./lib/jwt";
import { wibTime } from "./lib/format";
import { Chip, InitialsAvatar } from "./components/bits";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider, useToast } from "./components/Toast";
import OnboardingTour from "./components/OnboardingTour";
import FaceEnrollGate from "./components/FaceEnrollGate";
import LoginView from "./views/LoginView";
import HomeView from "./views/HomeView";
import DashboardView from "./views/DashboardView";
import AttendView from "./views/AttendView";
import HistoryView from "./views/HistoryView";
import EmployeesView from "./views/EmployeesView";
import CutiView from "./views/CutiView";
import PayslipView from "./views/PayslipView";
import ProfileView from "./views/ProfileView";
import SettingsView from "./views/SettingsView";
import AuditView from "./views/AuditView";
import OrgView from "./views/OrgView";
import LiveOpsView from "./views/LiveOpsView";
import PengumumanView from "./views/PengumumanView";
import MasterDataView, { LockedVault } from "./views/MasterDataView";
import {
  IconArrowRight, IconBell, IconBriefcase, IconBuilding, IconCamera, IconClipboard, IconCpu,
  IconDatabase, IconGear, IconGrid, IconHistory, IconHome, IconLock, IconLogoutIn, IconPin, IconShield, IconSignal, IconUsers, IconWallet, IconX,
} from "./components/icons";

export type ViewId =
  | "home" | "dashboard" | "absen" | "riwayat" | "pengguna" | "cuti" | "gaji"
  | "profil" | "aturan" | "audit" | "org" | "kendali" | "pengumuman" | "masterdata";
export type NavFn = (v: ViewId, type?: AttendanceType) => void;

interface TabDef { id: ViewId; label: string; icon: (s: number) => React.ReactNode; }
interface FeatureDef extends TabDef { desc: string; tint: string; group: string; }

const DOCK: Record<Role, TabDef[]> = {
  employee: [
    { id: "home", label: "Beranda", icon: (s) => <IconHome size={s} /> },
    { id: "riwayat", label: "Riwayat", icon: (s) => <IconHistory size={s} /> },
    { id: "cuti", label: "Cuti", icon: (s) => <IconBriefcase size={s} /> },
  ],
  manager: [
    { id: "home", label: "Beranda", icon: (s) => <IconHome size={s} /> },
    { id: "riwayat", label: "Riwayat", icon: (s) => <IconHistory size={s} /> },
    { id: "cuti", label: "Cuti", icon: (s) => <IconBriefcase size={s} /> },
  ],
  companyadmin: [
    { id: "dashboard", label: "Dashboard", icon: (s) => <IconHome size={s} /> },
    { id: "cuti", label: "Cuti", icon: (s) => <IconBriefcase size={s} /> },
    { id: "pengguna", label: "Pengguna", icon: (s) => <IconUsers size={s} /> },
  ],
  superadmin: [
    { id: "dashboard", label: "Dashboard", icon: (s) => <IconHome size={s} /> },
    { id: "pengguna", label: "Pengguna", icon: (s) => <IconUsers size={s} /> },
    { id: "audit", label: "Audit", icon: (s) => <IconClipboard size={s} /> },
  ],
};

const FEATURES: Record<Role, FeatureDef[]> = {
  employee: [
    { id: "gaji", label: "Gaji", group: "Keuangan", desc: "Slip & ringkasan", tint: "bg-teal-100 text-teal-600", icon: (s) => <IconWallet size={s} /> },
    { id: "pengumuman", label: "Pengumuman", group: "Info", desc: "Kabar & konfirmasi", tint: "bg-sky-100 text-sky-600", icon: (s) => <IconBell size={s} /> },
    { id: "org", label: "Struktur", group: "Perusahaan", desc: "Hierarki gudang", tint: "bg-coral-100 text-coral-600", icon: (s) => <IconBuilding size={s} /> },
    { id: "profil", label: "Profil", group: "Akun", desc: "Data diri & keamanan", tint: "bg-grape-100 text-grape-600", icon: (s) => <IconUsers size={s} /> },
  ],
  manager: [
    { id: "kendali", label: "R. Kendali", group: "Operasional", desc: "Papan live gudang", tint: "bg-ink-900 text-sun-300", icon: (s) => <IconCpu size={s} /> },
    { id: "gaji", label: "Gaji", group: "Keuangan", desc: "Slip & ringkasan", tint: "bg-teal-100 text-teal-600", icon: (s) => <IconWallet size={s} /> },
    { id: "pengumuman", label: "Pengumuman", group: "Info", desc: "Kabar & konfirmasi", tint: "bg-sky-100 text-sky-600", icon: (s) => <IconBell size={s} /> },
    { id: "org", label: "Struktur", group: "Perusahaan", desc: "Hierarki gudang", tint: "bg-coral-100 text-coral-600", icon: (s) => <IconBuilding size={s} /> },
    { id: "profil", label: "Profil", group: "Akun", desc: "Data diri & keamanan", tint: "bg-grape-100 text-grape-600", icon: (s) => <IconUsers size={s} /> },
  ],
  companyadmin: [
    { id: "kendali", label: "R. Kendali", group: "Operasional", desc: "Papan live gudang", tint: "bg-ink-900 text-sun-300", icon: (s) => <IconCpu size={s} /> },
    { id: "gaji", label: "Penggajian", group: "Operasional", desc: "Terbitkan slip", tint: "bg-teal-100 text-teal-600", icon: (s) => <IconWallet size={s} /> },
    { id: "pengumuman", label: "Pengumuman", group: "Info", desc: "Posting & pantau", tint: "bg-sky-100 text-sky-600", icon: (s) => <IconBell size={s} /> },
    { id: "org", label: "Struktur", group: "Perusahaan", desc: "Susun hierarki", tint: "bg-coral-100 text-coral-600", icon: (s) => <IconBuilding size={s} /> },
    { id: "aturan", label: "Aturan", group: "Perusahaan", desc: "Geofence & shift", tint: "bg-teal-100 text-teal-600", icon: (s) => <IconGear size={s} /> },
  ],
  superadmin: [
    { id: "masterdata", label: "Master Data", group: "Sistem", desc: "Data induk & SQL", tint: "bg-ink-900 text-sun-300", icon: (s) => <IconDatabase size={s} /> },
    { id: "kendali", label: "R. Kendali", group: "Operasional", desc: "Papan live gudang", tint: "bg-ink-900 text-sun-300", icon: (s) => <IconCpu size={s} /> },
    { id: "gaji", label: "Penggajian", group: "Operasional", desc: "Terbitkan slip", tint: "bg-teal-100 text-teal-600", icon: (s) => <IconWallet size={s} /> },
    { id: "pengumuman", label: "Pengumuman", group: "Info", desc: "Posting & pantau", tint: "bg-sky-100 text-sky-600", icon: (s) => <IconBell size={s} /> },
    { id: "org", label: "Struktur", group: "Perusahaan", desc: "Susun hierarki", tint: "bg-coral-100 text-coral-600", icon: (s) => <IconBuilding size={s} /> },
    { id: "aturan", label: "Aturan", group: "Sistem", desc: "Geofence & identitas", tint: "bg-teal-100 text-teal-600", icon: (s) => <IconGear size={s} /> },
  ],
};

const HOME: Record<Role, ViewId> = { employee: "home", manager: "home", companyadmin: "dashboard", superadmin: "dashboard" };

function geoTone(status?: string): "ok" | "warn" | "danger" | "ink" {
  if (status === "locked" || status === "sim") return "ok";
  if (status === "denied") return "danger";
  return "warn";
}
function geoLabel(status?: string, sim?: boolean): string {
  if (sim) return "GPS·SIM";
  if (status === "locked") return "GPS";
  if (status === "denied") return "GPS OFF";
  if (status === "unavailable") return "NO GPS";
  return "GPS…";
}

/** Live connection signal: ONLINE / OFFLINE / MENYAMBUNG… / SQL LOKAL — click for details. */
function DbStatusPill() {
  const { cloud, presence, cloudPullNow } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const onNetlify = /netlify\./.test(window.location.hostname);

  /* online = connected · offline = deployed but can't reach the DB ·
     connecting = probe in flight (or not yet started) · local = preview/localhost by design */
  const mode: "online" | "offline" | "connecting" | "local" =
    cloud.status === "on" ? "online"
    : !onNetlify ? "local"
    : cloud.status === "connecting" || (cloud.status === "off" && !cloud.reason) ? "connecting"
    : "offline";

  const cls =
    mode === "online" ? "border-ok-300 bg-ok-100/80 text-ok-600"
    : mode === "offline" ? "border-danger-300 bg-danger-100/80 text-danger-600"
    : mode === "connecting" ? "border-warn-300 bg-warn-100/80 text-warn-600"
    : "border-ink-200 bg-white text-ink-500";
  const label = mode === "online" ? "ONLINE" : mode === "offline" ? "OFFLINE" : mode === "connecting" ? "MENYAMBUNG…" : "SQL LOKAL";
  const dot =
    mode === "online" ? "anim-blink bg-ok-500"
    : mode === "offline" ? "bg-danger-500"
    : mode === "connecting" ? "animate-pulse bg-warn-500"
    : "bg-ink-300";
  const desc =
    mode === "online"
      ? "Tersambung ke server database (Postgres) — perubahan tim tersinkron antar perangkat otomatis (poll tiap 20 dtk)."
      : mode === "offline"
        ? cloud.reason ?? "Tidak dapat menghubungi server database. Perubahan sementara tersimpan di perangkat dan akan disinkron ulang saat kembali online."
        : mode === "connecting"
          ? "Sedang menghubungi server database…"
          : "Mode preview/localhost — fungsi cloud hanya hidup di URL Netlify yang ter-deploy, jadi di sini data selalu lokal.";

  const row = (k: string, v: string, strong?: boolean) => (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[10.5px] font-bold text-ink-400">{k}</span>
      <span className={`font-mono text-[11px] ${strong ? "font-extrabold text-ink-900" : "font-bold text-ink-600"}`}>{v}</span>
    </div>
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9.5px] font-extrabold tracking-wider transition active:scale-95 ${cls}`}
        aria-label="Status koneksi database"
        title="Status koneksi database"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="anim-pop absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-ink-100 bg-white p-4 shadow-[0_24px_60px_rgba(23,42,89,0.22)]">
            <p className="flex items-center gap-2 font-display text-[14px] font-extrabold text-ink-900">
              <span className={`h-2 w-2 rounded-full ${dot}`} />
              {mode === "online" ? "Online · Server DB" : mode === "offline" ? "Offline" : mode === "connecting" ? "Menghubungkan…" : "Database Lokal"}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed font-semibold text-ink-400">{desc}</p>

            {mode === "local" && (
              <div className="anim-fade-up mt-2.5 rounded-xl border border-warn-300 bg-warn-100 px-3 py-2.5">
                <p className="text-[11px] font-extrabold text-warn-600">👉 Buka URL Netlify Anda</p>
                <p className="mt-0.5 text-[10.5px] leading-snug font-semibold text-warn-600/85">
                  Fungsi cloud hanya hidup di <b>https://&lt;site-anda&gt;.netlify.app</b> —
                  preview/localhost seperti <span className="font-mono">{window.location.hostname}</span> selalu lokal.
                </p>
              </div>
            )}

            {mode === "offline" && (
              <div className="anim-fade-up mt-2.5 rounded-xl border border-danger-300 bg-danger-100 px-3 py-2.5">
                <p className="text-[11px] font-extrabold text-danger-600">Langkah memperbaiki:</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[10.5px] leading-snug font-semibold text-danger-600/85">
                  <li>Pastikan kode terbaru (dengan <span className="font-mono">netlify/functions/api.mjs</span>) sudah di-push & di-deploy</li>
                  <li>Env <span className="font-mono">DATABASE_URL</span> terpasang di site (lihat tombol di bawah)</li>
                  <li>Muat ulang halaman ini</li>
                </ol>
              </div>
            )}

            {mode === "online" && (
              <div className="mt-2.5 divide-y divide-ink-100/70 rounded-xl bg-ink-50 px-3 py-1">
                {row("Server", cloud.serverVersion ? `PG ${cloud.serverVersion.split(" ")[0]}` : "—")}
                {row("Baris cloud", cloud.rows.toLocaleString("id-ID"))}
                {row("Perangkat online", String(cloud.presenceActive || presence.length), true)}
                {row("Sinkron terakhir", cloud.lastSync ? wibTime(new Date(cloud.lastSync)) : "—")}
              </div>
            )}

            {mode === "online" && (
              <button
                className="btn-sun mt-3 w-full !py-2.5 !text-[12.5px]"
                onClick={async () => {
                  setOpen(false);
                  const ok = await cloudPullNow();
                  toast.push(ok ? "ok" : "danger", ok ? "Data cloud dimuat" : "Pull gagal", ok ? "Perubahan terbaru dari tim sudah masuk." : undefined);
                }}
              >
                <IconArrowRight size={13} className="rotate-180" /> Tarik Sekarang
              </button>
            )}

            {mode === "offline" && (
              <div className="mt-2 space-y-2">
                {(() => {
                  const m = window.location.hostname.match(/^([^.]+)\.netlify\.app$/);
                  if (!m) return null;
                  return (
                    <a
                      href={`https://app.netlify.com/sites/${m[1]}/configuration/environment-variables`}
                      target="_blank" rel="noreferrer"
                      className="btn-sun w-full !py-2.5 !text-[12.5px]"
                    >
                      <IconArrowRight size={13} /> Buka Environment Variables ↗
                    </a>
                  );
                })()}
                <button className="btn-ghost w-full !py-2 !text-[12px]" onClick={() => window.location.reload()}>Muat Ulang</button>
              </div>
            )}

            <p className="mt-2 text-center text-[9.5px] font-bold text-ink-300">Detail lengkap: Master Data → Cloud</p>
          </div>
        </>
      )}
    </div>
  );
}

function NotifBell() {
  const { session, notifs, markNotifsRead } = useApp();
  const [open, setOpen] = useState(false);
  const mine = useMemo(() => notifs.filter((n) => n.staffId === session?.staffId).sort((a, b) => b.ts - a.ts).slice(0, 12), [notifs, session?.staffId]);
  const unread = mine.filter((n) => !n.read).length;
  const toneDot: Record<string, string> = { ok: "bg-ok-500", warn: "bg-warn-500", danger: "bg-danger-500", info: "bg-sky-500" };
  return (
    <div className="relative">
      <button onClick={() => { setOpen((o) => !o); if (!open) markNotifsRead(); }}
        className="relative grid h-9 w-9 cursor-pointer place-items-center rounded-xl border border-ink-100 bg-white text-ink-500 transition hover:border-ink-200 hover:text-ink-800 active:scale-90" aria-label="Notifikasi">
        <IconBell size={16} />
        {unread > 0 && <span className="anim-pop absolute -top-1 -right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-danger-500 px-1 text-[9px] font-extrabold text-white">{unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="anim-pop absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-[0_24px_60px_rgba(23,42,89,0.22)]">
            <p className="border-b border-ink-100 bg-ink-50 px-3.5 py-2 text-[10.5px] font-extrabold tracking-[0.14em] text-ink-400 uppercase">Notifikasi</p>
            <div className="max-h-72 overflow-y-auto">
              {mine.length === 0 ? <p className="px-4 py-6 text-center text-[12px] font-semibold text-ink-300">Belum ada notifikasi.</p> : mine.map((n) => (
                <div key={n.id} className="flex items-start gap-2.5 border-b border-ink-100/60 px-3.5 py-2.5 last:border-0">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneDot[n.tone] ?? "bg-ink-300"}`} />
                  <div className="min-w-0">
                    <p className="text-[12.5px] leading-tight font-extrabold text-ink-900">{n.title}</p>
                    <p className="text-[11px] leading-snug font-semibold text-ink-400">{n.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LogoutBtn() {
  const { logout } = useApp();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 2600);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button onClick={() => (armed ? logout() : setArmed(true))}
      className={`grid h-9 min-w-9 cursor-pointer place-items-center rounded-xl border px-1.5 font-display text-[10px] font-extrabold transition-all active:scale-90 ${armed ? "anim-pop border-danger-500 bg-danger-500 px-2.5 text-white shadow-[0_4px_16px_rgba(229,72,77,0.45)]" : "border-ink-100 bg-white text-ink-400 hover:border-danger-300 hover:text-danger-600"}`}
      aria-label="Keluar dari akun" title="Keluar">
      {armed ? "Yakin?" : <IconLogoutIn size={15} />}
    </button>
  );
}

/** Global safety net — async/runtime failures become toasts, not silence. */
function ErrorNet() {
  const toast = useToast();
  const lastRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const gate = (kind: string): boolean => {
      const now = Date.now();
      if (now - (lastRef.current[kind] ?? 0) < 6000) return false;
      lastRef.current[kind] = now;
      return true;
    };
    const onErr = () => { if (gate("err")) toast.push("danger", "Terjadi kesalahan teknis", "Aksi terakhir mungkin belum tersimpan — coba lagi."); };
    const onRej = () => { if (gate("rej")) toast.push("warn", "Proses tertunda", "Mesin wajah atau jaringan lambat — ulangi sebentar lagi."); };
    const onFull = () => { if (gate("full")) toast.push("danger", "Penyimpanan perangkat penuh", "Data baru mungkin tidak tersimpan. Hapus foto/lampiran lama."); };
    const onCloudErr = () => { if (gate("cloud")) toast.push("warn", "Sinkronisasi cloud tertunda", "Perubahan tersimpan lokal & akan dicoba lagi — cek koneksi atau Netlify DB."); };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    window.addEventListener("vittoria:storage-full", onFull as EventListener);
    window.addEventListener("vittoria:cloud-error", onCloudErr as EventListener);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
      window.removeEventListener("vittoria:storage-full", onFull as EventListener);
      window.removeEventListener("vittoria:cloud-error", onCloudErr as EventListener);
    };
  }, [toast]);
  return null;
}

function ViewLoader() {
  return (
    <div className="grid place-items-center py-24">
      <div className="relative flex flex-col items-center gap-5">
        <span className="halo-pulse absolute -inset-3 rounded-full bg-sun-400/40" aria-hidden />
        <span className="orbit absolute -inset-7 rounded-full border-2 border-dashed border-sun-300/60" aria-hidden />
        <IconLogoMini />
        <p className="anim-blink text-[10.5px] font-extrabold tracking-[0.22em] text-ink-400 uppercase">Memuat modul…</p>
      </div>
    </div>
  );
}
function IconLogoMini() {
  return (
    <span className="anim-pop relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sun-400 to-sun-600 text-white shadow-[0_12px_30px_rgba(240,115,0,0.4)]">
      <IconBuilding size={26} />
    </span>
  );
}

function Shell() {
  const { session, company, sites, siteId, switchSite, activeSite, engine, geo, fence, tokenExp, logout, sql, cloud, leaves } = useApp();
  const toast = useToast();
  const [view, setView] = useState<ViewId>("home");
  const [initialType, setInitialType] = useState<AttendanceType>("IN");
  const mainRef = useRef<HTMLElement>(null);

  /* first-login onboarding */
  const [tour, setTour] = useState(false);
  useEffect(() => {
    if (!session) return;
    const flag = `vittoria:tour:${session.staffId}`;
    try { if (localStorage.getItem(flag) !== "1") setTour(true); } catch { /* noop */ }
    const open = () => setTour(true);
    window.addEventListener("vittoria:tour", open);
    return () => window.removeEventListener("vittoria:tour", open);
  }, [session?.staffId]);
  const finishTour = () => {
    if (session) { try { localStorage.setItem(`vittoria:tour:${session.staffId}`, "1"); } catch { /* noop */ } }
    setTour(false);
  };

  /* first-login face gate (HR no longer collects the photo) */
  const [faceDone, setFaceDone] = useState(false);
  useEffect(() => setFaceDone(false), [session?.staffId]);

  const role: Role = session && DOCK[session.role] ? session.role : "employee";
  const dock = DOCK[role];
  const features = FEATURES[role];
  const [sheetOpen, setSheetOpen] = useState(false);
  const featuresActive = sheetOpen || features.some((f) => f.id === view);

  useEffect(() => {
    if (!session) return;
    setView(HOME[role] ?? "home");
    setSheetOpen(false);
  }, [session?.staffId, session?.role, role]);

  const nav: NavFn = (v, type) => {
    if (type) setInitialType(type);
    setView(v);
    setSheetOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  };



  const [installEvt, setInstallEvt] = useState<(Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null>(null);
  const [installGone, setInstallGone] = useState(() => { try { return localStorage.getItem("vittoria:install-dismissed") === "1"; } catch { return false; } });
  useEffect(() => {
    const onBip = (e: Event) => { e.preventDefault(); setInstallEvt(e as typeof installEvt); };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);
  const doInstall = async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    const choice = await installEvt.userChoice;
    if (choice.outcome === "accepted") toast.push("ok", "Aplikasi terpasang", "Buka dari layar utama perangkat Anda.");
    setInstallEvt(null);
  };
  const dismissInstall = () => { setInstallGone(true); try { localStorage.setItem("vittoria:install-dismissed", "1"); } catch { /* noop */ } };

  /* dock clearance: the "Powered by Netlify" badge only exists on netlify.app */
  useEffect(() => {
    document.documentElement.style.setProperty("--dock-lift", /netlify\./.test(window.location.hostname) ? "44px" : "10px");
  }, []);

  /* pending-leave badge — computed BEFORE any early return (hooks must run unconditionally) */
  const pendingLeaves = useMemo((): string | null => {
    if (!session) return null;
    const r = DOCK[session.role] ? session.role : "employee";
    let n = 0;
    if (r === "companyadmin" || r === "superadmin") n = leaves.filter((l) => l.status === "pending_hr").length;
    else if (r === "manager") n = leaves.filter((l) => l.status === "pending").length;
    else n = leaves.filter((l) => l.staffId === session.staffId && (l.status === "pending" || l.status === "pending_hr")).length;
    return n > 0 ? String(n) : null;
  }, [session?.staffId, session?.role, leaves]);

  /* session expiry warning */
  const warnedRef = useRef(false);
  useEffect(() => { warnedRef.current = false; }, [session?.staffId]);
  useEffect(() => {
    if (!session) return;
    const iv = window.setInterval(() => {
      const left = tokenExp - Date.now();
      if (left > 0 && left <= 5 * 60_000 && !warnedRef.current) {
        warnedRef.current = true;
        toast.push("warn", "Sesi hampir berakhir", "Sekitar 5 menit tersisa — Anda akan keluar otomatis.");
      }
    }, 20_000);
    return () => window.clearInterval(iv);
  }, [session?.staffId, tokenExp, toast]);

  if (!session) return <LoginView />;

  const needsFace = !session.descriptor && !session.hash;
  if (needsFace && !faceDone) return <FaceEnrollGate onDone={() => setFaceDone(true)} />;

  /* full-bleed routes */
  if (view === "kendali") return <LiveOpsView onExit={() => nav(HOME[role])} />;
  if (view === "masterdata") {
    if (role !== "superadmin") return <LockedVault />;
    return (
      <div className="app-bg min-h-dvh">
        <div className="pt-safe mx-auto w-full max-w-3xl px-4 pt-4 pb-10">
          <MasterDataView />
          <button className="btn-ghost mx-auto mt-4 flex !py-2.5 !text-[13px]" onClick={() => nav(HOME[role])}>
            <IconArrowRight size={14} className="rotate-180" /> Kembali ke Dashboard
          </button>
        </div>
      </div>
    );
  }

  /* maintenance mode */
  const isAdminRole = role === "superadmin" || role === "companyadmin";
  if (company.maintenance && !isAdminRole) {
    return (
      <div className="app-bg grid min-h-dvh place-items-center px-6">
        <div className="anim-pop w-full max-w-sm rounded-[28px] border border-ink-100 bg-white p-8 text-center shadow-[0_30px_80px_rgba(23,42,89,0.18)]">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-warn-100 text-warn-600"><IconGear size={36} className="spin-slow" /></span>
          <h1 className="mt-5 font-display text-[26px] leading-tight font-extrabold text-ink-900">Sedang Pemeliharaan</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed font-semibold text-ink-400">{company.appName} sedang diperbarui oleh tim HR. Data Anda aman — kembali sebentar lagi.</p>
          <button className="btn-ghost mt-5 w-full !py-3 text-[13px]" onClick={() => logout()}><IconLogoutIn size={15} /> Keluar dari Akun</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg min-h-dvh">
      <ErrorNet />
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        <header className="pt-safe sticky top-0 z-30 border-b border-ink-100 bg-paper/95 shadow-[0_1px_0_rgba(23,42,89,0.03)] backdrop-blur-md print:hidden">
          {/* row 1 — identity + actions */}
          <div className="flex items-center gap-2.5 px-4 pt-2.5">
            {company.logo ? (
              <img src={company.logo} alt={company.appName} className="h-10 w-10 shrink-0 rounded-[14px] object-cover shadow-[0_6px_16px_rgba(23,42,89,0.22)] ring-1 ring-ink-100" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-gradient-to-br from-sun-400 to-sun-600 text-white shadow-[0_6px_16px_rgba(240,115,0,0.38)]"><IconBuilding size={19} /></span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[16px] leading-tight font-extrabold tracking-tight text-ink-900">{company.appName ?? "Vittoria HR"}</p>
              <p className="truncate text-[10.5px] font-bold text-ink-400">{session.name} · {ROLE_LABEL[role]}</p>
            </div>
            {/* site switcher for central roles */}
            {(role === "superadmin" || role === "companyadmin") && sites.length > 1 && (
              <div className="relative">
                <select
                  className="h-9 cursor-pointer appearance-none rounded-xl border border-ink-100 bg-white pr-7 pl-2.5 font-display text-[11px] font-extrabold text-ink-700 transition hover:border-sun-400 active:scale-95"
                  value={siteId}
                  onChange={(e) => { switchSite(e.target.value); toast.push("info", "Konteks gudang diganti", sites.find((s) => s.id === e.target.value)?.name ?? ""); }}
                  aria-label="Pilih gudang"
                >
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.shortName}</option>)}
                </select>
                <IconPin size={11} className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-sun-600" />
              </div>
            )}
            <NotifBell />
            <LogoutBtn />
          </div>
          {/* row 2 — living status strip (always fits, never truncates the brand) */}
          <div className="flex items-center gap-2 overflow-x-auto px-4 pt-1.5 pb-2 text-[10px] font-extrabold tracking-wide text-ink-400 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="flex shrink-0 items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${geo?.status === "locked" || geo?.status === "sim" ? "anim-blink bg-ok-500" : geo?.status === "denied" ? "bg-danger-500" : "bg-warn-500"}`} />
              {geoLabel(geo?.status, geo?.simulated)}
            </span>
            <span className="h-3 w-px shrink-0 bg-ink-100" />
            <span className={`shrink-0 ${engine === "ai" ? "text-teal-600" : engine === "lite" ? "text-warn-600" : ""}`}>
              {engine === "ai" ? "AI 128-D" : engine === "lite" ? "Mode Lite" : "Memuat AI…"}
            </span>
            <span className="h-3 w-px shrink-0 bg-ink-100" />
            <DbStatusPill />
            <span className="h-3 w-px shrink-0 bg-ink-100" />
            <span className="shrink-0 font-mono tabular-nums">Sesi {fmtExpLeft(tokenExp)}</span>
            <span className="h-3 w-px shrink-0 bg-ink-100" />
            <span className="flex shrink-0 items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${SITE_STYLE[(activeSite?.color as SiteColor) ?? "sun"].dot}`} />
              {activeSite?.shortName} · {activeSite?.radiusM} m
            </span>
          </div>
        </header>

        {company.announcement && (
          <div className={`border-b px-4 py-2.5 text-[12.5px] font-bold ${company.announcement.tone === "danger" ? "border-danger-200 bg-danger-100 text-danger-600" : company.announcement.tone === "warn" ? "border-warn-200 bg-warn-100 text-warn-600" : "border-sky-200 bg-sky-100 text-sky-600"}`}>
            <span className="anim-blink mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" />
            {company.announcement.text}
          </div>
        )}

        <main ref={mainRef} className="pb-safe flex-1 px-4 pt-4">
          <div key={view} className="view-enter">
            {view === "home" && <HomeView nav={nav} />}
            {view === "dashboard" && <DashboardView nav={nav} />}
            {view === "absen" && <AttendView initialType={initialType} />}
            {view === "riwayat" && <HistoryView />}
            {view === "pengguna" && <EmployeesView />}
            {view === "cuti" && <CutiView />}
            {view === "gaji" && <PayslipView />}
            {view === "profil" && <ProfileView />}
            {view === "aturan" && <SettingsView />}
            {view === "audit" && <AuditView />}
            {view === "org" && <OrgView />}
            {view === "pengumuman" && <PengumumanView />}
          </div>
        </main>

        {/* install banner */}
        {installEvt && !installGone && !(fence && !fence.inside && view !== "absen") && (
          <div className="above-dock fixed inset-x-0 z-30 flex justify-center px-4 print:hidden">
            <div className={`anim-fade-up flex w-full max-w-md items-center gap-3 rounded-2xl border border-ink-100 bg-white/95 p-3 shadow-[0_18px_48px_rgba(23,42,89,0.22)] backdrop-blur`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sun-400 to-sun-600 text-white shadow-[0_8px_18px_rgba(240,115,0,0.4)]"><IconGrid size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-tight font-extrabold text-ink-900">Pasang {company.appName ?? "Vittoria HR"}</p>
                <p className="text-[10.5px] font-bold text-ink-400">Akses cepat dari layar utama — bekerja offline.</p>
              </div>
              <button onClick={() => void doInstall()} className="btn-sun !rounded-xl !px-3.5 !py-2 !text-[12px]">Pasang</button>
              <button onClick={dismissInstall} className="cursor-pointer rounded-lg p-1.5 text-ink-300 transition hover:bg-ink-50 hover:text-ink-600" aria-label="Tutup"><IconX size={14} /></button>
            </div>
          </div>
        )}

        {/* dock */}
        <nav className="nav-safe fixed inset-x-0 bottom-0 z-40 print:hidden">
          <div className="mx-auto w-full max-w-md px-4">
            <div className="relative rounded-[26px] border border-ink-100 bg-white/95 shadow-[0_12px_40px_rgba(23,42,89,0.16)] backdrop-blur">
              <div className="grid grid-cols-5 items-end px-2 pt-2 pb-2">
                <TabBtn t={dock[0]} active={view === dock[0].id} onClick={() => nav(dock[0].id)} />
                <TabBtn t={dock[1]} active={view === dock[1].id} onClick={() => nav(dock[1].id)} badge={dock[1].id === "cuti" ? pendingLeaves : null} />
                <div className="relative flex justify-center">
                  <button onClick={() => nav("absen")}
                    className={`-mt-8 grid h-16 w-16 cursor-pointer place-items-center rounded-[22px] text-white shadow-[0_14px_30px_rgba(240,115,0,0.45)] transition-all duration-150 active:scale-90 ${view === "absen" ? "bg-gradient-to-br from-coral-500 to-danger-500" : "bg-gradient-to-br from-sun-400 to-sun-600"}`}
                    aria-label="Absensi">
                    <IconCamera size={26} />
                  </button>
                </div>
                <TabBtn t={dock[2]} active={view === dock[2].id} onClick={() => nav(dock[2].id)} badge={dock[2].id === "cuti" ? pendingLeaves : null} />
                <button onClick={() => setSheetOpen(true)}
                  className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-all duration-150 active:scale-95 ${featuresActive ? "text-sun-600" : "text-ink-300 hover:text-ink-500"}`}
                  aria-label="Fitur lainnya">
                  <IconGrid size={featuresActive ? 21 : 19} />
                  <span className={`text-[10.5px] ${featuresActive ? "font-extrabold" : "font-bold"}`}>Fitur</span>
                  <span className={`h-1 w-1 rounded-full ${featuresActive ? "bg-sun-500" : "bg-transparent"}`} />
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* geofence warning */}
        {fence && !fence.inside && view !== "absen" && (
          <div className="above-dock pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4">
            <div className="anim-fade-up rounded-full bg-danger-500/95 px-4 py-2 text-[11.5px] font-extrabold text-white shadow-lg backdrop-blur">
              <IconShield size={12} className="mr-1 inline" /> Di luar radius {activeSite?.shortName} — absensi akan ditolak
            </div>
          </div>
        )}

        {sheetOpen && <FeatureSheet role={role} features={features} onNav={nav} onClose={() => setSheetOpen(false)} />}

        {tour && session && <OnboardingTour role={session.role} name={session.name} onDone={finishTour} />}
      </div>
    </div>
  );
}

function TabBtn({ t, active, onClick, badge }: { t: TabDef; active: boolean; onClick: () => void; badge?: string | null }) {
  return (
    <button onClick={onClick}
      className={`relative flex cursor-pointer flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-all duration-150 ${active ? "text-sun-600" : "text-ink-300 hover:text-ink-500 active:scale-95"}`}
      aria-label={t.label}>
      <span className="relative">
        {t.icon(active ? 21 : 19)}
        {badge && <span className="anim-pop absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-coral-500 px-1 text-[8.5px] font-extrabold text-white shadow-sm">{badge}</span>}
      </span>
      <span className={`text-[10.5px] ${active ? "font-extrabold" : "font-bold"}`}>{t.label}</span>
      <span className={`h-1 w-1 rounded-full transition-all ${active ? "bg-sun-500" : "bg-transparent"}`} />
    </button>
  );
}

function FeatureSheet({ role, features, onNav, onClose }: { role: Role; features: FeatureDef[]; onNav: NavFn; onClose: () => void }) {
  const { session, company, tokenExp, leaves, logout } = useApp();
  if (!session) return null;
  const groups: string[] = [];
  for (const f of features) if (!groups.includes(f.group)) groups.push(f.group);
  const badgeFor = (id: ViewId): string | null => {
    if (id === "gaji" && (role === "employee" || role === "manager")) {
      const n = leaves.filter((p) => p.staffId === session.staffId && p.status === "approved").length;
      return n > 0 ? String(n) : null;
    }
    return null;
  };
  let delay = 0;
  return (
    <div className="fixed inset-0 z-50 print:hidden">
      <div className="anim-fade-in absolute inset-0 bg-ink-950/55 backdrop-blur-[2px]" onClick={onClose} />
      <div className="sheet-up absolute inset-x-0 bottom-0 mx-auto w-full max-w-md overflow-hidden rounded-t-[30px] border-t border-ink-100 bg-white shadow-[0_-24px_70px_rgba(23,42,89,0.3)]">
        <div className="flex justify-center pb-1 pt-2.5"><span className="h-1.5 w-10 rounded-full bg-ink-200" /></div>
        <div className="flex items-center gap-3 px-5 pt-1 pb-3.5">
          <InitialsAvatar name={session.name} photo={session.photo} seedKey={session.staffId} size="h-12 w-12 text-[16px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[16px] leading-tight font-extrabold text-ink-900">{session.name}</p>
            <p className="flex items-center gap-1.5 text-[10.5px] font-bold text-ink-400">
              <Chip tone={role === "superadmin" ? "grape" : role === "companyadmin" ? "sun" : role === "manager" ? "sky" : "ink"} className="!px-1.5 !py-0.5 !text-[8.5px]">{ROLE_LABEL[role].toUpperCase()}</Chip>
              <span className="font-mono">sesi {fmtExpLeft(tokenExp)}</span>
            </p>
          </div>
          <span className="hidden text-right text-[9.5px] leading-tight font-bold text-ink-300 sm:block">{company.appName}<br />v7.0 · WIB</span>
        </div>
        <div className="px-5 pb-4">
          {groups.map((g) => (
            <div key={g} className="mb-3 last:mb-0">
              <div className="mb-2 flex items-center gap-2.5">
                <p className="text-[10.5px] font-extrabold tracking-[0.14em] text-ink-400 uppercase">{g}</p>
                <span className="h-px flex-1 bg-ink-100" />
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {features.filter((f) => f.group === g).map((f) => {
                  const badge = badgeFor(f.id);
                  delay += 60;
                  return (
                    <button key={f.id} onClick={() => onNav(f.id)}
                      className="tile-pop group flex cursor-pointer flex-col items-start gap-2 rounded-2xl border border-ink-100 bg-white p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-[0_12px_28px_rgba(23,42,89,0.12)] active:scale-95"
                      style={{ animationDelay: `${delay}ms` }}>
                      <span className={`relative grid h-11 w-11 place-items-center rounded-[14px] transition-transform duration-150 group-hover:scale-105 ${f.tint}`}>
                        {f.icon(20)}
                        {badge && <span className="anim-pop absolute -top-1.5 -right-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-ink-900 px-1 font-mono text-[9px] font-extrabold text-white shadow">{badge}</span>}
                      </span>
                      <span>
                        <span className="block font-display text-[13px] leading-tight font-extrabold text-ink-900">{f.label}</span>
                        <span className="mt-0.5 block text-[9.5px] leading-snug font-semibold text-ink-400">{f.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-ink-100 bg-ink-50/70 px-5 py-3.5">
          <button onClick={() => onNav(role === "employee" || role === "manager" ? "profil" : "aturan")} className="btn-ghost flex-1 !py-2.5 !text-[12.5px]">
            <IconGear size={14} /> {role === "employee" || role === "manager" ? "Profil Saya" : "Pengaturan"}
          </button>
          <button onClick={() => logout()} className="btn-danger flex-1 !py-2.5 !text-[12.5px]"><IconLogoutIn size={14} /> Keluar</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppProvider>
          <Shell />
        </AppProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
