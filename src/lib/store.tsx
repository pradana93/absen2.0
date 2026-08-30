/**
 * Global app store — session (JWT), employees, logs, breaks, leaves,
 * payslips, shifts, company, settings, audit, notifications, live GPS,
 * face-engine tier — plus cross-tab tenant sync and identity import.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  applyBrand, AttendanceLog, AuditLog, BreakRec, clearAll, Company, db, decodeIdentity, Employee,
  ensureFreshVersion, KEY_COMPANY, LeaveRequest, Notif, Payslip, Role, seedAudit, seedCompany,
  seedEmployees, seedLeaves, seedLogs, seedNotifs, seedShifts, Settings, Shift, TenantIdentity,
} from "./database";
import { evaluateFence, FenceVerdict, GeoReading } from "./geoUtils";
import { EngineStatus, initFaceEngine, onEngineStatus } from "./faceEngine";
import { issueTokens, TokenPair } from "./jwt";
import { uid } from "./format";
import { getDeviceId, shortDevice } from "./device";

export interface LoginResult { ok: boolean; error?: string; }

interface AppState {
  company: Company;
  employees: Employee[];
  logs: AttendanceLog[];
  breaks: BreakRec[];
  leaves: LeaveRequest[];
  payslips: Payslip[];
  shifts: Shift[];
  audits: AuditLog[];
  notifs: Notif[];
  settings: Settings;
  engine: EngineStatus;
  geo: GeoReading | null;
  fence: FenceVerdict | null;
  session: Employee | null;
  tokenExp: number;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
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
      db.saveEmployees(seedEmployees());
      db.saveShifts(seedShifts());
      db.saveLogs(seedLogs({ lat: c.hqLat, lon: c.hqLon }, c.radiusM));
      db.saveLeaves(seedLeaves());
      db.saveAudit(seedAudit());
      db.saveNotifs(seedNotifs());
      db.markSeeded();
      return c;
    }
    return db.loadCompany();
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
  const sessionRef = useRef(session); sessionRef.current = session;
  const leavesRef = useRef(leaves); leavesRef.current = leaves;
  const payslipsRef = useRef(payslips); payslipsRef.current = payslips;
  const failRef = useRef<Record<string, number>>({});
  const settingsRef = useRef(settings); settingsRef.current = settings;

  /* ------------------------------ persistence ----------------------------- */
  useEffect(() => db.saveEmployees(employees), [employees]);
  useEffect(() => db.saveLogs(logs), [logs]);
  useEffect(() => db.saveBreaks(breaks), [breaks]);
  useEffect(() => db.saveLeaves(leaves), [leaves]);
  useEffect(() => db.savePayslips(payslips), [payslips]);
  useEffect(() => db.saveShifts(shifts), [shifts]);
  useEffect(() => db.saveAudit(audits), [audits]);
  useEffect(() => db.saveNotifs(notifs), [notifs]);
  useEffect(() => db.saveSettings(settings), [settings]);
  useEffect(() => db.saveCompany(company), [company]);

  /* white-label: apply brand preset + sync browser title on tenant change */
  useEffect(() => {
    applyBrand(company.brand ?? "sun");
    document.title = `${company.appName ?? "Vittoria HR"} — ${company.appTagline ?? "Absensi & HRIS"}`;
  }, [company.brand, company.appName, company.appTagline]);

  /* tenant sync across tabs/windows of this browser (storage events) */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY_COMPANY) setCompany(db.loadCompany());
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

  /* -------------------------------- session ------------------------------- */
  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
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

    /* device binding: the account locks to the device of its FIRST login.
       (Never pre-bind at creation — otherwise new staff can never log in
       from their own phone.) */
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
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(), actorId: emp.staffId, actorName: emp.name, role: emp.role,
      action: "AUTH_LOGIN", target: emp.staffId,
      detail: `Login berhasil · JWT diterbitkan (8 jam)${boundNow ? ` · perangkat ${shortDevice(dev)} diikat` : ""}`,
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
      role: (actor?.role ?? "system") as AuditLog["role"], action: "IDENTITY_IMPORT", target: identity.name,
      detail: `Identitas tenant "${identity.appName}" diterapkan via ${source}`,
    }, ...prev]);
    return true;
  }, []);

  /* auto-apply tenant identity passed via URL (#tenant=…) */
  useEffect(() => {
    const m = window.location.hash.match(/^#tenant=(.+)$/);
    if (!m) return;
    const id = decodeIdentity(decodeURIComponent(m[1]));
    if (id) {
      importIdentity(id, "tautan");
      window.history.replaceState(null, "", window.location.pathname);
    }
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

  const fence = useMemo(() => {
    if (!geo || (geo.status !== "locked" && geo.status !== "sim")) return null;
    return evaluateFence(geo, { lat: company.hqLat, lon: company.hqLon }, company.radiusM);
  }, [geo, company.hqLat, company.hqLon, company.radiusM]);

  const sessionEmployee = useMemo(
    () => (session ? employees.find((e) => e.staffId === session.staffId) ?? null : null),
    [session, employees],
  );

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
    setCompany(c);
    setEmployees(seedEmployees());
    setShifts(seedShifts());
    setLogs(seedLogs({ lat: c.hqLat, lon: c.hqLon }, c.radiusM));
    setLeaves(seedLeaves());
    setPayslips([]);
    setBreaks([]);
    setAudits(seedAudit());
    setNotifs(seedNotifs());
    setSettings({ ...settingsRef.current });
    setSession(null);
    db.markSeeded();
  }, []);

  const value: AppState = {
    company, employees, logs, breaks, leaves, payslips, shifts, audits, notifs, settings,
    engine, geo, fence,
    session: sessionEmployee,
    tokenExp: session?.accessExp ?? 0,
    login, logout, importIdentity,
    addEmployee, updateEmployee, removeEmployee, unbindDevice,
    addLog, clearLogs,
    addLeave, decideLeave,
    issuePayslip, withdrawPayslip,
    addShift, updateShift, removeShift,
    activeBreak, startBreak, endBreak,
    markNotifsRead,
    updateCompany, updateSettings,
    audit, resetAll,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function hqOf(c: Company) {
  return { lat: c.hqLat, lon: c.hqLon };
}

export type { Role };
