/**
 * Global app store — session (JWT), sites (Gudang/Area), employees, logs,
 * breaks, leaves, payslips, shifts, company, settings, audit, notifications,
 * live GPS, face-engine tier — plus cross-tab tenant sync and identity import.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  applyBrand, AttendanceLog, AuditLog, BoardPost, BreakRec, clearAll, Company, db, Employee, ensureFreshVersion,
  KEY_COMPANY, KEY_SITES, LeaveRequest, LeaveType, MasterPayload, Notif, OrgNode, Payslip, ResetToken, Role, SalaryStructure, seedAudit, seedCompany,
  seedBoardPosts, seedEmployees, seedLeaves, seedLogs, seedNotifs, seedOrgNodes, seedShifts, seedSites, Settings, Shift,
  Site, SmtpConfig, TenantIdentity,
} from "./database";
import { uid } from "./format";
import { evaluateFence, FenceVerdict, GeoReading } from "./geoUtils";
import { EngineStatus, initFaceEngine, onEngineStatus } from "./faceEngine";
import { issueTokens, TokenPair } from "./jwt";
import { getDeviceId, shortDevice } from "./device";

export interface LoginResult { ok: boolean; error?: string; }

interface AppState {
  company: Company;
  sites: Site[];
  siteId: string;
  activeSite: Site;
  employees: Employee[];
  siteEmployees: Employee[];
  logs: AttendanceLog[];
  siteLogs: AttendanceLog[];
  breaks: BreakRec[];
  leaves: LeaveRequest[];
  payslips: Payslip[];
  shifts: Shift[];
  org: OrgNode[];
  siteOrg: OrgNode[];
  board: BoardPost[];
  audits: AuditLog[];
  notifs: Notif[];
  settings: Settings;
  engine: EngineStatus;
  geo: GeoReading | null;
  fence: FenceVerdict | null;
  session: Employee | null;
  tokenExp: number;
  login: (email: string, password: string, siteId: string) => Promise<LoginResult>;
  logout: () => void;
  switchSite: (id: string) => void;
  updateSite: (id: string, patch: Partial<Site>) => void;
  addSite: (s: Site) => void;
  removeSite: (id: string) => boolean;
  importIdentity: (id: TenantIdentity, source: string) => boolean;
  addEmployee: (e: Employee) => void;
  updateEmployee: (staffId: string, patch: Partial<Employee>) => void;
  removeEmployee: (staffId: string) => void;
  unbindDevice: (staffId: string) => void;
  addLog: (l: AttendanceLog) => void;
  clearLogs: () => void;
  addLeave: (r: LeaveRequest) => void;
  decideLeave: (id: string, approve: boolean, stage: "manager" | "hr") => void;
  issuePayslip: (slip: Payslip, byName: string) => void;
  withdrawPayslip: (id: string) => void;
  addOrgNode: (n: OrgNode) => void;
  updateOrgNode: (id: string, patch: Partial<OrgNode>) => void;
  removeOrgNode: (id: string) => void;
  postBoard: (p: { siteId: string | null; title: string; body: string; tone: BoardPost["tone"] }) => void;
  ackBoard: (id: string) => void;
  deleteBoard: (id: string) => void;
  /* master data (Super Admin vault) */
  departments: string[];
  leaveQuotas: Record<LeaveType, number>;
  salaryDefaults: Record<Role, SalaryStructure>;
  addDepartment: (name: string) => boolean;
  renameDepartment: (oldName: string, newName: string) => boolean;
  removeDepartment: (name: string) => boolean;
  updateLeaveQuota: (t: LeaveType, days: number) => void;
  updateSalaryDefault: (r: Role, patch: Partial<SalaryStructure>) => void;
  importMasterData: (payload: MasterPayload) => string[];
  /* forgot password */
  requestReset: (email: string) => { ok: boolean; error?: string; token?: ResetToken; name?: string };
  consumeReset: (token: string) => { ok: boolean; error?: string; name?: string };
  resetPassword: (token: string, newPass: string) => { ok: boolean; error?: string };
  /* SMTP — real email via the Netlify function */
  smtp: SmtpConfig;
  updateSmtp: (patch: Partial<SmtpConfig>) => void;
  /** Returns "smtp" when sent via the mail server, "demo" when the in-app inbox fallback was used. */
  deliverResetEmail: (to: string, name: string, link: string) => Promise<"smtp" | "demo">;
  sendTestEmail: (to: string) => Promise<{ ok: boolean; error?: string }>;
  addShift: (s: Shift) => void;
  updateShift: (id: string, patch: Partial<Shift>) => void;
  removeShift: (id: string) => void;
  activeBreak: BreakRec | null;
  startBreak: () => void;
  endBreak: () => void;
  markNotifsRead: () => void;
  updateCompany: (patch: Partial<Company>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  audit: (action: string, target: string, detail: string) => void;
  resetAll: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [company, setCompany] = useState<Company>(() => {
    ensureFreshVersion(); // wipe + reseed when the data model changed between releases
    if (!db.wasSeeded()) {
      const c = seedCompany();
      db.saveCompany(c);
      db.saveSites(seedSites());
      db.saveEmployees(seedEmployees());
      db.saveShifts(seedShifts());
      db.saveLogs(seedLogs(db.loadSites()));
      db.saveLeaves(seedLeaves());
      db.saveOrg(seedOrgNodes());
      db.saveAudit(seedAudit());
      db.saveNotifs(seedNotifs());
      db.markSeeded();
      return c;
    }
    return db.loadCompany();
  });
  const [sites, setSites] = useState<Site[]>(() => {
    const s = db.loadSites();
    return s.length ? s : seedSites();
  });
  const [siteId, setSiteId] = useState<string>(() => {
    const sess = db.loadSession();
    if (sess) {
      const emp = db.loadEmployees().find((e) => e.staffId === sess.staffId);
      if (emp?.siteId) return emp.siteId;
    }
    const choice = db.loadSiteChoice();
    const s = db.loadSites();
    if (choice && s.some((x) => x.id === choice)) return choice;
    return s[0]?.id ?? "site-vit";
  });
  const [employees, setEmployees] = useState<Employee[]>(() => db.loadEmployees());
  const [logs, setLogs] = useState<AttendanceLog[]>(() => db.loadLogs());
  const [breaks, setBreaks] = useState<BreakRec[]>(() => db.loadBreaks());
  const [leaves, setLeaves] = useState<LeaveRequest[]>(() => db.loadLeaves());
  const [payslips, setPayslips] = useState<Payslip[]>(() => db.loadPayslips());
  const [shifts, setShifts] = useState<Shift[]>(() => {
    const s = db.loadShifts();
    return s.length ? s : seedShifts();
  });
  const [org, setOrg] = useState<OrgNode[]>(() => {
    const o = db.loadOrg();
    return o.length ? o : seedOrgNodes();
  });
  const [board, setBoard] = useState<BoardPost[]>(() => db.loadBoard());
  const [audits, setAudits] = useState<AuditLog[]>(() => db.loadAudit());
  const [notifs, setNotifs] = useState<Notif[]>(() => db.loadNotifs());
  const [settings, setSettings] = useState<Settings>(() => db.loadSettings());
  const [engine, setEngine] = useState<EngineStatus>("boot");
  const [geo, setGeo] = useState<GeoReading | null>(null);
  const [session, setSession] = useState<{ staffId: string } & TokenPair | null>(() => {
    const s = db.loadSession();
    if (!s) return null;
    if (Date.now() > s.refreshExp) { db.saveSession(null); return null; }
    return s;
  });

  /* refs for callbacks */
  const employeesRef = useRef(employees); employeesRef.current = employees;
  const companyRef = useRef(company); companyRef.current = company;
  const sitesRef = useRef(sites); sitesRef.current = sites;
  const sessionRef = useRef(session); sessionRef.current = session;
  const leavesRef = useRef(leaves); leavesRef.current = leaves;
  const payslipsRef = useRef(payslips); payslipsRef.current = payslips;
  const orgRef = useRef(org); orgRef.current = org;
  const failRef = useRef<Record<string, number>>({});
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const boardRef = useRef(board); boardRef.current = board;

  /* ------------------------------ persistence ----------------------------- */
  useEffect(() => db.saveEmployees(employees), [employees]);
  useEffect(() => db.saveLogs(logs), [logs]);
  useEffect(() => db.saveBreaks(breaks), [breaks]);
  useEffect(() => db.saveLeaves(leaves), [leaves]);
  useEffect(() => db.savePayslips(payslips), [payslips]);
  useEffect(() => db.saveShifts(shifts), [shifts]);
  useEffect(() => db.saveOrg(org), [org]);
  useEffect(() => db.saveBoard(board), [board]);
  useEffect(() => db.saveAudit(audits), [audits]);
  useEffect(() => db.saveNotifs(notifs), [notifs]);
  useEffect(() => db.saveSettings(settings), [settings]);
  useEffect(() => db.saveCompany(company), [company]);
  useEffect(() => db.saveSites(sites), [sites]);

  /* white-label: apply brand preset + sync browser title on tenant change */
  useEffect(() => {
    applyBrand(company.brand ?? "sun");
    document.title = `${company.appName ?? "Vittoria HR"} — ${company.appTagline ?? "Absensi & HRIS"}`;
  }, [company.brand, company.appName, company.appTagline]);

  /* Full cross-tab sync: storage events only fire in *other* tabs, so two
     open sessions (e.g. HR + staff on one machine) never diverge. */
  useEffect(() => {
    const sync: Array<[string, () => void]> = [
      ["employees", () => setEmployees(db.loadEmployees())],
      ["logs", () => setLogs(db.loadLogs())],
      ["leaves", () => setLeaves(db.loadLeaves())],
      ["breaks", () => setBreaks(db.loadBreaks())],
      ["board", () => setBoard(db.loadBoard())],
      ["org", () => setOrg(db.loadOrg())],
      ["notifs", () => setNotifs(db.loadNotifs())],
      ["audit", () => setAudits(db.loadAudit())],
      ["payslips", () => setPayslips(db.loadPayslips())],
      ["shifts", () => { const s = db.loadShifts(); if (s.length) setShifts(s); }],
      ["departments", () => { const d = db.loadDepartments(); if (d.length) setDepartments(d); }],
      ["quotas", () => setLeaveQuotas(db.loadQuotas())],
      ["salarydefaults", () => setSalaryDefaults(db.loadSalaryDefaults())],
    ];
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key === KEY_COMPANY) { setCompany(db.loadCompany()); return; }
      if (e.key === KEY_SITES) {
        const s = db.loadSites();
        if (s.length) setSites(s);
        return;
      }
      for (const [suffix, fn] of sync) {
        if (e.key.endsWith(":" + suffix)) { fn(); return; }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /* -------------------------------- audit -------------------------------- */
  const audit = useCallback((action: string, target: string, detail: string) => {
    const s = sessionRef.current;
    const actor = s ? employeesRef.current.find((e) => e.staffId === s.staffId) : null;
    setAudits((prev) => [
      {
        id: uid("aud"), ts: Date.now(),
        actorId: actor?.staffId ?? "system",
        actorName: actor?.name ?? "Sistem",
        role: (actor?.role ?? "system") as AuditLog["role"],
        action, target, detail,
      },
      ...prev,
    ]);
  }, []);

  /* --------------------------------- sites -------------------------------- */
  const activeSite = useMemo(
    () => sites.find((s) => s.id === siteId) ?? sites[0],
    [sites, siteId],
  );

  const switchSite = useCallback((id: string) => {
    const s = sitesRef.current.find((x) => x.id === id);
    if (!s) return;
    setSiteId(id);
    db.saveSiteChoice(id);
    const actor = sessionRef.current ? employeesRef.current.find((e) => e.staffId === sessionRef.current?.staffId) : null;
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem",
      role: (actor?.role ?? "system") as AuditLog["role"],
      action: "SITE_SWITCH", target: id, detail: `Area aktif → ${s.name}`,
    }, ...prev]);
  }, []);

  const updateSite = useCallback((id: string, patch: Partial<Site>) => {
    setSites((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const addSite = useCallback((s: Site) => {
    setSites((prev) => [...prev, s]);
    // every Gudang starts with its own structure
    setOrg((prev) => [...prev, {
      id: uid("org"), parentId: null, siteId: s.id, title: "Kepala Gudang",
      staffId: null, name: null, note: `Pimpinan ${s.name}`, createdAt: Date.now(),
    }]);
  }, []);

  const removeSite = useCallback((id: string): boolean => {
    const used = employeesRef.current.some((e) => e.siteId === id);
    if (used) return false;
    const st = sitesRef.current.find((s) => s.id === id);
    setSites((prev) => prev.filter((s) => s.id !== id));
    setOrg((prev) => prev.filter((n) => n.siteId !== id));
    setLogs((prev) => prev.filter((l) => l.siteId !== id));
    setSiteId((cur) => {
      if (cur === id) {
        const next = sitesRef.current.find((s) => s.id !== id)?.id ?? "site-vit";
        db.saveSiteChoice(next);
        return next;
      }
      return cur;
    });
    const actor = sessionRef.current ? employeesRef.current.find((e) => e.staffId === sessionRef.current?.staffId) : null;
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem",
      role: (actor?.role ?? "system") as AuditLog["role"],
      action: "MASTER_SITE_DELETE", target: id, detail: `Gudang "${st?.name ?? id}" dihapus beserta struktur & log-nya`,
    }, ...prev]);
    return true;
  }, []);

  /* -------------------------------- session ------------------------------- */
  const login = useCallback(async (email: string, password: string, chosenSite: string): Promise<LoginResult> => {
    await new Promise((r) => setTimeout(r, 450)); // perceptible auth round-trip

    const key = email.trim().toLowerCase();
    const emp = employeesRef.current.find((e) => e.email.toLowerCase() === key);
    if (!emp || emp.password !== password) {
      const n = (failRef.current[key] = (failRef.current[key] ?? 0) + 1);
      if (n === 3) {
        const admins = employeesRef.current.filter((e) => (e.role === "superadmin" || e.role === "companyadmin") && e.status === "active");
        setNotifs((prev) => [
          ...admins.map((a) => ({
            id: uid("ntf"), staffId: a.staffId, title: "Percobaan login mencurigakan",
            body: `3× gagal untuk ${key}. Jika bukan Anda, amankan akun.`,
            tone: "warn" as const, ts: Date.now(), read: false,
          })),
          ...prev,
        ]);
        setAudits((prev) => [{
          id: uid("aud"), ts: Date.now(), actorId: "system", actorName: "Sistem", role: "system" as const,
          action: "AUTH_FAIL_ALERT", target: key, detail: "3× gagal login berturut-turut — notifikasi dikirim ke Admin",
        }, ...prev]);
      }
      return { ok: false, error: "Email atau kata sandi salah." };
    }
    failRef.current[key] = 0;
    if (emp.status !== "active") return { ok: false, error: "Akun nonaktif — hubungi Admin HR." };

    /* site check — staff belong to one Gudang; HQ roles may enter any */
    if (emp.siteId && emp.siteId !== chosenSite) {
      const home = sitesRef.current.find((s) => s.id === emp.siteId);
      return { ok: false, error: `Akun ini terdaftar di ${home?.name ?? "area lain"}. Pilih area yang sesuai.` };
    }
    const finalSite = emp.siteId ?? chosenSite;

    /* device binding: the account locks to the device of its FIRST login. */
    const dev = getDeviceId();
    let boundNow = false;
    if (companyRef.current.deviceBinding) {
      if (emp.deviceId && emp.deviceId !== dev) {
        setAudits((prev) => [{
          id: uid("aud"), ts: Date.now(), actorId: emp.staffId, actorName: emp.name, role: emp.role,
          action: "AUTH_DEVICE_BLOCK", target: emp.staffId, detail: `Login ditolak dari perangkat asing ${shortDevice(dev)}`,
        }, ...prev]);
        return { ok: false, error: "Perangkat tidak dikenal. Akun ini terikat ke perangkat lain — minta Super Admin melepas ikatannya (menu Pengguna)." };
      }
      if (!emp.deviceId) {
        boundNow = true;
        setEmployees((prev) => prev.map((e) => (e.staffId === emp.staffId ? { ...e, deviceId: dev, deviceBoundAt: Date.now() } : e)));
      }
    }

    const pair = issueTokens(emp, companyRef.current.id);
    const sess = { staffId: emp.staffId, ...pair };
    setSession(sess);
    db.saveSession(sess);
    setSiteId(finalSite);
    db.saveSiteChoice(finalSite);
    const siteName = sitesRef.current.find((s) => s.id === finalSite)?.name ?? finalSite;
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(), actorId: emp.staffId, actorName: emp.name, role: emp.role,
      action: "AUTH_LOGIN", target: emp.staffId,
      detail: `Login berhasil · area ${siteName} · JWT diterbitkan (8 jam)${boundNow ? ` · perangkat ${shortDevice(dev)} diikat` : ""}`,
    }, ...prev]);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    const s = sessionRef.current;
    if (s) {
      const actor = employeesRef.current.find((e) => e.staffId === s.staffId);
      setAudits((prev) => [{
        id: uid("aud"), ts: Date.now(), actorId: s.staffId, actorName: actor?.name ?? s.staffId,
        role: (actor?.role ?? "system") as AuditLog["role"], action: "AUTH_LOGOUT", target: s.staffId, detail: "Sesi diakhiri pengguna",
      }, ...prev]);
    }
    setSession(null);
    db.saveSession(null);
  }, []);

  /* auto-logout when access token expires */
  useEffect(() => {
    if (!session) return;
    const left = session.accessExp - Date.now();
    if (left <= 0) { logout(); return; }
    const t = window.setTimeout(logout, left);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessExp, logout]);

  /* --------------------------- identity import ---------------------------- */
  const importIdentity = useCallback((identity: TenantIdentity, source: string): boolean => {
    if (!identity || typeof identity.appName !== "string") return false;
    setCompany((prev) => ({ ...prev, ...identity }));
    const s = sessionRef.current;
    const actor = s ? employeesRef.current.find((e) => e.staffId === s.staffId) : null;
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "device", actorName: actor?.name ?? "Perangkat baru",
      role: (actor?.role ?? "system") as AuditLog["role"], action: "IDENTITY_IMPORT", target: identity.appName,
      detail: `Identitas tenant "${identity.appName}" diterapkan via ${source}`,
    }, ...prev]);
    return true;
  }, []);

  /* auto-apply tenant identity passed via URL (#tenant=…) */
  useEffect(() => {
    const m = window.location.hash.match(/^#tenant=(.+)$/);
    if (!m) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(m[1])) as TenantIdentity;
      importIdentity(parsed, "tautan");
      window.history.replaceState(null, "", window.location.pathname);
    } catch { /* malformed link — ignore */ }
  }, [importIdentity]);

  /* ------------------------------ face engine ----------------------------- */
  useEffect(() => {
    const off = onEngineStatus(setEngine);
    initFaceEngine();
    return off;
  }, []);

  /* --------------------------------- GPS ---------------------------------- */
  useEffect(() => {
    if (settings.simEnabled) {
      const mk = (): GeoReading => {
        const s = settingsRef.current;
        return {
          lat: s.simLat + (Math.random() - 0.5) * 0.00006,
          lon: s.simLon + (Math.random() - 0.5) * 0.00006,
          accuracy: 6 + Math.random() * 6, status: "sim", ts: Date.now(), simulated: true,
        };
      };
      setGeo(mk());
      const iv = window.setInterval(() => setGeo(mk()), 4000);
      return () => window.clearInterval(iv);
    }
    if (!("geolocation" in navigator)) {
      setGeo({ lat: 0, lon: 0, accuracy: 0, status: "unavailable", ts: Date.now(), simulated: false });
      return;
    }
    setGeo((g) => g ?? { lat: 0, lon: 0, accuracy: 0, status: "searching", ts: Date.now(), simulated: false });
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setGeo({
        lat: pos.coords.latitude, lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 0, status: "locked", ts: Date.now(), simulated: false,
      }),
      (err) => setGeo((prev) => ({
        lat: prev?.lat ?? 0, lon: prev?.lon ?? 0, accuracy: prev?.accuracy ?? 0,
        status: err.code === err.PERMISSION_DENIED ? "denied" : "searching",
        ts: Date.now(), simulated: false,
      })),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [settings.simEnabled, settings.simLat, settings.simLon]);

  /* geofence now follows the ACTIVE SITE */
  const fence = useMemo(() => {
    if (!geo || (geo.status !== "locked" && geo.status !== "sim")) return null;
    if (!activeSite) return null;
    return evaluateFence(geo, { lat: activeSite.hqLat, lon: activeSite.hqLon }, activeSite.radiusM);
  }, [geo, activeSite]);

  const sessionEmployee = useMemo(
    () => (session ? employees.find((e) => e.staffId === session.staffId) ?? null : null),
    [session, employees],
  );

  /* ------------------------- site-scoped collections ----------------------- */
  const siteEmployees = useMemo(() => employees.filter((e) => e.siteId === activeSite?.id), [employees, activeSite]);
  const siteLogs = useMemo(() => logs.filter((l) => l.siteId === activeSite?.id), [logs, activeSite]);
  const siteOrg = useMemo(() => org.filter((n) => n.siteId === activeSite?.id), [org, activeSite]);

  /* ------------------------------- employees ------------------------------ */
  const addEmployee = useCallback((e: Employee) => setEmployees((prev) => [e, ...prev]), []);
  const updateEmployee = useCallback(
    (staffId: string, patch: Partial<Employee>) =>
      setEmployees((prev) => prev.map((e) => (e.staffId === staffId ? { ...e, ...patch } : e))),
    [],
  );
  const removeEmployee = useCallback(
    (staffId: string) => setEmployees((prev) => prev.filter((e) => e.staffId !== staffId)),
    [],
  );
  const unbindDevice = useCallback((staffId: string) => {
    const emp = employeesRef.current.find((e) => e.staffId === staffId);
    setEmployees((prev) => prev.map((e) => (e.staffId === staffId ? { ...e, deviceId: null, deviceBoundAt: null } : e)));
    const s = sessionRef.current;
    const actor = s ? employeesRef.current.find((e) => e.staffId === s.staffId) : null;
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem",
      role: (actor?.role ?? "system") as AuditLog["role"], action: "DEVICE_UNBIND", target: staffId,
      detail: `Ikatan perangkat ${emp?.name ?? staffId} dilepas — login berikutnya mengikat perangkat baru`,
    }, ...prev]);
  }, []);

  /* --------------------------------- logs --------------------------------- */
  const addLog = useCallback((l: AttendanceLog) => setLogs((prev) => [l, ...prev]), []);
  const clearLogs = useCallback(() => setLogs([]), []);

  /* --------------------------------- leave -------------------------------- */
  const addLeave = useCallback((r: LeaveRequest) => setLeaves((prev) => [r, ...prev]), []);

  const decideLeave = useCallback((id: string, approve: boolean, stage: "manager" | "hr") => {
    const s = sessionRef.current;
    const actor = s ? employeesRef.current.find((e) => e.staffId === s.staffId) : null;
    const lv = leavesRef.current.find((l) => l.id === id);
    if (!lv) return;

    setLeaves((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const decision = { by: actor?.name ?? "Admin", at: Date.now() };
      if (stage === "manager") {
        return approve
          ? { ...l, status: "pending_hr" as const, managerDecision: decision }
          : { ...l, status: "rejected" as const, managerDecision: decision };
      }
      return approve
        ? { ...l, status: "approved" as const, hrDecision: decision }
        : { ...l, status: "rejected" as const, hrDecision: decision };
    }));

    const nextStatus = stage === "manager" ? (approve ? "pending_hr" : "rejected") : approve ? "approved" : "rejected";
    const verb = approve ? (stage === "manager" ? "disetujui Manajer → lanjut ke HR" : "disetujui HR (final)") : "ditolak";
    setNotifs((prev) => [{
      id: uid("ntf"), staffId: lv.staffId,
      title: approve ? "Cuti disetujui" : "Cuti ditolak",
      body: `${lv.type} ${lv.days} hari (${lv.date}) ${verb}.`,
      tone: approve ? "ok" as const : "danger" as const, ts: Date.now(), read: false,
    }, ...prev]);
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem",
      role: (actor?.role ?? "system") as AuditLog["role"],
      action: stage === "manager" ? (approve ? "LEAVE_APPROVE_MGR" : "LEAVE_REJECT_MGR") : approve ? "LEAVE_APPROVE_HR" : "LEAVE_REJECT_HR",
      target: lv.staffId, detail: `${lv.type} ${lv.days} hari · ${lv.date} → ${nextStatus}`,
    }, ...prev]);
  }, []);

  /* -------------------------------- payroll ------------------------------- */
  const issuePayslip = useCallback((slip: Payslip, byName: string) => {
    const final: Payslip = { ...slip, status: "issued", issuedAt: Date.now(), issuedBy: byName };
    setPayslips((prev) => [final, ...prev.filter((p) => p.id !== final.id)]);
    setNotifs((prev) => [{
      id: uid("ntf"), staffId: slip.staffId, title: "Slip gaji diterbitkan",
      body: `Periode ${slip.month} · terima bersih ${slip.net.toLocaleString("id-ID")} — lihat menu Gaji.`,
      tone: "info" as const, ts: Date.now(), read: false,
    }, ...prev]);
    const s = sessionRef.current;
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(), actorId: s?.staffId ?? "system", actorName: byName,
      role: (employeesRef.current.find((e) => e.staffId === s?.staffId)?.role ?? "companyadmin") as AuditLog["role"],
      action: "PAYSLIP_ISSUE", target: slip.staffId, detail: `Slip ${slip.month} diterbitkan untuk ${slip.name}`,
    }, ...prev]);
  }, []);

  const withdrawPayslip = useCallback((id: string) => {
    const slip = payslipsRef.current.find((p) => p.id === id);
    setPayslips((prev) => prev.filter((p) => p.id !== id));
    const s = sessionRef.current;
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(), actorId: s?.staffId ?? "system",
      actorName: employeesRef.current.find((e) => e.staffId === s?.staffId)?.name ?? "Sistem",
      role: (employeesRef.current.find((e) => e.staffId === s?.staffId)?.role ?? "companyadmin") as AuditLog["role"],
      action: "PAYSLIP_WITHDRAW", target: slip?.staffId ?? id, detail: `Slip ${slip?.month ?? ""} ditarik kembali`,
    }, ...prev]);
  }, []);

  /* ----------------------------- organization ----------------------------- */
  const addOrgNode = useCallback((n: OrgNode) => setOrg((prev) => [...prev, n]), []);
  const updateOrgNode = useCallback(
    (id: string, patch: Partial<OrgNode>) => setOrg((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n))),
    [],
  );
  /** Deleting a node promotes its direct children to the deleted node's parent. */
  const removeOrgNode = useCallback((id: string) => {
    setOrg((prev) => {
      const victim = prev.find((n) => n.id === id);
      if (!victim) return prev;
      return prev
        .filter((n) => n.id !== id)
        .map((n) => (n.parentId === id ? { ...n, parentId: victim.parentId } : n));
    });
  }, []);

  /* ------------------------------ papan pengumuman ------------------------ */
  const postBoard = useCallback((p: { siteId: string | null; title: string; body: string; tone: BoardPost["tone"] }) => {
    const actor = sessionRef.current ? employeesRef.current.find((e) => e.staffId === sessionRef.current?.staffId) : null;
    const post: BoardPost = {
      id: uid("an"), siteId: p.siteId, title: p.title.trim(), body: p.body.trim(),
      tone: p.tone, createdBy: actor?.name ?? "Admin", createdAt: Date.now(), acks: [],
    };
    setBoard((prev) => [post, ...prev]);
    /* notify every active employee whose site matches */
    const targets = employeesRef.current.filter(
      (e) => e.status === "active" && (e.role === "employee" || e.role === "manager") &&
        (post.siteId === null || e.siteId === post.siteId),
    );
    setNotifs((prev) => [
      ...targets.map((e) => ({
        id: uid("ntf"), staffId: e.staffId, title: "Pengumuman baru",
        body: post.title, tone: post.tone === "ok" ? "ok" as const : post.tone === "info" ? "info" as const : "warn" as const,
        ts: Date.now(), read: false,
      })),
      ...prev,
    ]);
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem",
      role: (actor?.role ?? "system") as AuditLog["role"], action: "BOARD_POST",
      target: post.siteId ?? "semua-area", detail: `Pengumuman "${post.title}" (${targets.length} penerima)`,
    }, ...prev]);
  }, []);

  const ackBoard = useCallback((id: string) => {
    const sid = sessionRef.current?.staffId;
    if (!sid) return;
    setBoard((prev) => prev.map((b) => (b.id === id && !b.acks.includes(sid) ? { ...b, acks: [...b.acks, sid] } : b)));
  }, []);

  const deleteBoard = useCallback((id: string) => {
    const post = boardRef.current.find((b) => b.id === id);
    setBoard((prev) => prev.filter((b) => b.id !== id));
    const actor = sessionRef.current ? employeesRef.current.find((e) => e.staffId === sessionRef.current?.staffId) : null;
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem",
      role: (actor?.role ?? "system") as AuditLog["role"], action: "BOARD_DELETE",
      target: post?.siteId ?? "semua-area", detail: `Pengumuman "${post?.title ?? id}" dihapus`,
    }, ...prev]);
  }, []);

  /* ------------------------------ master data ----------------------------- */
  const [departments, setDepartments] = useState<string[]>(() => {
    const d = db.loadDepartments();
    return d.length ? d : ["Gudang"];
  });
  const [leaveQuotas, setLeaveQuotas] = useState<Record<LeaveType, number>>(() => db.loadQuotas());
  const [salaryDefaults, setSalaryDefaults] = useState<Record<Role, SalaryStructure>>(() => db.loadSalaryDefaults());
  const [resets, setResets] = useState<ResetToken[]>(() => db.loadResets());
  const [smtp, setSmtp] = useState<SmtpConfig>(() => db.loadSmtp());
  const smtpRef = useRef(smtp); smtpRef.current = smtp;

  useEffect(() => db.saveDepartments(departments), [departments]);
  useEffect(() => db.saveQuotas(leaveQuotas), [leaveQuotas]);
  useEffect(() => db.saveSalaryDefaults(salaryDefaults), [salaryDefaults]);
  useEffect(() => db.saveResets(resets), [resets]);
  useEffect(() => db.saveSmtp(smtp), [smtp]);

  const departmentsRef = useRef(departments); departmentsRef.current = departments;
  const shiftsRef = useRef(shifts); shiftsRef.current = shifts;
  const quotasRef = useRef(leaveQuotas); quotasRef.current = leaveQuotas;
  const salaryRef = useRef(salaryDefaults); salaryRef.current = salaryDefaults;

  const masterAudit = useCallback((action: string, target: string, detail: string) => {
    const actor = sessionRef.current ? employeesRef.current.find((e) => e.staffId === sessionRef.current?.staffId) : null;
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(),
      actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem",
      role: (actor?.role ?? "system") as AuditLog["role"],
      action, target, detail,
    }, ...prev]);
  }, []);

  const addDepartment = useCallback((name: string): boolean => {
    const n = name.trim();
    if (!n || departmentsRef.current.some((d) => d.toLowerCase() === n.toLowerCase())) return false;
    setDepartments((prev) => [...prev, n]);
    masterAudit("MASTER_DEPT_ADD", n, `Departemen "${n}" ditambahkan`);
    return true;
  }, [masterAudit]);

  const renameDepartment = useCallback((oldName: string, newName: string): boolean => {
    const n = newName.trim();
    if (!n) return false;
    setDepartments((prev) => prev.map((d) => (d === oldName ? n : d)));
    setEmployees((prev) => prev.map((e) => (e.department === oldName ? { ...e, department: n } : e)));
    masterAudit("MASTER_DEPT_RENAME", n, `"${oldName}" → "${n}" (karyawan ikut diperbarui)`);
    return true;
  }, [masterAudit]);

  const removeDepartment = useCallback((name: string): boolean => {
    const inUse = employeesRef.current.filter((e) => e.department === name).length;
    if (inUse > 0) return false;
    setDepartments((prev) => prev.filter((d) => d !== name));
    masterAudit("MASTER_DEPT_DELETE", name, `Departemen "${name}" dihapus`);
    return true;
  }, [masterAudit]);

  const updateLeaveQuota = useCallback((t: LeaveType, days: number) => {
    setLeaveQuotas((prev) => ({ ...prev, [t]: Math.max(0, Math.round(days)) }));
    masterAudit("MASTER_QUOTA", t, `Kuota ${t} → ${Math.max(0, Math.round(days))} hari`);
  }, [masterAudit]);

  const updateSalaryDefault = useCallback((r: Role, patch: Partial<SalaryStructure>) => {
    setSalaryDefaults((prev) => ({ ...prev, [r]: { ...prev[r], ...patch } }));
    masterAudit("MASTER_SALARY", r, `Struktur gaji default ${r} diperbarui`);
  }, [masterAudit]);

  /** Replace master collections from a validated payload; employees are upserted by staffId. */
  const importMasterData = useCallback((payload: MasterPayload): string[] => {
    const applied: string[] = [];
    if (payload.company) { setCompany((prev) => ({ ...prev, ...payload.company })); applied.push("company"); }
    if (Array.isArray(payload.sites)) { setSites(payload.sites); applied.push(`sites (${payload.sites.length})`); }
    if (Array.isArray(payload.departments)) { setDepartments(payload.departments); applied.push(`departments (${payload.departments.length})`); }
    if (Array.isArray(payload.shifts)) { setShifts(payload.shifts); applied.push(`shifts (${payload.shifts.length})`); }
    if (payload.leaveQuotas) { setLeaveQuotas(payload.leaveQuotas); applied.push("leaveQuotas"); }
    if (payload.salaryDefaults) { setSalaryDefaults(payload.salaryDefaults); applied.push("salaryDefaults"); }
    if (Array.isArray(payload.employees)) {
      setEmployees((prev) => {
        const byId = new Map(prev.map((e) => [e.staffId, e]));
        for (const e of payload.employees!) byId.set(e.staffId, e);
        return [...byId.values()];
      });
      applied.push(`employees (upsert ${payload.employees.length})`);
    }
    masterAudit("MASTER_IMPORT", "masterdata", `Impor master data: ${applied.join(", ")}`);
    return applied;
  }, [masterAudit]);

  /* ----------------------------- forgot password --------------------------- */
  const requestReset = useCallback((email: string): { ok: boolean; error?: string; token?: ResetToken; name?: string } => {
    const key = email.trim().toLowerCase();
    const emp = employeesRef.current.find((e) => e.email.toLowerCase() === key);
    if (!emp) return { ok: false, error: "Email tidak terdaftar di direktori karyawan." };
    // 60s cooldown per account
    const recent = resets.find((r) => r.email.toLowerCase() === key && Date.now() - (r.exp - 30 * 60_000) < 60_000 && !r.used);
    if (recent) return { ok: false, error: "Tautan reset masih aktif — cek kembali email Anda (berlaku 30 menit)." };
    const token: ResetToken = {
      token: `rst-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
      staffId: emp.staffId, email: emp.email, exp: Date.now() + 30 * 60_000, used: false,
    };
    setResets((prev) => [...prev.filter((r) => !(r.email.toLowerCase() === key && !r.used)), token]);
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(), actorId: emp.staffId, actorName: emp.name, role: emp.role,
      action: "PASSWORD_RESET_REQUEST", target: emp.staffId, detail: "Tautan reset kata sandi diminta (berlaku 30 menit)",
    }, ...prev]);
    return { ok: true, token, name: emp.name };
  }, [resets]);

  const consumeReset = useCallback((token: string): { ok: boolean; error?: string; name?: string } => {
    const r = resets.find((x) => x.token === token.trim());
    if (!r) return { ok: false, error: "Tautan reset tidak valid atau sudah dipakai." };
    if (r.used) return { ok: false, error: "Tautan ini sudah dipakai. Minta tautan baru." };
    if (Date.now() > r.exp) return { ok: false, error: "Tautan reset sudah kedaluwarsa (30 menit)." };
    const emp = employeesRef.current.find((e) => e.staffId === r.staffId);
    return { ok: true, name: emp?.name ?? r.email };
  }, [resets]);

  const resetPassword = useCallback((token: string, newPass: string): { ok: boolean; error?: string } => {
    const r = resets.find((x) => x.token === token.trim());
    if (!r || r.used || Date.now() > r.exp) return { ok: false, error: "Tautan reset tidak valid." };
    if (newPass.length < 6) return { ok: false, error: "Kata sandi minimal 6 karakter." };
    setEmployees((prev) => prev.map((e) => (e.staffId === r.staffId ? { ...e, password: newPass } : e)));
    setResets((prev) => prev.map((x) => (x.token === r.token ? { ...x, used: true } : x)));
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(), actorId: r.staffId, actorName: employeesRef.current.find((e) => e.staffId === r.staffId)?.name ?? r.staffId,
      role: (employeesRef.current.find((e) => e.staffId === r.staffId)?.role ?? "employee") as AuditLog["role"],
      action: "PASSWORD_RESET_SELF", target: r.staffId, detail: "Kata sandi diganti melalui tautan reset",
    }, ...prev]);
    return { ok: true };
  }, [resets]);

  /* --------------------------------- SMTP --------------------------------- */
  const updateSmtp = useCallback((patch: Partial<SmtpConfig>) => setSmtp((prev) => ({ ...prev, ...patch })), []);

  /** POST to the Netlify function; false on any failure (timeout, 4xx, 5xx, offline). */
  const postMail = useCallback(async (to: string, subject: string, html: string, text: string): Promise<{ ok: boolean; error?: string }> => {
    const cfg = smtpRef.current;
    if (!cfg.enabled || !cfg.user || !cfg.pass) return { ok: false, error: "SMTP belum dikonfigurasi." };
    try {
      const ctl = new AbortController();
      const t = window.setTimeout(() => ctl.abort(), 12_000);
      const res = await fetch("/.netlify/functions/send-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to, subject, html, text,
          config: { host: cfg.host, port: cfg.port, secure: cfg.secure, user: cfg.user, pass: cfg.pass, fromName: cfg.fromName },
        }),
        signal: ctl.signal,
      });
      window.clearTimeout(t);
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        return { ok: false, error: j?.error ?? `Fungsi email gagal (HTTP ${res.status}).` };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Fungsi email tidak terjangkau — deploy ulang agar Netlify Function aktif." };
    }
  }, []);

  /** Deliver the password-reset email — real SMTP when available, in-app inbox otherwise. */
  const deliverResetEmail = useCallback(async (to: string, name: string, link: string): Promise<"smtp" | "demo"> => {
    const appName = companyRef.current.appName ?? "Vittoria HR";
    const subject = `Reset Kata Sandi — ${appName}`;
    const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(23,42,89,0.08);">
      <div style="background:linear-gradient(135deg,#ff9d2e,#f07300);padding:28px 28px 24px;">
        <div style="width:44px;height:44px;border-radius:12px;background:#ffffff;color:#f07300;font-weight:800;font-size:22px;line-height:44px;text-align:center;">V</div>
        <h1 style="margin:14px 0 4px;color:#ffffff;font-size:20px;">Reset Kata Sandi</h1>
        <p style="margin:0;color:rgba(255,255,255,0.85);font-size:13px;">${appName}</p>
      </div>
      <div style="padding:28px;">
        <p style="margin:0 0 12px;color:#172a59;font-size:15px;">Halo <b>${name}</b>,</p>
        <p style="margin:0 0 20px;color:#5b6b8c;font-size:14px;line-height:1.6;">
          Kami menerima permintaan reset kata sandi untuk akun Anda. Klik tombol di bawah untuk membuat kata sandi baru.
        </p>
        <div style="text-align:center;margin:0 0 22px;">
          <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#ff9d2e,#f07300);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 34px;border-radius:12px;">Buat Kata Sandi Baru</a>
        </div>
        <p style="margin:0 0 6px;color:#8494b5;font-size:12px;">Atau salin tautan ini ke browser:</p>
        <p style="margin:0 0 18px;word-break:break-all;color:#f07300;font-size:12px;">${link}</p>
        <div style="background:#fdf1d7;border-radius:10px;padding:12px 14px;">
          <p style="margin:0;color:#bd7a06;font-size:12px;line-height:1.5;">⏱ Tautan berlaku <b>30 menit</b> dan hanya bisa dipakai <b>satu kali</b>. Jika Anda tidak memintanya, abaikan email ini — akun Anda tetap aman.</p>
        </div>
      </div>
      <div style="background:#f0f3fa;padding:16px 28px;text-align:center;">
        <p style="margin:0;color:#8494b5;font-size:11px;">Email otomatis dari ${appName} · Sistem Absensi & HRIS Gudang</p>
      </div>
    </div>
  </div>
</body></html>`;
    const text = `Halo ${name},\n\nReset kata sandi ${appName}: ${link}\n\nBerlaku 30 menit, sekali pakai. Abaikan jika bukan Anda.`;
    const res = await postMail(to, subject, html, text);
    if (res.ok) {
      setAudits((prev) => [{
        id: uid("aud"), ts: Date.now(), actorId: "system", actorName: "Sistem", role: "system" as const,
        action: "AUTH_PW_RESET_SENT", target: to, detail: `Email reset dikirim via SMTP (${smtpRef.current.user})`,
      }, ...prev]);
      return "smtp";
    }
    return "demo";
  }, [postMail]);

  const sendTestEmail = useCallback(async (to: string): Promise<{ ok: boolean; error?: string }> => {
    const appName = companyRef.current.appName ?? "Vittoria HR";
    const res = await postMail(
      to,
      `Tes Email Berhasil — ${appName}`,
      `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#172a59;">✉️ Koneksi SMTP berhasil!</h2>
        <p style="color:#5b6b8c;font-size:14px;">Server <b>${smtpRef.current.host}:${smtpRef.current.port}</b> menerima email dari <b>${smtpRef.current.user}</b>.</p>
        <p style="color:#5b6b8c;font-size:14px;">Email reset kata sandi dan notifikasi kini akan dikirim sungguhan ke karyawan.</p>
        <p style="color:#8494b5;font-size:12px;margin-top:20px;">— ${appName}</p>
      </div>`,
      `Tes email berhasil. Server ${smtpRef.current.host}:${smtpRef.current.port} terhubung. — ${appName}`,
    );
    const actor = sessionRef.current ? employeesRef.current.find((e) => e.staffId === sessionRef.current?.staffId) : null;
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem",
      role: (actor?.role ?? "system") as AuditLog["role"],
      action: res.ok ? "SMTP_TEST_OK" : "SMTP_TEST_FAIL", target: to,
      detail: res.ok ? `Email tes terkirim ke ${to}` : `Email tes gagal: ${res.error}`,
    }, ...prev]);
    return res;
  }, [postMail]);

  /* --------------------------------- shifts ------------------------------- */
  const addShift = useCallback((s: Shift) => setShifts((prev) => [...prev, s]), []);
  const updateShift = useCallback(
    (id: string, patch: Partial<Shift>) => setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s))),
    [],
  );
  const removeShift = useCallback((id: string) => setShifts((prev) => prev.filter((s) => s.id !== id)), []);

  /* --------------------------------- breaks ------------------------------- */
  const activeBreak = useMemo(() => {
    const s = session;
    if (!s) return null;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return breaks.find((b) => b.staffId === s.staffId && b.day === today && !b.end) ?? null;
  }, [breaks, session]);

  const startBreak = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    setBreaks((prev) => [...prev, { id: uid("brk"), staffId: s.staffId, day: today, start: Date.now(), end: null }]);
  }, []);

  const endBreak = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    setBreaks((prev) => prev.map((b) => (b.staffId === s.staffId && !b.end ? { ...b, end: Date.now() } : b)));
  }, []);

  /* --------------------------------- misc --------------------------------- */
  const markNotifsRead = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    setNotifs((prev) => prev.map((n) => (n.staffId === s.staffId ? { ...n, read: true } : n)));
  }, []);
  const updateCompany = useCallback((patch: Partial<Company>) => setCompany((prev) => ({ ...prev, ...patch })), []);
  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })), []);

  const resetAll = useCallback(() => {
    clearAll();
    const c = seedCompany();
    const s = seedSites();
    setCompany(c);
    setSites(s);
    setSiteId(s[0].id);
    setEmployees(seedEmployees());
    setShifts(seedShifts());
    setLogs(seedLogs(s));
    setLeaves(seedLeaves());
    setOrg(seedOrgNodes());
    setPayslips([]);
    setBreaks([]);
    setAudits(seedAudit());
    setNotifs(seedNotifs());
    setBoard(seedBoardPosts());
    setSettings({ ...settingsRef.current });
    setSession(null);
    db.markSeeded();
  }, []);

  const value: AppState = {
    company, sites, siteId, activeSite,
    employees, siteEmployees, logs, siteLogs, breaks, leaves, payslips, shifts,
    org, siteOrg, audits, notifs, settings,
    engine, geo, fence,
    session: sessionEmployee,
    tokenExp: session?.accessExp ?? 0,
    login, logout, switchSite, updateSite, addSite, removeSite,
    importIdentity,
    addEmployee, updateEmployee, removeEmployee, unbindDevice,
    addLog, clearLogs,
    addLeave, decideLeave,
    issuePayslip, withdrawPayslip,
    addOrgNode, updateOrgNode, removeOrgNode,
    board, postBoard, ackBoard, deleteBoard,
    departments, leaveQuotas, salaryDefaults,
    addDepartment, renameDepartment, removeDepartment,
    updateLeaveQuota, updateSalaryDefault, importMasterData,
    requestReset, consumeReset, resetPassword,
    smtp, updateSmtp, deliverResetEmail, sendTestEmail,
    addShift, updateShift, removeShift,
    activeBreak, startBreak, endBreak,
    markNotifsRead,
    updateCompany, updateSettings,
    audit, resetAll,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export type { Role };
