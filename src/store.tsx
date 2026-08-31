/**
 * store.tsx — global app state.
 * Every mutation writes to the fast localStorage JSON state AND is mirrored
 * into the embedded SQLite database (lib/sqlEngine.ts) for real-SQL querying.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AttendanceLog, AttendanceType, AuditLog, BoardPost, BreakRec, Company, db, Employee, ensureFreshVersion,
  haversineMeters, Leave, OrgNode, Role, Shift, Site, uid, wibDayKey,
} from "./lib/data";
import { hydrateFromState, initSqlEngine, SqlMeta, type HydrateSnapshot } from "./lib/sqlEngine";

export interface LoginResult { ok: boolean; error?: string; }
export interface GeoReading { lat: number; lon: number; accuracy: number; status: "searching" | "locked" | "sim"; simulated: boolean; }

interface AppState {
  company: Company; sites: Site[]; shifts: Shift[]; employees: Employee[];
  logs: AttendanceLog[]; leaves: Leave[]; breaks: BreakRec[]; org: OrgNode[]; board: BoardPost[]; audits: AuditLog[];
  session: Employee | null; activeSite: Site | null;
  sql: SqlMeta;
  geo: GeoReading | null; simGps: boolean; setSimGps: (v: boolean) => void;
  login: (email: string, password: string, siteId: string) => LoginResult;
  logout: () => void;
  audit: (action: string, target: string, detail: string) => void;
  clock: (type: AttendanceType, a: { lat: number; lon: number; distanceM: number; faceDist: number | null; photo: string | null; method: "face" | "manual" }) => AttendanceLog;
  activeBreak: BreakRec | null; startBreak: () => void; endBreak: () => void;
  addLeave: (l: Omit<Leave, "id" | "createdAt" | "managerDecision" | "hrDecision" | "status">) => void;
  decideLeave: (id: string, approve: boolean, stage: "manager" | "hr") => void;
  addEmployee: (e: Employee) => void; updateEmployee: (id: string, patch: Partial<Employee>) => void; removeEmployee: (id: string) => void;
  addSite: (s: Site) => void; updateSite: (id: string, patch: Partial<Site>) => void; removeSite: (id: string) => void;
  addShift: (s: Shift) => void; updateShift: (id: string, patch: Partial<Shift>) => void; removeShift: (id: string) => void;
  addOrg: (n: OrgNode) => void; updateOrg: (id: string, patch: Partial<OrgNode>) => void; removeOrg: (id: string) => void;
  postBoard: (p: { siteId: string | null; title: string; body: string; tone: BoardPost["tone"] }) => void;
  ackBoard: (id: string) => void; deleteBoard: (id: string) => void;
  updateCompany: (patch: Partial<Company>) => void;
  resetAll: () => void;
}

const Ctx = createContext<AppState | null>(null);
export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
function wibMinutesNow(): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  return (Number(parts.find((p) => p.type === "hour")?.value) % 24) * 60 + Number(parts.find((p) => p.type === "minute")?.value);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [company, setCompany] = useState<Company>(() => {
    ensureFreshVersion();
    if (!db.wasSeeded()) {
      const c = db.loadCompany();
      const sites = db.loadSites().length ? db.loadSites() : (db.saveSites(seedSites()), db.loadSites());
      db.saveShifts(db.loadShifts().length ? db.loadShifts() : seedShifts());
      db.saveEmployees(db.loadEmployees().length ? db.loadEmployees() : seedEmployees());
      db.saveLogs(db.loadLogs().length ? db.loadLogs() : seedLogs(sites));
      db.saveLeaves(db.loadLeaves().length ? db.loadLeaves() : seedLeaves());
      db.saveOrg(db.loadOrg().length ? db.loadOrg() : seedOrg());
      db.saveBoard(db.loadBoard().length ? db.loadBoard() : seedBoard());
      db.saveAudit(seedAudit());
      db.markSeeded();
      return c;
    }
    return db.loadCompany();
  });
  const [sites, setSites] = useState<Site[]>(() => db.loadSites());
  const [shifts, setShifts] = useState<Shift[]>(() => db.loadShifts());
  const [employees, setEmployees] = useState<Employee[]>(() => db.loadEmployees());
  const [logs, setLogs] = useState<AttendanceLog[]>(() => db.loadLogs());
  const [leaves, setLeaves] = useState<Leave[]>(() => db.loadLeaves());
  const [breaks, setBreaks] = useState<BreakRec[]>(() => db.loadBreaks());
  const [org, setOrg] = useState<OrgNode[]>(() => db.loadOrg());
  const [board, setBoard] = useState<BoardPost[]>(() => db.loadBoard());
  const [audits, setAudits] = useState<AuditLog[]>(() => db.loadAudit());
  const [session, setSession] = useState<{ staffId: string; siteId: string } | null>(() => db.loadSession());
  const [sql, setSql] = useState<SqlMeta>({ ok: false, version: "—", backend: "…", sizeBytes: 0 });
  const [geo, setGeo] = useState<GeoReading | null>(null);
  const [simGps, setSimGps] = useState(false);

  /* refs for callbacks */
  const employeesRef = useRef(employees); employeesRef.current = employees;
  const sitesRef = useRef(sites); sitesRef.current = sites;
  const shiftsRef = useRef(shifts); shiftsRef.current = shifts;
  const logsRef = useRef(logs); logsRef.current = logs;
  const breaksRef = useRef(breaks); breaksRef.current = breaks;
  const sessionRef = useRef(session); sessionRef.current = session;
  const companyRef = useRef(company); companyRef.current = company;
  const simRef = useRef(simGps); simRef.current = simGps;

  /* persistence */
  useEffect(() => db.saveCompany(company), [company]);
  useEffect(() => db.saveSites(sites), [sites]);
  useEffect(() => db.saveShifts(shifts), [shifts]);
  useEffect(() => db.saveEmployees(employees), [employees]);
  useEffect(() => db.saveLogs(logs), [logs]);
  useEffect(() => db.saveLeaves(leaves), [leaves]);
  useEffect(() => db.saveBreaks(breaks), [breaks]);
  useEffect(() => db.saveOrg(org), [org]);
  useEffect(() => db.saveBoard(board), [board]);
  useEffect(() => db.saveAudit(audits), [audits]);
  useEffect(() => db.saveSession(session), [session]);

  /* boot the embedded SQL engine, then keep it hydrated from the JSON state */
  useEffect(() => { void initSqlEngine().then(setSql); }, []);
  const snapshot: HydrateSnapshot = useMemo(() => ({
    companies: [company], sites, shifts,
    employees: employees.map((e) => ({ ...e })),
    logs, leaves, breaks, org, board, audits,
  }), [company, sites, shifts, employees, logs, leaves, breaks, org, board, audits]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      hydrateFromState(snapshot);
      void initSqlEngine().then(setSql);
    }, 350);
    return () => window.clearTimeout(t);
  }, [snapshot]);

  /* live GPS (or simulation anchored at the active site's HQ) */
  const activeSite = useMemo(() => sites.find((s) => s.id === session?.siteId) ?? null, [sites, session?.siteId]);
  useEffect(() => {
    if (simGps) {
      const hq = activeSite ?? sitesRef.current[0];
      if (!hq) return;
      const mk = (): GeoReading => ({ lat: hq.hqLat + (Math.random() - 0.5) * 0.00004, lon: hq.hqLon + (Math.random() - 0.5) * 0.00004, accuracy: 8, status: "sim", simulated: true });
      setGeo(mk());
      const iv = window.setInterval(() => setGeo(mk()), 4000);
      return () => window.clearInterval(iv);
    }
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setGeo({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, status: "locked", simulated: false }),
      () => setGeo((g) => g ?? { lat: 0, lon: 0, accuracy: 0, status: "searching", simulated: false }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [simGps, activeSite?.id]);

  const sessionEmployee = useMemo(() => (session ? employees.find((e) => e.staffId === session.staffId) ?? null : null), [session, employees]);

  /* ------------------------------- audit ---------------------------------- */
  const audit = useCallback((action: string, target: string, detail: string) => {
    const s = sessionRef.current;
    const actor = s ? employeesRef.current.find((e) => e.staffId === s.staffId) : null;
    setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem", role: (actor?.role ?? "system") as Role | "system", action, target, detail }, ...prev]);
  }, []);

  /* -------------------------------- auth ---------------------------------- */
  const login = useCallback((email: string, password: string, siteId: string): LoginResult => {
    const emp = employeesRef.current.find((e) => e.email.toLowerCase() === email.trim().toLowerCase());
    if (!emp || emp.password !== password) return { ok: false, error: "Email atau kata sandi salah." };
    if (emp.status !== "active") return { ok: false, error: "Akun nonaktif — hubungi Admin HR." };
    setSession({ staffId: emp.staffId, siteId });
    const s = sitesRef.current.find((x) => x.id === siteId);
    setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: emp.staffId, actorName: emp.name, role: emp.role, action: "AUTH_LOGIN", target: emp.staffId, detail: `Login di ${s?.shortName ?? siteId}` }, ...prev]);
    return { ok: true };
  }, []);
  const logout = useCallback(() => {
    audit("AUTH_LOGOUT", sessionRef.current?.staffId ?? "—", "Sesi diakhiri");
    setSession(null);
  }, [audit]);

  /* ------------------------------ attendance ------------------------------ */
  const clock = useCallback((type: AttendanceType, a: { lat: number; lon: number; distanceM: number; faceDist: number | null; photo: string | null; method: "face" | "manual" }): AttendanceLog => {
    const s = sessionRef.current!;
    const emp = employeesRef.current.find((e) => e.staffId === s.staffId)!;
    const site = sitesRef.current.find((x) => x.id === s.siteId)!;
    const shift = shiftsRef.current.find((x) => x.id === emp.shiftId);
    const now = Date.now();
    const mins = wibMinutesNow();
    let lateMin: number | undefined; let overtimeMin: number | undefined; let workMin: number | undefined;
    if (type === "IN" && shift && shift.id !== "sh-fleks") {
      if (mins > toMin(shift.start) + shift.graceMin) lateMin = mins - toMin(shift.start);
    }
    if (type === "OUT" && shift && shift.id !== "sh-fleks") {
      if (toMin(shift.end) > toMin(shift.start) && mins > toMin(shift.end)) overtimeMin = mins - toMin(shift.end);
      const dayIn = logsRef.current.find((l) => l.staffId === emp.staffId && l.type === "IN" && l.status === "VERIFIED" && wibDayKey(new Date(l.ts)) === wibDayKey(new Date(now)));
      if (dayIn) {
        const brk = breaksRef.current.filter((b) => b.staffId === emp.staffId && b.day === wibDayKey(new Date(now)) && b.end).reduce((acc, b) => acc + (b.end! - b.start), 0) / 60000;
        workMin = Math.max(0, Math.round((now - dayIn.ts) / 60000 - brk));
      }
    }
    const rec: AttendanceLog = {
      id: uid("log"), ts: now, staffId: emp.staffId, name: emp.name, department: emp.department, siteId: site.id,
      type, lat: a.lat, lon: a.lon, distanceM: a.distanceM, faceDist: a.faceDist,
      method: a.method, source: a.method === "manual" ? "manual" : simRef.current ? "sim" : "gps",
      status: "VERIFIED", reason: null, lateMin, overtimeMin, workMin, photo: a.photo,
    };
    setLogs((prev) => [rec, ...prev]);
    audit(`CLOCK_${type}`, emp.staffId, `${type === "IN" ? "Check-in" : "Check-out"} · ${Math.round(a.distanceM)} m dari HQ${lateMin ? ` · telat ${lateMin}m` : ""}`);
    return rec;
  }, [audit]);

  /* -------------------------------- breaks -------------------------------- */
  const activeBreak = useMemo(() => {
    if (!session) return null;
    const today = wibDayKey(new Date());
    return breaks.find((b) => b.staffId === session.staffId && b.day === today && !b.end) ?? null;
  }, [breaks, session]);
  const startBreak = useCallback(() => {
    const s = sessionRef.current; if (!s) return;
    setBreaks((prev) => [...prev, { id: uid("brk"), staffId: s.staffId, day: wibDayKey(new Date()), start: Date.now(), end: null }]);
  }, []);
  const endBreak = useCallback(() => {
    const s = sessionRef.current; if (!s) return;
    setBreaks((prev) => prev.map((b) => (b.staffId === s.staffId && !b.end ? { ...b, end: Date.now() } : b)));
  }, []);

  /* -------------------------------- leaves -------------------------------- */
  const addLeave = useCallback((l: Omit<Leave, "id" | "createdAt" | "managerDecision" | "hrDecision" | "status">) => {
    setLeaves((prev) => [{ ...l, id: uid("lv"), status: "pending", managerDecision: null, hrDecision: null, createdAt: Date.now() }, ...prev]);
    audit("LEAVE_REQUEST", l.staffId, `${l.type} · ${l.days} hari`);
  }, [audit]);
  const decideLeave = useCallback((id: string, approve: boolean, stage: "manager" | "hr") => {
    const actor = employeesRef.current.find((e) => e.staffId === sessionRef.current?.staffId);
    setLeaves((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const dec = { by: actor?.name ?? "Admin", at: Date.now() };
      if (stage === "manager") return approve ? { ...l, status: "pending_hr" as const, managerDecision: dec } : { ...l, status: "rejected" as const, managerDecision: dec };
      return approve ? { ...l, status: "approved" as const, hrDecision: dec } : { ...l, status: "rejected" as const, hrDecision: dec };
    }));
    audit(stage === "manager" ? (approve ? "LEAVE_APPROVE_MGR" : "LEAVE_REJECT_MGR") : approve ? "LEAVE_APPROVE_HR" : "LEAVE_REJECT_HR", id, `${stage} → ${approve ? "setuju" : "tolak"}`);
  }, [audit]);

  /* --------------------------------- CRUD --------------------------------- */
  const addEmployee = useCallback((e: Employee) => { setEmployees((p) => [e, ...p]); audit("USER_CREATE", e.staffId, `Akun ${e.name} dibuat`); }, [audit]);
  const updateEmployee = useCallback((id: string, patch: Partial<Employee>) => setEmployees((p) => p.map((e) => (e.staffId === id ? { ...e, ...patch } : e))), []);
  const removeEmployee = useCallback((id: string) => { setEmployees((p) => p.filter((e) => e.staffId !== id)); audit("USER_DELETE", id, "Akun dihapus"); }, [audit]);
  const addSite = useCallback((s: Site) => { setSites((p) => [...p, s]); audit("SITE_CREATE", s.id, `Gudang ${s.name}`); }, [audit]);
  const updateSite = useCallback((id: string, patch: Partial<Site>) => setSites((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s))), []);
  const removeSite = useCallback((id: string) => setSites((p) => p.filter((s) => s.id !== id)), []);
  const addShift = useCallback((s: Shift) => setShifts((p) => [...p, s]), []);
  const updateShift = useCallback((id: string, patch: Partial<Shift>) => setShifts((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s))), []);
  const removeShift = useCallback((id: string) => setShifts((p) => p.filter((s) => s.id !== id)), []);
  const addOrg = useCallback((n: OrgNode) => setOrg((p) => [...p, n]), []);
  const updateOrg = useCallback((id: string, patch: Partial<OrgNode>) => setOrg((p) => p.map((n) => (n.id === id ? { ...n, ...patch } : n))), []);
  const removeOrg = useCallback((id: string) => {
    setOrg((p) => {
      const v = p.find((n) => n.id === id);
      return p.filter((n) => n.id !== id).map((n) => (n.parentId === id ? { ...n, parentId: v?.parentId ?? null } : n));
    });
  }, []);
  const postBoard = useCallback((b: { siteId: string | null; title: string; body: string; tone: BoardPost["tone"] }) => {
    const actor = employeesRef.current.find((e) => e.staffId === sessionRef.current?.staffId);
    setBoard((p) => [{ ...b, id: uid("an"), createdBy: actor?.name ?? "Admin", createdAt: Date.now(), acks: [] }, ...p]);
    audit("BOARD_POST", b.title, "Pengumuman diposting");
  }, [audit]);
  const ackBoard = useCallback((id: string) => {
    const sid = sessionRef.current?.staffId; if (!sid) return;
    setBoard((p) => p.map((b) => (b.id === id && !b.acks.includes(sid) ? { ...b, acks: [...b.acks, sid] } : b)));
  }, []);
  const deleteBoard = useCallback((id: string) => setBoard((p) => p.filter((b) => b.id !== id)), []);
  const updateCompany = useCallback((patch: Partial<Company>) => setCompany((p) => ({ ...p, ...patch })), []);

  const resetAll = useCallback(() => {
    clearAll();
    window.location.reload();
  }, []);

  const value: AppState = {
    company, sites, shifts, employees, logs, leaves, breaks, org, board, audits,
    session: sessionEmployee, activeSite, sql, geo, simGps, setSimGps,
    login, logout, audit, clock, activeBreak, startBreak, endBreak,
    addLeave, decideLeave,
    addEmployee, updateEmployee, removeEmployee,
    addSite, updateSite, removeSite, addShift, updateShift, removeShift,
    addOrg, updateOrg, removeOrg, postBoard, ackBoard, deleteBoard,
    updateCompany, resetAll,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

import { clearAll, seedAudit, seedBoard, seedEmployees, seedLeaves, seedLogs, seedOrg, seedSites, seedShifts } from "./lib/data";
