/**
 * Shell — login gate, role-based tabs & dock (center camera FAB),
 * notification bell, global announcement, maintenance mode, onboarding tour.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AppProvider, useApp } from "./lib/store";
import { AttendanceType, ROLE_LABEL, Role } from "./lib/database";
import { fmtExpLeft } from "./lib/jwt";
import { Chip } from "./components/bits";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider } from "./components/Toast";
import OnboardingTour from "./components/OnboardingTour";
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
import {
  IconBell, IconBriefcase, IconBuilding, IconCamera, IconClipboard, IconCpu,
  IconGear, IconHistory, IconHome, IconLogoutIn, IconShield, IconSignal, IconUsers, IconWallet,
} from "./components/icons";

export type ViewId =
  | "home" | "dashboard" | "absen" | "riwayat" | "pengguna"
  | "cuti" | "gaji" | "profil" | "aturan" | "audit";
export type NavFn = (v: ViewId, type?: AttendanceType) => void;

interface TabDef { id: ViewId; label: string; icon: (s: number) => React.ReactNode; }

const TABS: Record<Role, TabDef[]> = {
  employee: [
    { id: "home", label: "Beranda", icon: (s) => <IconHome size={s} /> },
    { id: "riwayat", label: "Riwayat", icon: (s) => <IconHistory size={s} /> },
    { id: "cuti", label: "Cuti", icon: (s) => <IconBriefcase size={s} /> },
    { id: "gaji", label: "Gaji", icon: (s) => <IconWallet size={s} /> },
    { id: "profil", label: "Profil", icon: (s) => <IconUsers size={s} /> },
  ],
  manager: [
    { id: "home", label: "Beranda", icon: (s) => <IconHome size={s} /> },
    { id: "riwayat", label: "Riwayat", icon: (s) => <IconHistory size={s} /> },
    { id: "cuti", label: "Cuti", icon: (s) => <IconBriefcase size={s} /> },
    { id: "gaji", label: "Gaji", icon: (s) => <IconWallet size={s} /> },
    { id: "profil", label: "Profil", icon: (s) => <IconUsers size={s} /> },
  ],
  companyadmin: [
    { id: "dashboard", label: "Dashboard", icon: (s) => <IconHome size={s} /> },
    { id: "pengguna", label: "Pengguna", icon: (s) => <IconUsers size={s} /> },
    { id: "cuti", label: "Cuti", icon: (s) => <IconBriefcase size={s} /> },
    { id: "gaji", label: "Gaji", icon: (s) => <IconWallet size={s} /> },
    { id: "aturan", label: "Aturan", icon: (s) => <IconGear size={s} /> },
  ],
  superadmin: [
    { id: "dashboard", label: "Dashboard", icon: (s) => <IconHome size={s} /> },
    { id: "pengguna", label: "Pengguna", icon: (s) => <IconUsers size={s} /> },
    { id: "audit", label: "Audit", icon: (s) => <IconClipboard size={s} /> },
    { id: "gaji", label: "Gaji", icon: (s) => <IconWallet size={s} /> },
    { id: "aturan", label: "Sistem", icon: (s) => <IconGear size={s} /> },
  ],
};

const HOME: Record<Role, ViewId> = {
  employee: "home", manager: "home", companyadmin: "dashboard", superadmin: "dashboard",
};

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
          <span className="anim-pop absolute -top-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger-500 px-1 text-[9px] font-extrabold text-white">
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

function Shell() {
  const { session, company, engine, geo, fence, tokenExp, logout } = useApp();
  const [view, setView] = useState<ViewId>("home");
  const [initialType, setInitialType] = useState<AttendanceType>("IN");
  const mainRef = useRef<HTMLElement>(null);

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

  const role: Role = session && TABS[session.role] ? session.role : "employee";
  const tabs = TABS[role];

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

  if (!session) return <LoginView />;

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
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
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
              <p className="truncate text-[10px] font-bold text-ink-400">
                {session.name} · {ROLE_LABEL[role]}
                <span className="text-ink-300"> · sesi {fmtExpLeft(tokenExp)}</span>
              </p>
            </div>
            <div className="hidden items-center gap-1.5 sm:flex">
              <Chip tone={engine === "ai" ? "teal" : engine === "lite" ? "warn" : "ink"}>
                <IconCpu size={11} /> {engine === "ai" ? "AI" : engine === "lite" ? "LITE" : "…"}
              </Chip>
            </div>
            <Chip tone={geoTone(geo?.status)}>
              <IconSignal size={11} /> {geoLabel(geo?.status, geo?.simulated)}
            </Chip>
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
            {view === "riwayat" && <HistoryView />}
            {view === "pengguna" && <EmployeesView />}
            {view === "cuti" && <CutiView />}
            {view === "gaji" && <PayslipView />}
            {view === "profil" && <ProfileView />}
            {view === "aturan" && <SettingsView />}
            {view === "audit" && <AuditView />}
          </div>
        </main>

        <nav className="nav-safe fixed inset-x-0 bottom-0 z-40 print:hidden">
          <div className="mx-auto w-full max-w-md px-4">
            <div className="relative rounded-[26px] border border-ink-100 bg-white/95 shadow-[0_12px_40px_rgba(23,42,89,0.16)] backdrop-blur">
              <div className="grid items-end px-2 pt-2 pb-2" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
                {tabs.slice(0, 2).map((t) => <TabBtn key={t.id} t={t} active={view === t.id} onClick={() => nav(t.id)} />)}
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
                {tabs.slice(2).map((t) => <TabBtn key={t.id} t={t} active={view === t.id} onClick={() => nav(t.id)} />)}
              </div>
            </div>
          </div>
        </nav>

        {fence && !fence.inside && view !== "absen" && (
          <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4">
            <div className="anim-fade-up rounded-full bg-danger-500/95 px-4 py-2 text-[11.5px] font-extrabold text-white shadow-lg backdrop-blur">
              <IconShield size={12} className="mr-1 inline" /> Di luar radius gudang — absensi akan ditolak
            </div>
          </div>
        )}

        {tour && session && <OnboardingTour role={session.role} name={session.name} onDone={finishTour} />}
      </div>
    </div>
  );
}

function TabBtn({ t, active, onClick }: { t: TabDef; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-all duration-150 ${
        active ? "text-sun-600" : "text-ink-300 hover:text-ink-500 active:scale-95"
      }`}
      aria-label={t.label}
    >
      {t.icon(active ? 21 : 19)}
      <span className={`text-[9.5px] font-extrabold ${active ? "" : "font-bold"}`}>{t.label}</span>
      <span className={`h-1 w-1 rounded-full transition-all ${active ? "bg-sun-500" : "bg-transparent"}`} />
    </button>
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
