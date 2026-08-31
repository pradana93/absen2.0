/**
 * Shell — login gate, role-based 4-slot dock + center camera FAB,
 * Fitur bottom sheet (grouped secondary modules), notification bell,
 * global announcement, maintenance mode, PWA install banner, onboarding.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AppProvider, useApp } from "./lib/store";
import { AttendanceType, ROLE_LABEL, Role, SITE_STYLE } from "./lib/database";
import { fmtExpLeft } from "./lib/jwt";
import { todayKey } from "./lib/format";
import { Chip, InitialsAvatar } from "./components/bits";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider, useToast } from "./components/Toast";
import FaceEnrollGate from "./components/FaceEnrollGate";
import OnboardingTour from "./components/OnboardingTour";
import LoginView from "./views/LoginView";
import HomeView from "./views/HomeView";
import DashboardView from "./views/DashboardView";
import AttendView from "./views/AttendView";
import EmployeesView from "./views/EmployeesView";
import CutiView from "./views/CutiView";
import ProfileView from "./views/ProfileView";
import OrgView from "./views/OrgView";
import PengumumanView from "./views/PengumumanView";
/* heavy / role-specific modules load on demand (Leaflet, tables, vault) */
const HistoryView = lazy(() => import("./views/HistoryView"));
const PayslipView = lazy(() => import("./views/PayslipView"));
const SettingsView = lazy(() => import("./views/SettingsView"));
const AuditView = lazy(() => import("./views/AuditView"));
const LiveOpsView = lazy(() => import("./views/LiveOpsView"));
const MasterDataView = lazy(() => import("./views/MasterDataView"));

export const APP_VERSION = "v6.3";
import {
  IconArrowRight, IconBell, IconBriefcase, IconBuilding, IconCamera, IconClipboard, IconCpu, IconDatabase,
  IconGear, IconGrid, IconHistory, IconHome, IconLock, IconLogo, IconLogoutIn, IconShield, IconSignal, IconUsers, IconX,
} from "./components/icons";

export type ViewId =
  | "home" | "dashboard" | "absen" | "riwayat" | "pengguna"
  | "cuti" | "gaji" | "profil" | "aturan" | "audit" | "org"
  | "kendali" | "pengumuman" | "masterdata";
export type NavFn = (v: ViewId, type?: AttendanceType) => void;

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

interface TabDef { id: ViewId; label: string; icon: (s: number) => React.ReactNode; }
interface FeatureDef extends TabDef { desc: string; tint: string; group: string; }

/** Slim dock — exactly 4 tabs per role; everything else lives in the Fitur sheet. */
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

/** The Fitur sheet — secondary modules, with live context badges. */
const FEATURES: Record<Role, FeatureDef[]> = {
  employee: [
    { id: "pengumuman", label: "Pengumuman", group: "Info", desc: "Kabar & konfirmasi tim", tint: "bg-sky-100 text-sky-600", icon: (s) => <IconBell size={s} /> },
    { id: "org", label: "Struktur", group: "Perusahaan", desc: "Hierarki perusahaan", tint: "bg-coral-100 text-coral-600", icon: (s) => <IconBuilding size={s} /> },
    { id: "profil", label: "Profil", group: "Akun", desc: "Data diri & keamanan", tint: "bg-grape-100 text-grape-600", icon: (s) => <IconUsers size={s} /> },
  ],
  manager: [
    { id: "kendali", label: "R. Kendali", group: "Operasional", desc: "Papan live gudang", tint: "bg-ink-900 text-sun-400", icon: (s) => <IconCpu size={s} /> },
    { id: "pengumuman", label: "Pengumuman", group: "Info", desc: "Kabar & konfirmasi tim", tint: "bg-sky-100 text-sky-600", icon: (s) => <IconBell size={s} /> },
    { id: "org", label: "Struktur", group: "Perusahaan", desc: "Hierarki tim", tint: "bg-coral-100 text-coral-600", icon: (s) => <IconBuilding size={s} /> },
    { id: "profil", label: "Profil", group: "Akun", desc: "Data diri & keamanan", tint: "bg-grape-100 text-grape-600", icon: (s) => <IconUsers size={s} /> },
  ],
  companyadmin: [
    { id: "kendali", label: "R. Kendali", group: "Operasional", desc: "Papan live gudang", tint: "bg-ink-900 text-sun-400", icon: (s) => <IconCpu size={s} /> },
    { id: "pengumuman", label: "Pengumuman", group: "Info", desc: "Posting & pantau konfirmasi", tint: "bg-sky-100 text-sky-600", icon: (s) => <IconBell size={s} /> },
    { id: "org", label: "Struktur", group: "Perusahaan", desc: "Susun hierarki", tint: "bg-coral-100 text-coral-600", icon: (s) => <IconBuilding size={s} /> },
    { id: "aturan", label: "Aturan", group: "Perusahaan", desc: "Geofence, shift & libur", tint: "bg-teal-100 text-teal-600", icon: (s) => <IconGear size={s} /> },
  ],
  superadmin: [
    { id: "masterdata", label: "Master Data", group: "Sistem", desc: "Data induk · hanya Super Admin", tint: "bg-ink-900 text-sun-400", icon: (s) => <IconDatabase size={s} /> },
    { id: "kendali", label: "R. Kendali", group: "Operasional", desc: "Papan live gudang", tint: "bg-ink-900 text-sun-400", icon: (s) => <IconCpu size={s} /> },
    { id: "pengumuman", label: "Pengumuman", group: "Info", desc: "Posting & pantau konfirmasi", tint: "bg-sky-100 text-sky-600", icon: (s) => <IconBell size={s} /> },
    { id: "org", label: "Struktur", group: "Perusahaan", desc: "Susun hierarki", tint: "bg-coral-100 text-coral-600", icon: (s) => <IconBuilding size={s} /> },
    { id: "aturan", label: "Sistem", group: "Sistem", desc: "Branding & cadangan", tint: "bg-teal-100 text-teal-600", icon: (s) => <IconGear size={s} /> },
  ],
};

const HOME: Record<Role, ViewId> = {
  employee: "home", manager: "home", companyadmin: "dashboard", superadmin: "dashboard",
};

/**
 * Responsive shell width. The app keeps its phone frame on small screens but
 * widens on tablets/desktop so content never collides. Shared by the shell,
 * dock and floating banners so they always align.
 */
const SHELL_W = "max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl";

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

function NotifBell() {
  const { session, notifs, markNotifsRead } = useApp();
  const [open, setOpen] = useState(false);
  const mine = useMemo(
    () => notifs.filter((n) => n.staffId === session?.staffId).sort((a, b) => b.ts - a.ts).slice(0, 12),
    [notifs, session?.staffId],
  );
  const unread = mine.filter((n) => !n.read).length;
  const toneDot: Record<string, string> = { ok: "bg-ok-500", warn: "bg-warn-500", danger: "bg-danger-500", info: "bg-sky-500" };

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((o) => !o); if (!open) markNotifsRead(); }}
        className="relative grid h-9 w-9 cursor-pointer place-items-center rounded-xl border border-ink-100 bg-white text-ink-500 transition hover:border-ink-200 hover:text-ink-800 active:scale-90"
        aria-label="Notifikasi"
      >
        <IconBell size={16} />
        {unread > 0 && (
          <span className="anim-pop absolute -top-1 -right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-danger-500 px-1 text-[9px] font-extrabold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="anim-pop absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-[0_24px_60px_rgba(23,42,89,0.22)]">
            <p className="border-b border-ink-100 bg-ink-50 px-3.5 py-2 text-[10.5px] font-extrabold tracking-[0.14em] text-ink-400 uppercase">Notifikasi</p>
            <div className="max-h-72 overflow-y-auto">
              {mine.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px] font-semibold text-ink-300">Belum ada notifikasi.</p>
              ) : (
                mine.map((n) => (
                  <div key={n.id} className="flex items-start gap-2.5 border-b border-ink-100/60 px-3.5 py-2.5 last:border-0">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneDot[n.tone] ?? "bg-ink-300"}`} />
                    <div className="min-w-0">
                      <p className="text-[12.5px] leading-tight font-extrabold text-ink-900">{n.title}</p>
                      <p className="text-[11px] leading-snug font-semibold text-ink-400">{n.body}</p>
                    </div>
                  </div>
                ))
              )}
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
    <button
      onClick={() => (armed ? logout() : setArmed(true))}
      className={`grid h-9 cursor-pointer items-center rounded-xl border px-2.5 font-display text-[11.5px] font-bold transition-all active:scale-90 ${
        armed
          ? "anim-pop border-danger-500 bg-danger-500 text-white shadow-[0_4px_16px_rgba(229,72,77,0.45)]"
          : "border-ink-100 bg-white text-ink-400 hover:border-danger-300 hover:bg-danger-100/50 hover:text-danger-600"
      }`}
      aria-label="Keluar"
    >
      <IconLogoutIn size={14} />
      {armed && <span>Keluar?</span>}
    </button>
  );
}

function SiteSwitcher() {
  const { session, sites, activeSite, switchSite } = useApp();
  const [open, setOpen] = useState(false);
  const isAdmin = session?.role === "superadmin" || session?.role === "companyadmin";
  const canSwitch = isAdmin || !session?.siteId; // staff pinned to their own site
  const st = activeSite ? SITE_STYLE[activeSite.color] : null;

  if (!activeSite) return null;
  return (
    <div className="relative">
      <button
        onClick={() => canSwitch && setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-xl border border-ink-100 bg-white px-2.5 py-1.5 transition active:scale-95 ${canSwitch ? "cursor-pointer hover:border-ink-200 hover:shadow-sm" : "cursor-default"}`}
        aria-label="Gudang aktif"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${st?.dot ?? "bg-ink-300"}`} />
        <span className="max-w-24 truncate text-[11px] font-extrabold text-ink-800">{activeSite.shortName}</span>
        {canSwitch && <IconArrowRight size={11} className={`text-ink-300 transition-transform ${open ? "rotate-90" : ""}`} />}
      </button>
      {open && canSwitch && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="anim-pop absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-ink-100 bg-white p-1.5 shadow-[0_24px_60px_rgba(23,42,89,0.22)]">
            <p className="px-2.5 pt-1.5 pb-1 text-[9.5px] font-extrabold tracking-[0.14em] text-ink-400 uppercase">Gudang / Area</p>
            {sites.map((s) => {
              const sst = SITE_STYLE[s.color];
              const active = s.id === activeSite.id;
              return (
                <button
                  key={s.id}
                  onClick={() => { switchSite(s.id); setOpen(false); }}
                  className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-ink-50 ${active ? "bg-sun-100/70" : ""}`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${sst.dot}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] leading-tight font-extrabold text-ink-900">{s.name}</span>
                    <span className="block font-mono text-[9.5px] font-bold text-ink-400">radius {s.radiusM} m</span>
                  </span>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-sun-500" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Shell() {
  const { session, company, leaves, org, board, activeSite, audits, engine, geo, fence, tokenExp, logout } = useApp();
  const toast = useToast();
  const [view, setView] = useState<ViewId>("home");
  const [initialType, setInitialType] = useState<AttendanceType>("IN");
  const mainRef = useRef<HTMLElement>(null);

  /* first-login face enrollment gate (dismissed per-user on save or skip) */
  const [faceDone, setFaceDone] = useState(false);
  useEffect(() => setFaceDone(false), [session?.staffId]);

  /* warn once when the JWT session is about to expire */
  const warnedRef = useRef(false);
  useEffect(() => { warnedRef.current = false; }, [session?.staffId]);
  useEffect(() => {
    if (!session) return;
    const iv = window.setInterval(() => {
      const left = tokenExp - Date.now();
      if (left > 0 && left <= 5 * 60_000 && !warnedRef.current) {
        warnedRef.current = true;
        toast.push("warn", "Sesi hampir berakhir", "Sekitar 5 menit tersisa — Anda akan keluar otomatis demi keamanan.");
      }
    }, 20_000);
    return () => window.clearInterval(iv);
  }, [session?.staffId, tokenExp, toast]);

  /* first-login onboarding tour */
  const [tour, setTour] = useState(false);
  useEffect(() => {
    if (!session) return;
    const flag = `vittoria:tour:${session.staffId}`;
    try { if (localStorage.getItem(flag) !== "1") setTour(true); } catch { /* storage unavailable */ }
    const open = () => setTour(true);
    window.addEventListener("vittoria:tour", open);
    return () => window.removeEventListener("vittoria:tour", open);
  }, [session?.staffId]);
  const finishTour = () => {
    if (session) {
      try { localStorage.setItem(`vittoria:tour:${session.staffId}`, "1"); } catch { /* noop */ }
    }
    setTour(false);
  };

  const role: Role = session && DOCK[session.role] ? session.role : "employee";
  const dock = DOCK[role];
  const features = FEATURES[role];

  /* Fitur sheet */
  const [sheetOpen, setSheetOpen] = useState(false);
  const featuresActive = sheetOpen || features.some((f) => f.id === view);
  const navSheet: NavFn = (v, t) => {
    setSheetOpen(false);
    nav(v, t);
  };

  useEffect(() => {
    if (!session) return;
    setView(HOME[role] ?? "home");
  }, [session?.staffId, session?.role, role]);

  const nav: NavFn = (v, type) => {
    if (type) setInitialType(type);
    setView(v);
    mainRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  };

  /* live context badges */
  const monthNow = todayKey().slice(0, 7);
  const badgeFor = (id: ViewId): string | null => {
    if (!session) return null;
    if (id === "org") return String(org.length);
    if (id === "pengumuman") {
      const n = board.filter(
        (p) => (p.siteId === null || p.siteId === activeSite.id) && !p.acks.includes(session.staffId),
      ).length;
      return n > 0 ? String(n) : null;
    }
    if (id === "audit") return audits.length > 99 ? "99+" : String(audits.length);
    return null;
  };
  const cutiBadge = (() => {
    if (!session) return null;
    let n = 0;
    if (role === "companyadmin") n = leaves.filter((l) => l.status === "pending_hr").length;
    else if (role === "manager") n = leaves.filter((l) => l.status === "pending").length;
    else n = leaves.filter((l) => l.staffId === session.staffId && (l.status === "pending" || l.status === "pending_hr")).length;
    return n > 0 ? String(n) : null;
  })();

  /* PWA install affordance */
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null);
  const [installGone, setInstallGone] = useState(() => {
    try { return localStorage.getItem("vittoria:install-dismissed") === "1"; } catch { return false; }
  });
  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BIPEvent);
    };
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
  const dismissInstall = () => {
    setInstallGone(true);
    try { localStorage.setItem("vittoria:install-dismissed", "1"); } catch { /* noop */ }
  };

  if (!session) return <LoginView />;

  /* first login: capture base photo before entering (HR skipped it at creation) */
  const needsFace = !session.descriptor && !session.hash;
  if (needsFace && !faceDone) {
    return <FaceEnrollGate onDone={() => setFaceDone(true)} />;
  }

  /* Ruang Kendali — full-bleed dark ops board (escapes the phone frame) */
  if (view === "kendali") {
    return (
      <Suspense fallback={<FullScreenLoader />}>
        <LiveOpsView onExit={() => nav(HOME[role])} />
      </Suspense>
    );
  }

  /* Master Data — Super Admin vault (wide canvas for tables) */
  if (view === "masterdata") {
    if (role !== "superadmin") return <LockedScreen onBack={() => nav(HOME[role])} />;
    return (
      <div className="app-bg min-h-dvh">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          <Suspense fallback={<ViewLoader />}>
            <MasterDataView />
          </Suspense>
          <button className="btn-ghost mx-auto mt-4 flex !py-2.5 !text-[13px]" onClick={() => nav(HOME[role])}>
            <IconArrowRight size={14} className="rotate-180" /> Kembali ke Dashboard
          </button>
        </div>
      </div>
    );
  }

  /* maintenance mode — admins keep access */
  const isAdminRole = role === "superadmin" || role === "companyadmin";
  if (company.maintenance && !isAdminRole) {
    return (
      <div className="app-bg grid min-h-dvh place-items-center px-6">
        <div className="anim-pop w-full max-w-sm rounded-[28px] border border-ink-100 bg-white p-8 text-center shadow-[0_30px_80px_rgba(23,42,89,0.18)]">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-warn-100 text-warn-600">
            <IconGear size={36} className="spin-slow" />
          </span>
          <h1 className="mt-5 font-display text-[26px] leading-tight font-extrabold text-ink-900">Sedang Pemeliharaan</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed font-semibold text-ink-400">
            {company.appName} sedang diperbarui oleh tim HR. Absensi dan data Anda aman — silakan kembali beberapa saat lagi.
          </p>
          <div className="mt-5 rounded-2xl bg-ink-50 px-4 py-3 text-[11px] font-bold text-ink-400">
            Butuh akses? Hubungi Admin HR perusahaan Anda.
          </div>
          <button className="btn-ghost mt-4 w-full !py-3 text-[13px]" onClick={() => logout()}>
            <IconLogoutIn size={15} /> Keluar dari Akun
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg min-h-dvh">
      <div className={`mx-auto flex min-h-dvh w-full ${SHELL_W} flex-col`}>
        <header className="pt-safe sticky top-0 z-30 border-b border-ink-100 bg-paper/90 backdrop-blur print:hidden">
          <div className="flex items-center gap-2.5 px-4 py-2.5">
            {company.logo ? (
              <img src={company.logo} alt={company.appName} className="h-9 w-9 shrink-0 rounded-xl object-cover shadow-[0_4px_14px_rgba(23,42,89,0.25)] ring-1 ring-ink-100" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sun-400 to-sun-600 text-white shadow-[0_4px_14px_rgba(240,115,0,0.35)]">
                <IconBuilding size={17} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[14.5px] leading-tight font-extrabold text-ink-900">{company.appName ?? "Vittoria HR"}</p>
              <p className="flex min-w-0 items-center gap-1 text-[10px] font-bold text-ink-400">
                <span className="truncate">{session.name} · {ROLE_LABEL[role]}</span>
                <span className="hidden text-ink-300 md:inline">· sesi {fmtExpLeft(tokenExp)}</span>
              </p>
              {/* status line — engine + GPS live under the title, not crowding the right */}
              <div className="mt-1 flex items-center gap-1.5">
                <Chip tone={engine === "ai" ? "teal" : engine === "lite" ? "warn" : "ink"} className="!px-1.5 !py-0.5 !text-[8.5px]">
                  <IconCpu size={9} /> {engine === "ai" ? "AI" : engine === "lite" ? "LITE" : "…"}
                </Chip>
                <Chip tone={geoTone(geo?.status)} className="!px-1.5 !py-0.5 !text-[8.5px]">
                  <IconSignal size={9} /> {geoLabel(geo?.status, geo?.simulated)}
                </Chip>
              </div>
            </div>
            <SiteSwitcher />
            <NotifBell />
            <LogoutBtn />
          </div>
        </header>

        {company.announcement && (
          <div className={`border-b px-4 py-2.5 text-[12.5px] font-bold ${
            company.announcement.tone === "danger" ? "border-danger-200 bg-danger-100 text-danger-600"
              : company.announcement.tone === "warn" ? "border-warn-200 bg-warn-100 text-warn-600"
              : "border-sky-200 bg-sky-100 text-sky-600"
          }`}>
            <span className="anim-blink mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" />
            {company.announcement.text}
          </div>
        )}

        <main ref={mainRef} className="pb-safe flex-1 px-4 pt-4">
          <div key={view} className="view-enter">
            {view === "home" && <HomeView nav={nav} />}
            {view === "dashboard" && <DashboardView nav={nav} />}
            {view === "absen" && <AttendView initialType={initialType} />}
            {view === "riwayat" && <Suspense fallback={<ViewLoader />}><HistoryView /></Suspense>}
            {view === "pengguna" && <EmployeesView />}
            {view === "cuti" && <CutiView />}
            {view === "gaji" && <Suspense fallback={<ViewLoader />}><PayslipView /></Suspense>}
            {view === "profil" && <ProfileView />}
            {view === "aturan" && <Suspense fallback={<ViewLoader />}><SettingsView /></Suspense>}
            {view === "audit" && <Suspense fallback={<ViewLoader />}><AuditView /></Suspense>}
            {view === "org" && <OrgView />}
            {view === "pengumuman" && <PengumumanView />}
          </div>
        </main>

        {/* PWA install banner (yield to the geofence warning when both apply) */}
        {installEvt && !installGone && !(fence && !fence.inside && view !== "absen") && (
          <div className="above-dock fixed inset-x-0 z-30 flex justify-center px-4 print:hidden">
            <div className={`anim-fade-up flex w-full ${SHELL_W} items-center gap-3 rounded-2xl border border-ink-100 bg-white/95 p-3 shadow-[0_18px_48px_rgba(23,42,89,0.22)] backdrop-blur`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sun-400 to-sun-600 text-white shadow-[0_8px_18px_rgba(240,115,0,0.4)]">
                <IconGrid size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-tight font-extrabold text-ink-900">Pasang {company.appName ?? "Vittoria HR"}</p>
                <p className="text-[10.5px] font-bold text-ink-400">Akses cepat dari layar utama — bekerja offline.</p>
              </div>
              <button onClick={() => void doInstall()} className="btn-sun !rounded-xl !px-3.5 !py-2 !text-[12px]">Pasang</button>
              <button onClick={dismissInstall} className="cursor-pointer rounded-lg p-1.5 text-ink-300 transition hover:bg-ink-50 hover:text-ink-600" aria-label="Tutup">
                <IconX size={14} />
              </button>
            </div>
          </div>
        )}

        <nav className="nav-safe fixed inset-x-0 bottom-0 z-40 print:hidden">
          <div className={`mx-auto w-full ${SHELL_W} px-4`}>
            <div className="relative rounded-[26px] border border-ink-100 bg-white/95 shadow-[0_12px_40px_rgba(23,42,89,0.16)] backdrop-blur">
              <div className="grid grid-cols-5 items-end px-2 pt-2 pb-2">
                <TabBtn t={dock[0]} active={view === dock[0].id} onClick={() => nav(dock[0].id)} />
                <TabBtn t={dock[1]} active={view === dock[1].id} onClick={() => nav(dock[1].id)} badge={dock[1].id === "cuti" ? cutiBadge : null} />
                <div className="relative flex justify-center">
                  <button
                    onClick={() => nav("absen")}
                    className={`-mt-8 grid h-16 w-16 cursor-pointer place-items-center rounded-[22px] text-white shadow-[0_14px_30px_rgba(240,115,0,0.45)] transition-all duration-150 active:scale-90 ${
                      view === "absen" ? "bg-gradient-to-br from-coral-500 to-danger-500" : "bg-gradient-to-br from-sun-400 to-sun-600"
                    }`}
                    aria-label="Absensi"
                  >
                    <IconCamera size={26} />
                  </button>
                </div>
                <TabBtn t={dock[2]} active={view === dock[2].id} onClick={() => nav(dock[2].id)} badge={dock[2].id === "cuti" ? cutiBadge : null} />
                {/* Fitur — opens the sheet */}
                <button
                  onClick={() => setSheetOpen(true)}
                  className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-all duration-150 active:scale-95 ${
                    featuresActive ? "text-sun-600" : "text-ink-300 hover:text-ink-500"
                  }`}
                  aria-label="Fitur lainnya"
                >
                  <IconGrid size={featuresActive ? 21 : 19} />
                  <span className={`text-[9.5px] ${featuresActive ? "font-extrabold" : "font-bold"}`}>Fitur</span>
                  <span className={`h-1 w-1 rounded-full ${featuresActive ? "bg-sun-500" : "bg-transparent"}`} />
                </button>
              </div>
            </div>
          </div>
        </nav>

        {fence && !fence.inside && view !== "absen" && (
          <div className="above-dock pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4">
            <div className="anim-fade-up rounded-full bg-danger-500/95 px-4 py-2 text-[11.5px] font-extrabold text-white shadow-lg backdrop-blur">
              <IconShield size={12} className="mr-1 inline" /> Di luar radius gudang — absensi akan ditolak
            </div>
          </div>
        )}

        {sheetOpen && (
          <FeatureSheet role={role} features={features} badgeFor={badgeFor} onNav={navSheet} onClose={() => setSheetOpen(false)} />
        )}

        {tour && session && <OnboardingTour role={session.role} name={session.name} onDone={finishTour} />}
      </div>
    </div>
  );
}

/* Branded loader while a lazy module streams in. */
function ViewLoader() {
  return (
    <div className="grid place-items-center py-24">
      <div className="relative flex flex-col items-center gap-5">
        <span className="halo-pulse absolute -inset-3 rounded-full bg-sun-400/40" aria-hidden />
        <span className="orbit absolute -inset-7 rounded-full border-2 border-dashed border-sun-300/60" aria-hidden />
        <IconLogo size={54} className="anim-pop relative" />
        <p className="anim-blink text-[10.5px] font-extrabold tracking-[0.22em] text-ink-400 uppercase">Memuat modul…</p>
      </div>
    </div>
  );
}

function FullScreenLoader() {
  return (
    <div className="ops-bg grid min-h-dvh place-items-center">
      <div className="relative flex flex-col items-center gap-5">
        <span className="orbit absolute -inset-8 rounded-full border-2 border-dashed border-sun-400/40" aria-hidden />
        <IconLogo size={60} className="anim-pop" />
        <p className="anim-blink text-[10.5px] font-extrabold tracking-[0.22em] text-white/60 uppercase">Membuka ruang kendali…</p>
      </div>
    </div>
  );
}

/* Hard gate: Master Data is Super Admin territory only. */
function LockedScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="app-bg grid min-h-dvh place-items-center px-6">
      <div className="anim-pop w-full max-w-sm rounded-[28px] border border-ink-100 bg-white p-8 text-center shadow-[0_30px_80px_rgba(23,42,89,0.18)]">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-ink-100 text-ink-500">
          <IconLock size={34} />
        </span>
        <h1 className="mt-5 font-display text-[24px] leading-tight font-extrabold text-ink-900">Area Terbatas</h1>
        <p className="mt-2 text-[13px] leading-relaxed font-semibold text-ink-400">
          Master Data hanya dapat diakses oleh <b className="text-ink-700">Super Admin</b>.
          Jika Anda membutuhkannya, hubungi Super Admin perusahaan Anda.
        </p>
        <button className="btn-ghost mt-5 w-full !py-3 text-[13px]" onClick={onBack}>
          <IconArrowRight size={14} className="rotate-180" /> Kembali
        </button>
      </div>
    </div>
  );
}

/* Global safety net — surfaces async/runtime failures as a toast instead of silence. */
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
    const onErr = () => { if (gate("err")) toast.push("danger", "Terjadi kesalahan teknis", "Aksi terakhir mungkin belum tersimpan — silakan coba lagi."); };
    const onRej = () => { if (gate("rej")) toast.push("warn", "Proses tertunda", "Mesin wajah atau jaringan lambat — coba ulangi sebentar lagi."); };
    const onFull = () => { if (gate("full")) toast.push("danger", "Penyimpanan perangkat penuh", "Data baru mungkin tidak tersimpan. Hapus foto/lampiran lama agar lega."); };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    window.addEventListener("vittoria:storage-full", onFull as EventListener);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
      window.removeEventListener("vittoria:storage-full", onFull as EventListener);
    };
  }, [toast]);
  return null;
}

function TabBtn({ t, active, onClick, badge }: { t: TabDef; active: boolean; onClick: () => void; badge?: string | null }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex cursor-pointer flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-all duration-150 ${
        active ? "text-sun-600" : "text-ink-300 hover:text-ink-500 active:scale-95"
      }`}
      aria-label={t.label}
    >
      <span className="relative">
        {t.icon(active ? 21 : 19)}
        {badge && (
          <span className="anim-pop absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-coral-500 px-1 text-[8.5px] font-extrabold text-white shadow-sm">
            {badge}
          </span>
        )}
      </span>
      <span className={`text-[9.5px] font-extrabold ${active ? "" : "font-bold"}`}>{t.label}</span>
      <span className={`h-1 w-1 rounded-full transition-all ${active ? "bg-sun-500" : "bg-transparent"}`} />
    </button>
  );
}

/** Fitur — bottom sheet with the secondary modules, profile & sign-out. */
function FeatureSheet({
  role, features, badgeFor, onNav, onClose,
}: {
  role: Role;
  features: FeatureDef[];
  badgeFor: (id: ViewId) => string | null;
  onNav: NavFn;
  onClose: () => void;
}) {
  const { session, company, tokenExp, logout } = useApp();
  if (!session) return null;
  const groups: string[] = [];
  for (const f of features) if (!groups.includes(f.group)) groups.push(f.group);
  let delay = 0;
  return (
    <div className="fixed inset-0 z-50 print:hidden">
      <div className="anim-fade-in absolute inset-0 bg-ink-950/55 backdrop-blur-[2px]" onClick={onClose} />
      <div className="sheet-up absolute inset-x-0 bottom-0 mx-auto w-full max-w-md overflow-hidden rounded-t-[30px] border-t border-ink-100 bg-white shadow-[0_-24px_70px_rgba(23,42,89,0.3)]">
        <div className="flex justify-center pb-1 pt-2.5">
          <span className="h-1.5 w-10 rounded-full bg-ink-200" />
        </div>

        {/* profile header */}
        <div className="flex items-center gap-3 px-5 pt-1 pb-3.5">
          <InitialsAvatar name={session.name} photo={session.photo} seedKey={session.staffId} size="h-12 w-12 text-[16px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[16px] leading-tight font-extrabold text-ink-900">{session.name}</p>
            <p className="flex items-center gap-1.5 text-[10.5px] font-bold text-ink-400">
              <Chip tone={role === "superadmin" ? "grape" : role === "companyadmin" ? "sun" : role === "manager" ? "sky" : "ink"} className="!px-1.5 !py-0.5 !text-[8.5px]">
                {ROLE_LABEL[role].toUpperCase()}
              </Chip>
              <span className="font-mono">sesi {fmtExpLeft(tokenExp)}</span>
            </p>
          </div>
          <span className="hidden text-right text-[9.5px] leading-tight font-bold text-ink-300 sm:block">
            {company.appName}<br />{APP_VERSION} · WIB
          </span>
        </div>

        {/* grouped module grid */}
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
                    <button
                      key={f.id}
                      onClick={() => onNav(f.id)}
                      className="tile-pop group flex cursor-pointer flex-col items-start gap-2 rounded-2xl border border-ink-100 bg-white p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-[0_12px_28px_rgba(23,42,89,0.12)] active:scale-95"
                      style={{ animationDelay: `${delay}ms` }}
                    >
                      <span className={`relative grid h-11 w-11 place-items-center rounded-[14px] transition-transform duration-150 group-hover:scale-105 ${f.tint}`}>
                        {f.icon(20)}
                        {badge && (
                          <span className="anim-pop absolute -top-1.5 -right-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-ink-900 px-1 font-mono text-[9px] font-extrabold text-white shadow">
                            {badge}
                          </span>
                        )}
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

        {/* footer */}
        <div className="flex items-center gap-2 border-t border-ink-100 bg-ink-50/70 px-5 py-3.5">
          <button
            onClick={() => onNav(role === "employee" || role === "manager" ? "profil" : "aturan")}
            className="btn-ghost flex-1 !py-2.5 !text-[12.5px]"
          >
            <IconGear size={14} /> {role === "employee" || role === "manager" ? "Profil Saya" : "Pengaturan"}
          </button>
          <button onClick={() => logout()} className="btn-danger flex-1 !py-2.5 !text-[12.5px]">
            <IconLogoutIn size={14} /> Keluar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ErrorNet />
        <AppProvider>
          <Shell />
        </AppProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
