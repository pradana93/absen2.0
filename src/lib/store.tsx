/**
 * Global store — session (JWT), sites, employees, logs, breaks, leaves,
 * board, org, shifts, master collections, audit, notifications, live GPS,
 * face-engine tier, and the embedded SQLite engine lifecycle.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AttendanceLog, AttendanceType, AuditLog, BoardPost, BreakRec, Company, db, decodeIdentity, Employee,
  ensureFreshVersion, hydrateFromSql, LeaveRequest, LeaveStatus, LeaveType, MasterPayload, Notif, OrgNode, setCloudWrites,
  Payslip, ResetToken, Role, SalaryStructure, seedAudit, seedBoardPosts, seedCompany, seedEmployees,
  seedLeaves, seedLogs, seedNotifs, seedOrgNodes, seedShifts, seedSites, Settings, Shift, Site, SmtpConfig,
  TenantIdentity,
} from "./database";
import { uid } from "./format";
import { evaluateFence, FenceVerdict, GeoReading } from "./geoUtils";
import { EngineStatus, initFaceEngine, onEngineStatus } from "./faceEngine";
import { issueTokens, SessionState } from "./jwt";
import { getDeviceId, shortDevice } from "./device";
import { bootSqlSync } from "./database";
import type { SqlMeta, SqlResult } from "./sql/engine";

/* SQL engine loads lazily — WASM stays out of the critical path */
let sqlEng: typeof import("./sql/engine") | null = null;
const sqlEngine = () => import("./sql/engine").then((m) => { sqlEng = m; return m; });

export interface LoginResult { ok: boolean; error?: string; }

export interface CloudMeta {
  status: import("./sql/cloud").CloudStatus;
  ready: boolean;
  rows: number;
  counts: Record<string, number>;
  version: string | null;
  lastSync: number | null;
  reason: string | null;
  serverVersion: string | null;
  presenceActive: number;
}

interface AppState {
  company: Company; sites: Site[]; siteId: string; activeSite: Site;
  employees: Employee[]; siteEmployees: Employee[];
  logs: AttendanceLog[]; leaves: LeaveRequest[]; leaveQuotas: Record<LeaveType, number>;
  salaryDefaults: Record<Role, SalaryStructure>; departments: string[];
  shifts: Shift[]; org: OrgNode[]; siteOrg: OrgNode[]; board: BoardPost[];
  audits: AuditLog[]; notifs: Notif[]; breaks: BreakRec[]; payslips: Payslip[];
  settings: Settings; smtp: SmtpConfig;
  engine: EngineStatus; geo: GeoReading | null; fence: FenceVerdict | null;
  session: Employee | null; tokenExp: number;
  sql: SqlMeta; refreshSql: () => void; runSql: (q: string) => { ok: true; result: SqlResult } | { ok: false; error: string };
  exportSqlFile: () => void; vacuumSql: () => void;
  cloud: CloudMeta;
  presence: import("./sql/cloud").PresenceRow[];
  cloudInitNow: () => Promise<{ ok: boolean; error?: string }>;
  cloudPullNow: () => Promise<boolean>;
  cloudPing: () => Promise<import("./sql/cloud").PingResult>;

  login: (email: string, password: string, siteId: string) => Promise<LoginResult>;
  logout: () => void;
  importIdentity: (id: TenantIdentity, source: string) => boolean;
  switchSite: (siteId: string) => void;

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

  addSite: (s: Site) => void;
  updateSite: (id: string, patch: Partial<Site>) => void;
  removeSite: (id: string) => boolean;

  addShift: (s: Shift) => void;
  updateShift: (id: string, patch: Partial<Shift>) => void;
  removeShift: (id: string) => void;

  addOrgNode: (n: OrgNode) => void;
  updateOrgNode: (id: string, patch: Partial<OrgNode>) => void;
  removeOrgNode: (id: string) => void;

  postBoard: (p: { siteId: string | null; title: string; body: string; tone: BoardPost["tone"] }) => void;
  ackBoard: (id: string) => void;
  deleteBoard: (id: string) => void;

  addDepartment: (name: string) => void;
  renameDepartment: (from: string, to: string) => void;
  removeDepartment: (name: string) => boolean;
  updateLeaveQuota: (t: LeaveType, days: number) => void;
  updateSalaryDefault: (r: Role, patch: Partial<SalaryStructure>) => void;
  importMasterData: (payload: MasterPayload) => string[];

  requestReset: (email: string) => { ok: boolean; error?: string; token?: ResetToken; name?: string };
  consumeReset: (token: string) => { ok: boolean; error?: string; name?: string };
  resetPassword: (token: string, newPass: string) => { ok: boolean; error?: string };
  deliverResetEmail: (to: string, name: string, link: string) => Promise<"smtp" | "demo">;
  sendTestEmail: (to: string) => Promise<{ ok: boolean; error?: string }>;
  updateSmtp: (patch: Partial<SmtpConfig>) => void;

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
  /* ------------------------------- boot ---------------------------------- */
  const [company, setCompany] = useState<Company>(() => {
    ensureFreshVersion();
    if (!db.wasSeeded()) {
      const c = seedCompany();
      db.saveCompany(c);
      db.saveSites(seedSites());
      db.saveShifts(seedShifts());
      db.saveEmployees(seedEmployees());
      db.saveLogs(seedLogs(seedSites()));
      db.saveLeaves(seedLeaves());
      db.saveOrg(seedOrgNodes());
      db.saveBoard(seedBoardPosts());
      db.saveAudit(seedAudit());
      db.saveNotifs(seedNotifs());
      db.markSeeded();
      return c;
    }
    return db.loadCompany();
  });
  const [sites, setSites] = useState<Site[]>(() => db.loadSites());
  const [siteId, setSiteId] = useState<string>(() => db.loadSiteChoice() ?? db.loadSites()[0]?.id ?? "site-vit");
  const [employees, setEmployees] = useState<Employee[]>(() => db.loadEmployees());
  const [logs, setLogs] = useState<AttendanceLog[]>(() => db.loadLogs());
  const [leaves, setLeaves] = useState<LeaveRequest[]>(() => db.loadLeaves());
  const [leaveQuotas, setLeaveQuotas] = useState<Record<LeaveType, number>>(() => db.loadQuotas());
  const [salaryDefaults, setSalaryDefaults] = useState<Record<Role, SalaryStructure>>(() => db.loadSalaryDefaults());
  const [departments, setDepartments] = useState<string[]>(() => db.loadDepartments());
  const [shifts, setShifts] = useState<Shift[]>(() => { const s = db.loadShifts(); return s.length ? s : seedShifts(); });
  const [org, setOrg] = useState<OrgNode[]>(() => { const o = db.loadOrg(); return o.length ? o : seedOrgNodes(); });
  const [board, setBoard] = useState<BoardPost[]>(() => db.loadBoard());
  const [audits, setAudits] = useState<AuditLog[]>(() => db.loadAudit());
  const [notifs, setNotifs] = useState<Notif[]>(() => db.loadNotifs());
  const [breaks, setBreaks] = useState<BreakRec[]>(() => db.loadBreaks());
  const [payslips, setPayslips] = useState<Payslip[]>(() => {
    try { return JSON.parse(localStorage.getItem("vittoria:payslips") ?? "[]") as Payslip[]; } catch { return []; }
  });
  const [settings, setSettings] = useState<Settings>(() => db.loadSettings());
  const [smtp, setSmtp] = useState<SmtpConfig>(() => db.loadSmtp());
  const [resets, setResets] = useState<ResetToken[]>(() => db.loadResets());
  const [engine, setEngine] = useState<EngineStatus>("boot");
  const [geo, setGeo] = useState<GeoReading | null>(null);
  const [sql, setSql] = useState<SqlMeta>({ status: "boot", version: "—", sizeKB: 0, tables: 0, rows: 0 });
  const [cloud, setCloud] = useState<CloudMeta>({ status: "off", ready: false, rows: 0, counts: {}, version: null, lastSync: null, reason: null, serverVersion: null, presenceActive: 0 });
  const [presence, setPresence] = useState<import("./sql/cloud").PresenceRow[]>([]);
  const cloudHadDataRef = useRef(false);
  const revsRef = useRef<Record<string, string>>({});
  const [session, setSession] = useState<SessionState | null>(() => {
    const s = db.loadSession();
    if (!s) return null;
    if (Date.now() > s.refreshExp) { db.saveSession(null); return null; }
    return s as SessionState;
  });

  /* refs */
  const employeesRef = useRef(employees); employeesRef.current = employees;
  const companyRef = useRef(company); companyRef.current = company;
  const sessionRef = useRef(session); sessionRef.current = session;
  const leavesRef = useRef(leaves); leavesRef.current = leaves;
  const payslipsRef = useRef(payslips); payslipsRef.current = payslips;
  const smtpRef = useRef(smtp); smtpRef.current = smtp;
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const sitesRef = useRef(sites); sitesRef.current = sites;
  const boardRef = useRef(board); boardRef.current = board;
  const failRef = useRef<Record<string, number>>({});

  /* ----------------------------- persistence ----------------------------- */
  useEffect(() => db.saveCompany(company), [company]);
  useEffect(() => db.saveSites(sites), [sites]);
  useEffect(() => db.saveSiteChoice(siteId), [siteId]);
  useEffect(() => db.saveEmployees(employees), [employees]);
  useEffect(() => db.saveLogs(logs), [logs]);
  useEffect(() => db.saveLeaves(leaves), [leaves]);
  useEffect(() => db.saveQuotas(leaveQuotas), [leaveQuotas]);
  useEffect(() => db.saveSalaryDefaults(salaryDefaults), [salaryDefaults]);
  useEffect(() => db.saveDepartments(departments), [departments]);
  useEffect(() => db.saveShifts(shifts), [shifts]);
  useEffect(() => db.saveOrg(org), [org]);
  useEffect(() => db.saveBoard(board), [board]);
  useEffect(() => db.saveAudit(audits), [audits]);
  useEffect(() => db.saveNotifs(notifs), [notifs]);
  useEffect(() => db.saveBreaks(breaks), [breaks]);
  useEffect(() => db.saveResets(resets), [resets]);
  useEffect(() => db.saveSettings(settings), [settings]);
  useEffect(() => db.saveSmtp(smtp), [smtp]);
  useEffect(() => db.saveSession(session), [session]);
  useEffect(() => {
    try { localStorage.setItem("vittoria:payslips", JSON.stringify(payslips)); } catch { /* noop */ }
  }, [payslips]);

  /* ------------------------- engines & live inputs ------------------------ */
  useEffect(() => {
    const off = onEngineStatus(setEngine);
    initFaceEngine();
    return off;
  }, []);

  /* embedded SQL: lazy-load WASM → boot → migrate cache → hydrate → live stats */
  useEffect(() => {
    let disposed = false;
    let off: (() => void) | null = null;
    void sqlEngine().then(async (eng) => {
      if (disposed) return;
      off = eng.onSqlStatus(() => setSql(eng.sqlStats()));
      await eng.initSqlEngine();
      if (disposed) return;
      await bootSqlSync();
      const h = await hydrateFromSql();
      if (disposed) return;
      if (h) {
        if ((h.employees as Employee[]).length) setEmployees(h.employees as Employee[]);
        if ((h.logs as AttendanceLog[]).length) setLogs(h.logs as AttendanceLog[]);
        if ((h.leaves as LeaveRequest[]).length) setLeaves(h.leaves as LeaveRequest[]);
        if ((h.org as OrgNode[]).length) setOrg(h.org as OrgNode[]);
        if ((h.board as BoardPost[]).length) setBoard(h.board as BoardPost[]);
        if ((h.audits as AuditLog[]).length) setAudits(h.audits as AuditLog[]);
        if ((h.notifs as Notif[]).length) setNotifs(h.notifs as Notif[]);
        if ((h.breaks as BreakRec[]).length) setBreaks(h.breaks as BreakRec[]);
        if ((h.shifts as Shift[]).length) setShifts(h.shifts as Shift[]);
        if ((h.sites as Site[]).length) setSites(h.sites as Site[]);
        if ((h.company as Company[]).length) setCompany(h.company[0] as Company);
        if ((h.departments as { name: string }[]).length) setDepartments((h.departments as { name: string }[]).map((d) => d.name));
        if ((h.quotas as { type: LeaveType; days: number }[]).length) {
          setLeaveQuotas((prev) => {
            const next = { ...prev };
            (h.quotas as { type: LeaveType; days: number }[]).forEach((q) => { next[q.type] = q.days; });
            return next;
          });
        }
        if ((h.salarydefaults as ({ role: Role } & SalaryStructure)[]).length) {
          setSalaryDefaults((prev) => {
            const next = { ...prev };
            (h.salarydefaults as ({ role: Role } & SalaryStructure)[]).forEach((s) => {
              const { role, ...rest } = s;
              next[role] = rest as SalaryStructure;
            });
            return next;
          });
        }
      }
      setSql(eng.sqlStats());

      /* Fase 2: connect to Netlify DB through the cloud function */
      const cl = await import("./sql/cloud");
      if (disposed) return;
      cl.onCloudStatus((s) => setCloud((prev) => ({ ...prev, status: s })));
      /* probe first: cheap stats tells us *why* we're local if it fails */
      const st = await cl.cloudStats();
      if (disposed) return;
      if (!st) {
        const isLocal = /localhost|127\.0\.0\.1/.test(window.location.hostname);
        setCloud((prev) => ({
          ...prev, status: "off",
          reason: isLocal
            ? "Dibuka dari localhost — fungsi cloud hanya hidup di URL Netlify. Untuk dev lokal pakai `netlify dev`."
            : "Fungsi cloud tidak terjangkau — deploy ulang site & pastikan Netlify DB ter-link (env DATABASE_URL ada).",
        }));
      } else {
        revsRef.current = st.revs;
        const pull = await cl.cloudPull();
        if (disposed) return;
        if (pull.ok) {
          cl.setCloudActive(true);
          setCloudWrites(true);
          cloudHadDataRef.current = pull.hasData;
          setCloud({
            status: "on", ready: pull.ready, rows: st.rows, counts: pull.counts, version: pull.version,
            lastSync: Date.now(), reason: null, serverVersion: st.serverVersion || null, presenceActive: st.presenceActive.length,
          });
          setPresence(st.presenceActive);
          if (pull.ready && pull.hasData) applyCloudData(pull.data);
          void cl.flushQueue();
        } else {
          setCloud((prev) => ({ ...prev, status: "error", reason: `Pull gagal: ${pull.error ?? "periksa log fungsi di Netlify."}` }));
        }
      }
    });
    const onPersisted = () => { if (sqlEng) setSql(sqlEng.sqlStats()); };
    const onCloudSynced = () => setCloud((prev) => ({ ...prev, lastSync: Date.now() }));
    window.addEventListener("vittoria:sql-persisted", onPersisted);
    window.addEventListener("vittoria:cloud-synced", onCloudSynced);
    return () => {
      disposed = true; off?.();
      window.removeEventListener("vittoria:sql-persisted", onPersisted);
      window.removeEventListener("vittoria:cloud-synced", onCloudSynced);
    };
  }, []);

  const refreshSql = useCallback(() => { void sqlEngine().then((e) => setSql(e.sqlStats())); }, []);
  const runSql = useCallback(
    (q: string) =>
      sqlEng ? sqlEng.sqlConsole(q) : { ok: false as const, error: "Mesin SQL belum siap — coba sesaat lagi." },
    [],
  );
  const exportSqlFile = useCallback(() => {
    void sqlEngine().then((eng) => {
      const bytes = eng.sqlExportBytes();
      if (!bytes) return;
      const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `vittoria-${new Date().toISOString().slice(0, 10)}.sqlite`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
  }, []);
  const vacuumSql = useCallback(() => { void sqlEngine().then((e) => { e.sqlVacuum(); setSql(e.sqlStats()); }); }, []);

  /* --------------------- Fase 2: Netlify DB (Postgres) -------------------- */
  /** All collections as prop-shaped rows, read from the always-current hot cache. */
  const localSnapshot = useCallback((): Array<[string, unknown[]]> => [
    ["company", [db.loadCompany() as unknown]],
    ["sites", db.loadSites() as unknown[]],
    ["employees", db.loadEmployees() as unknown[]],
    ["logs", db.loadLogs() as unknown[]],
    ["leaves", db.loadLeaves() as unknown[]],
    ["shifts", db.loadShifts() as unknown[]],
    ["org", db.loadOrg() as unknown[]],
    ["board", db.loadBoard() as unknown[]],
    ["departments", db.loadDepartments().map((name) => ({ name }))],
    ["quotas", Object.entries(db.loadQuotas()).map(([type, days]) => ({ type, days }))],
    ["salarydefaults", Object.entries(db.loadSalaryDefaults()).map(([role, s]) => ({ role, ...s }))],
    ["audits", db.loadAudit() as unknown[]],
    ["notifs", db.loadNotifs() as unknown[]],
    ["breaks", db.loadBreaks() as unknown[]],
    ["resets", db.loadResets() as unknown[]],
  ], []);

  /** Apply pulled cloud rows to React state (safe for partial pulls). */
  const applyCloudData = useCallback((d: Record<string, unknown[]>) => {
    if ((d.employees as Employee[] | undefined)?.length) setEmployees(d.employees as Employee[]);
    if ((d.logs as AttendanceLog[] | undefined)?.length) setLogs(d.logs as AttendanceLog[]);
    if ((d.leaves as LeaveRequest[] | undefined)?.length) setLeaves(d.leaves as LeaveRequest[]);
    if ((d.org as OrgNode[] | undefined)?.length) setOrg(d.org as OrgNode[]);
    if ((d.board as BoardPost[] | undefined)?.length) setBoard(d.board as BoardPost[]);
    if ((d.audits as AuditLog[] | undefined)?.length) setAudits(d.audits as AuditLog[]);
    if ((d.notifs as Notif[] | undefined)?.length) setNotifs(d.notifs as Notif[]);
    if ((d.breaks as BreakRec[] | undefined)?.length) setBreaks(d.breaks as BreakRec[]);
    if ((d.shifts as Shift[] | undefined)?.length) setShifts(d.shifts as Shift[]);
    if ((d.sites as Site[] | undefined)?.length) setSites(d.sites as Site[]);
    if ((d.company as Company[] | undefined)?.length) setCompany((d.company as Company[])[0]);
    if ((d.departments as { name: string }[] | undefined)?.length) setDepartments((d.departments as { name: string }[]).map((x) => x.name));
    if ((d.quotas as { type: LeaveType; days: number }[] | undefined)?.length) {
      setLeaveQuotas((prev) => {
        const next = { ...prev };
        (d.quotas as { type: LeaveType; days: number }[]).forEach((x) => { next[x.type] = x.days; });
        return next;
      });
    }
    if ((d.salarydefaults as ({ role: Role } & SalaryStructure)[] | undefined)?.length) {
      setSalaryDefaults((prev) => {
        const next = { ...prev };
        (d.salarydefaults as ({ role: Role } & SalaryStructure)[]).forEach((x) => {
          const { role, ...rest } = x;
          next[role] = rest as SalaryStructure;
        });
        return next;
      });
    }
  }, []);

  /** Create the schema in the Netlify DB; upload local data if the DB was empty. */
  const cloudInitNow = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const cl = await import("./sql/cloud");
    const res = await cl.cloudInit();
    if (!res.ok) return res;
    cl.setCloudActive(true);
    setCloudWrites(true);
    setCloud((prev) => ({ ...prev, status: "on", ready: true, lastSync: Date.now() }));
    if (!cloudHadDataRef.current) {
      for (const [key, rows] of localSnapshot()) cl.queueCloudSync(key, rows);
    }
    return res;
  }, [localSnapshot]);

  /** Manual re-pull: cloud wins, local caches are refreshed underneath. */
  const cloudPullNow = useCallback(async (): Promise<boolean> => {
    const cl = await import("./sql/cloud");
    const [pull, st] = await Promise.all([cl.cloudPull(), cl.cloudStats()]);
    if (!pull.ok) return false;
    cl.setCloudActive(true);
    setCloudWrites(true);
    cloudHadDataRef.current = pull.hasData;
    if (st) revsRef.current = st.revs;
    setCloud({
      status: "on", ready: pull.ready, rows: st?.rows ?? pull.rows, counts: pull.counts, version: pull.version,
      lastSync: Date.now(), reason: null, serverVersion: st?.serverVersion ?? null, presenceActive: st?.presenceActive.length ?? 0,
    });
    if (st) setPresence(st.presenceActive);
    if (pull.ready && pull.hasData) applyCloudData(pull.data);
    void cl.flushQueue();
    return true;
  }, [applyCloudData]);

  /** End-to-end health check against the Netlify DB. */
  const cloudPing = useCallback(() => import("./sql/cloud").then((m) => m.cloudPing()), []);

  /* live sync ticker: poll revisions → pull only changed tables; refresh presence */
  useEffect(() => {
    const SYNCABLE = ["company", "sites", "employees", "logs", "leaves", "shifts", "org", "board", "departments", "quotas", "salarydefaults", "audits", "notifs", "breaks", "resets"];
    const statsIv = window.setInterval(async () => {
      const cl = await import("./sql/cloud");
      if (!cl.cloudActive()) return;
      const st = await cl.cloudStats();
      if (!st) return;
      setPresence(st.presenceActive);
      setCloud((prev) => ({ ...prev, rows: st.rows, serverVersion: st.serverVersion || prev.serverVersion, presenceActive: st.presenceActive.length, reason: null }));
      const prevRevs = revsRef.current;
      const changed = Object.keys(st.revs).filter((k) => st.revs[k] !== prevRevs[k]);
      const removed = Object.keys(prevRevs).filter((k) => !(k in st.revs));
      const diff = [...new Set([...changed, ...removed])].filter((k) => SYNCABLE.includes(k));
      revsRef.current = st.revs;
      if (diff.length) {
        const pull = await cl.cloudPull(diff);
        if (pull.ok) {
          applyCloudData(pull.data);
          setCloud((prev) => ({ ...prev, lastSync: Date.now(), counts: { ...prev.counts, ...pull.counts } }));
          try { window.dispatchEvent(new Event("vittoria:cloud-synced")); } catch { /* noop */ }
        }
      }
      void cl.flushQueue();
    }, 20_000);
    return () => window.clearInterval(statsIv);
  }, [applyCloudData]);

  /* presence heartbeat — announces this device every 45s while logged in */
  useEffect(() => {
    if (!sessionRef.current) return;
    const beat = () => {
      const s = sessionRef.current;
      if (!s) return;
      const emp = employeesRef.current.find((e) => e.staffId === s.staffId);
      void import("./sql/cloud").then((cl) => {
        if (!cl.cloudActive()) return null;
        return cl.heartbeat({
          deviceId: getDeviceId(),
          staffId: s.staffId,
          name: emp?.name ?? "…",
          role: emp?.role ?? "employee",
          siteId: emp?.siteId ?? null,
          siteName: sitesRef.current.find((x) => x.id === (emp?.siteId ?? null))?.shortName ?? null,
        });
      }).then((rows) => { if (rows) setPresence(rows); });
    };
    beat();
    const iv = window.setInterval(beat, 45_000);
    return () => window.clearInterval(iv);
  }, [session?.staffId]);

  /* live GPS */
  useEffect(() => {
    if (settings.simEnabled) {
      const mk = (): GeoReading => ({
        lat: settingsRef.current.simLat + (Math.random() - 0.5) * 0.00006,
        lon: settingsRef.current.simLon + (Math.random() - 0.5) * 0.00006,
        accuracy: 6 + Math.random() * 6, status: "sim", ts: Date.now(), simulated: true,
      });
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
      (pos) => setGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 0, status: "locked", ts: Date.now(), simulated: false }),
      (err) => setGeo((prev) => ({ lat: prev?.lat ?? 0, lon: prev?.lon ?? 0, accuracy: prev?.accuracy ?? 0, status: err.code === err.PERMISSION_DENIED ? "denied" : "searching", ts: Date.now(), simulated: false })),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [settings.simEnabled, settings.simLat, settings.simLon]);

  const activeSite = useMemo(() => sites.find((s) => s.id === siteId) ?? sites[0], [sites, siteId]);

  const fence = useMemo(() => {
    if (!geo || (geo.status !== "locked" && geo.status !== "sim") || !activeSite) return null;
    return evaluateFence(geo, { lat: activeSite.hqLat, lon: activeSite.hqLon }, activeSite.radiusM);
  }, [geo, activeSite]);

  const sessionEmployee = useMemo(
    () => (session ? employees.find((e) => e.staffId === session.staffId) ?? null : null),
    [session, employees],
  );
  const siteEmployees = useMemo(() => employees.filter((e) => e.siteId === activeSite?.id || e.siteId === null), [employees, activeSite]);
  const siteOrg = useMemo(() => org.filter((n) => n.siteId === activeSite?.id), [org, activeSite]);

  /* -------------------------------- audit -------------------------------- */
  const audit = useCallback((action: string, target: string, detail: string) => {
    const s = sessionRef.current;
    const actor = s ? employeesRef.current.find((e) => e.staffId === s.staffId) : null;
    setAudits((prev) => [{
      id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem",
      role: (actor?.role ?? "system") as AuditLog["role"], action, target, detail,
    }, ...prev]);
  }, []);

  /* -------------------------------- session ------------------------------- */
  const login = useCallback(async (email: string, password: string, reqSiteId: string): Promise<LoginResult> => {
    await new Promise((r) => setTimeout(r, 450));
    const key = email.trim().toLowerCase();
    const emp = employeesRef.current.find((e) => e.email.toLowerCase() === key);
    if (!emp || emp.password !== password) {
      const n = (failRef.current[key] = (failRef.current[key] ?? 0) + 1);
      if (n === 3) {
        const admins = employeesRef.current.filter((e) => (e.role === "superadmin" || e.role === "companyadmin") && e.status === "active");
        setNotifs((prev) => [...admins.map((a) => ({ id: uid("ntf"), staffId: a.staffId, title: "Percobaan login mencurigakan", body: `3× gagal untuk ${key}.`, tone: "warn" as const, ts: Date.now(), read: false })), ...prev]);
      }
      return { ok: false, error: "Email atau kata sandi salah." };
    }
    failRef.current[key] = 0;
    if (emp.status !== "active") return { ok: false, error: "Akun nonaktif — hubungi Admin HR." };
    const isCentral = emp.role === "superadmin" || emp.role === "companyadmin";
    const site = isCentral ? sitesRef.current.find((s) => s.id === reqSiteId) ?? sitesRef.current[0] : sitesRef.current.find((s) => s.id === emp.siteId);
    if (!site) return { ok: false, error: "Gudang/area tidak ditemukan." };

    /* device binding at FIRST login (never at creation) */
    const dev = getDeviceId();
    let boundNow = false;
    if (companyRef.current.deviceBinding) {
      if (emp.deviceId && emp.deviceId !== dev) {
        setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: emp.staffId, actorName: emp.name, role: emp.role, action: "AUTH_DEVICE_BLOCK", target: emp.staffId, detail: `Login ditolak dari perangkat asing ${shortDevice(dev)}` }, ...prev]);
        return { ok: false, error: "Perangkat tidak dikenal. Akun ini terikat ke perangkat lain — minta Super Admin melepas ikatannya." };
      }
      if (!emp.deviceId) {
        boundNow = true;
        setEmployees((prev) => prev.map((e) => (e.staffId === emp.staffId ? { ...e, deviceId: dev, deviceBoundAt: Date.now() } : e)));
      }
    }

    const sess = issueTokens(emp, companyRef.current.id, site.id);
    setSession(sess);
    setSiteId(site.id);
    setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: emp.staffId, actorName: emp.name, role: emp.role, action: "AUTH_LOGIN", target: emp.staffId, detail: `Login di ${site.shortName} · JWT 8 jam${boundNow ? ` · perangkat ${shortDevice(dev)} diikat` : ""}` }, ...prev]);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    const s = sessionRef.current;
    if (s) {
      const actor = employeesRef.current.find((e) => e.staffId === s.staffId);
      setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: s.staffId, actorName: actor?.name ?? s.staffId, role: (actor?.role ?? "system") as AuditLog["role"], action: "AUTH_LOGOUT", target: s.staffId, detail: "Sesi diakhiri pengguna" }, ...prev]);
    }
    setSession(null);
  }, []);

  useEffect(() => {
    if (!session) return;
    const left = session.accessExp - Date.now();
    if (left <= 0) { logout(); return; }
    const t = window.setTimeout(logout, left);
    return () => window.clearTimeout(t);
  }, [session?.accessExp, logout]);

  const switchSite = useCallback((id: string) => { setSiteId(id); }, []);

  const importIdentity = useCallback((identity: TenantIdentity, source: string): boolean => {
    if (!identity || typeof identity.appName !== "string") return false;
    setCompany((prev) => ({ ...prev, ...identity }));
    const s = sessionRef.current;
    const actor = s ? employeesRef.current.find((e) => e.staffId === s.staffId) : null;
    setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "device", actorName: actor?.name ?? "Perangkat baru", role: (actor?.role ?? "system") as AuditLog["role"], action: "IDENTITY_IMPORT", target: identity.name, detail: `Identitas tenant "${identity.appName}" diterapkan via ${source}` }, ...prev]);
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

  /* ------------------------------- employees ------------------------------ */
  const addEmployee = useCallback((e: Employee) => setEmployees((prev) => [e, ...prev]), []);
  const updateEmployee = useCallback(
    (staffId: string, patch: Partial<Employee>) => setEmployees((prev) => prev.map((e) => (e.staffId === staffId ? { ...e, ...patch } : e))),
    [],
  );
  const removeEmployee = useCallback((staffId: string) => {
    setEmployees((prev) => prev.filter((e) => e.staffId !== staffId));
    void import("./sql/cloud").then((m) => m.cloudRemove("employees", [staffId]));
  }, []);
  const unbindDevice = useCallback((staffId: string) => {
    const emp = employeesRef.current.find((e) => e.staffId === staffId);
    setEmployees((prev) => prev.map((e) => (e.staffId === staffId ? { ...e, deviceId: null, deviceBoundAt: null } : e)));
    const s = sessionRef.current;
    const actor = s ? employeesRef.current.find((e) => e.staffId === s.staffId) : null;
    setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem", role: (actor?.role ?? "system") as AuditLog["role"], action: "DEVICE_UNBIND", target: staffId, detail: `Ikatan perangkat ${emp?.name ?? staffId} dilepas` }, ...prev]);
  }, []);

  /* --------------------------------- logs --------------------------------- */
  const addLog = useCallback((l: AttendanceLog) => setLogs((prev) => [l, ...prev]), []);
  const clearLogs = useCallback(() => {
    setLogs([]);
    void import("./sql/cloud").then((m) => m.cloudClear("logs"));
  }, []);

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
      if (stage === "manager") return approve ? { ...l, status: "pending_hr" as LeaveStatus, managerDecision: decision } : { ...l, status: "rejected" as LeaveStatus, managerDecision: decision };
      return approve ? { ...l, status: "approved" as LeaveStatus, hrDecision: decision } : { ...l, status: "rejected" as LeaveStatus, hrDecision: decision };
    }));
    setNotifs((prev) => [{
      id: uid("ntf"), staffId: lv.staffId,
      title: approve ? "Cuti disetujui" : "Cuti ditolak",
      body: `${lv.type} ${lv.days} hari (${lv.date}) ${approve ? (stage === "manager" ? "→ lanjut ke HR" : "(final)") : ""}`,
      tone: approve ? "ok" as const : "danger" as const, ts: Date.now(), read: false,
    }, ...prev]);
    setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem", role: (actor?.role ?? "system") as AuditLog["role"], action: stage === "manager" ? (approve ? "LEAVE_APPROVE_MGR" : "LEAVE_REJECT_MGR") : approve ? "LEAVE_APPROVE_HR" : "LEAVE_REJECT_HR", target: lv.staffId, detail: `${lv.type} ${lv.days} hari · ${lv.date}` }, ...prev]);
  }, []);

  /* -------------------------------- payroll ------------------------------- */
  const issuePayslip = useCallback((slip: Payslip, byName: string) => {
    const final: Payslip = { ...slip, status: "issued", issuedAt: Date.now(), issuedBy: byName };
    setPayslips((prev) => [final, ...prev.filter((p) => p.id !== final.id)]);
    setNotifs((prev) => [{ id: uid("ntf"), staffId: slip.staffId, title: "Slip gaji diterbitkan", body: `Periode ${slip.month} — lihat menu Gaji.`, tone: "info" as const, ts: Date.now(), read: false }, ...prev]);
    const s = sessionRef.current;
    setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: s?.staffId ?? "system", actorName: byName, role: (employeesRef.current.find((e) => e.staffId === s?.staffId)?.role ?? "companyadmin") as AuditLog["role"], action: "PAYSLIP_ISSUE", target: slip.staffId, detail: `Slip ${slip.month} diterbitkan untuk ${slip.name}` }, ...prev]);
  }, []);
  const withdrawPayslip = useCallback((id: string) => {
    setPayslips((prev) => prev.filter((p) => p.id !== id));
  }, []);

  /* --------------------------------- sites -------------------------------- */
  const addSite = useCallback((s: Site) => setSites((prev) => [...prev, s]), []);
  const updateSite = useCallback((id: string, patch: Partial<Site>) => setSites((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s))), []);
  const removeSite = useCallback((id: string): boolean => {
    if (employeesRef.current.some((e) => e.siteId === id)) return false;
    const st = sitesRef.current.find((s) => s.id === id);
    /* cloud: delete the site's org nodes & logs explicitly (no FK cascade in the cloud schema) */
    const orgIds = db.loadOrg().filter((n) => n.siteId === id).map((n) => n.id);
    const logIds = db.loadLogs().filter((l) => l.siteId === id).map((l) => l.id);
    void import("./sql/cloud").then((m) => {
      m.cloudRemove("org", orgIds);
      m.cloudRemove("logs", logIds);
      m.cloudRemove("sites", [id]);
    });
    setSites((prev) => prev.filter((s) => s.id !== id));
    setOrg((prev) => prev.filter((n) => n.siteId !== id));
    setLogs((prev) => prev.filter((l) => l.siteId !== id));
    setSiteId((cur) => (cur === id ? (sitesRef.current.find((s) => s.id !== id)?.id ?? "site-vit") : cur));
    const actor = sessionRef.current ? employeesRef.current.find((e) => e.staffId === sessionRef.current?.staffId) : null;
    setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem", role: (actor?.role ?? "system") as AuditLog["role"], action: "MASTER_SITE_DELETE", target: id, detail: `Gudang "${st?.name ?? id}" dihapus` }, ...prev]);
    return true;
  }, []);

  /* --------------------------------- shifts ------------------------------- */
  const addShift = useCallback((s: Shift) => setShifts((prev) => [...prev, s]), []);
  const updateShift = useCallback((id: string, patch: Partial<Shift>) => setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s))), []);
  const removeShift = useCallback((id: string) => {
    setShifts((prev) => prev.filter((s) => s.id !== id));
    void import("./sql/cloud").then((m) => m.cloudRemove("shifts", [id]));
  }, []);

  /* ---------------------------------- org --------------------------------- */
  const addOrgNode = useCallback((n: OrgNode) => setOrg((prev) => [...prev, n]), []);
  const updateOrgNode = useCallback((id: string, patch: Partial<OrgNode>) => setOrg((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n))), []);
  const removeOrgNode = useCallback((id: string) => {
    setOrg((prev) => {
      const victim = prev.find((n) => n.id === id);
      if (!victim) return prev;
      return prev.filter((n) => n.id !== id).map((n) => (n.parentId === id ? { ...n, parentId: victim.parentId } : n));
    });
    void import("./sql/cloud").then((m) => m.cloudRemove("org", [id]));
  }, []);

  /* --------------------------------- board -------------------------------- */
  const postBoard = useCallback((p: { siteId: string | null; title: string; body: string; tone: BoardPost["tone"] }) => {
    const actor = sessionRef.current ? employeesRef.current.find((e) => e.staffId === sessionRef.current?.staffId) : null;
    const post: BoardPost = { id: uid("an"), siteId: p.siteId, title: p.title.trim(), body: p.body.trim(), tone: p.tone, createdBy: actor?.name ?? "Admin", createdAt: Date.now(), acks: [] };
    setBoard((prev) => [post, ...prev]);
    const targets = employeesRef.current.filter((e) => e.status === "active" && (e.role === "employee" || e.role === "manager") && (post.siteId === null || e.siteId === post.siteId));
    setNotifs((prev) => [...targets.map((e) => ({ id: uid("ntf"), staffId: e.staffId, title: "Pengumuman baru", body: post.title, tone: "info" as const, ts: Date.now(), read: false })), ...prev]);
    setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem", role: (actor?.role ?? "system") as AuditLog["role"], action: "BOARD_POST", target: post.siteId ?? "semua-area", detail: `Pengumuman "${post.title}" (${targets.length} penerima)` }, ...prev]);
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
    setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem", role: (actor?.role ?? "system") as AuditLog["role"], action: "BOARD_DELETE", target: post?.siteId ?? "semua-area", detail: `Pengumuman "${post?.title ?? id}" dihapus` }, ...prev]);
  }, []);

  /* ----------------------------- master collections ----------------------- */
  const addDepartment = useCallback((name: string) => setDepartments((prev) => (prev.includes(name) ? prev : [...prev, name])), []);
  const renameDepartment = useCallback((from: string, to: string) => {
    setDepartments((prev) => prev.map((d) => (d === from ? to : d)));
    setEmployees((prev) => prev.map((e) => (e.department === from ? { ...e, department: to } : e)));
  }, []);
  const removeDepartment = useCallback((name: string): boolean => {
    if (employeesRef.current.some((e) => e.department === name)) return false;
    setDepartments((prev) => prev.filter((d) => d !== name));
    return true;
  }, []);
  const updateLeaveQuota = useCallback((t: LeaveType, days: number) => setLeaveQuotas((prev) => ({ ...prev, [t]: Math.max(0, days) })), []);
  const updateSalaryDefault = useCallback((r: Role, patch: Partial<SalaryStructure>) => setSalaryDefaults((prev) => ({ ...prev, [r]: { ...prev[r], ...patch } })), []);

  const importMasterData = useCallback((payload: MasterPayload): string[] => {
    const applied: string[] = [];
    if (payload.company) { setCompany((prev) => ({ ...prev, ...payload.company })); applied.push("Tenant"); }
    if (payload.sites?.length) { setSites(payload.sites); applied.push(`Gudang (${payload.sites.length})`); }
    if (payload.employees?.length) {
      setEmployees((prev) => {
        const byId = new Map(prev.map((e) => [e.staffId, e]));
        for (const e of payload.employees!) byId.set(e.staffId, { ...byId.get(e.staffId), ...e } as Employee);
        return [...byId.values()];
      });
      applied.push(`Karyawan (${payload.employees.length})`);
    }
    if (payload.shifts?.length) { setShifts(payload.shifts); applied.push(`Shift (${payload.shifts.length})`); }
    if (payload.departments?.length) { setDepartments(payload.departments); applied.push(`Departemen (${payload.departments.length})`); }
    if (payload.leaveQuotas) { setLeaveQuotas((prev) => ({ ...prev, ...payload.leaveQuotas })); applied.push("Kuota cuti"); }
    if (payload.salaryDefaults) { setSalaryDefaults((prev) => ({ ...prev, ...payload.salaryDefaults })); applied.push("Gaji default"); }
    const actor = sessionRef.current ? employeesRef.current.find((e) => e.staffId === sessionRef.current?.staffId) : null;
    setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem", role: (actor?.role ?? "system") as AuditLog["role"], action: "MASTER_IMPORT", target: "tenant", detail: `Impor: ${applied.join(", ") || "kosong"}` }, ...prev]);
    return applied;
  }, []);

  /* ----------------------------- forgot password -------------------------- */
  const requestReset = useCallback((email: string): { ok: boolean; error?: string; token?: ResetToken; name?: string } => {
    const key = email.trim().toLowerCase();
    const emp = employeesRef.current.find((e) => e.email.toLowerCase() === key);
    if (!emp) return { ok: false, error: "Email tidak terdaftar di direktori karyawan." };
    const recent = resets.find((r) => r.email.toLowerCase() === key && Date.now() - (r.exp - 30 * 60_000) < 60_000 && !r.used);
    if (recent) return { ok: false, error: "Tautan reset masih aktif — cek kembali email Anda (berlaku 30 menit)." };
    const token: ResetToken = { token: `rst-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`, staffId: emp.staffId, email: emp.email, exp: Date.now() + 30 * 60_000, used: false };
    setResets((prev) => [...prev.filter((r) => !(r.email.toLowerCase() === key && !r.used)), token]);
    setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: emp.staffId, actorName: emp.name, role: emp.role, action: "PASSWORD_RESET_REQUEST", target: emp.staffId, detail: "Tautan reset diminta (30 menit)" }, ...prev]);
    return { ok: true, token, name: emp.name };
  }, [resets]);

  const consumeReset = useCallback((token: string): { ok: boolean; error?: string; name?: string } => {
    const r = resets.find((x) => x.token === token.trim());
    if (!r || r.used) return { ok: false, error: "Tautan reset tidak valid atau sudah dipakai." };
    if (Date.now() > r.exp) return { ok: false, error: "Tautan reset kedaluwarsa (30 menit)." };
    const emp = employeesRef.current.find((e) => e.staffId === r.staffId);
    return { ok: true, name: emp?.name };
  }, [resets]);

  const resetPassword = useCallback((token: string, newPass: string): { ok: boolean; error?: string } => {
    const r = resets.find((x) => x.token === token.trim());
    if (!r || r.used || Date.now() > r.exp) return { ok: false, error: "Tautan reset tidak valid." };
    if (newPass.length < 6) return { ok: false, error: "Kata sandi minimal 6 karakter." };
    setEmployees((prev) => prev.map((e) => (e.staffId === r.staffId ? { ...e, password: newPass } : e)));
    setResets((prev) => prev.map((x) => (x.token === r.token ? { ...x, used: true } : x)));
    setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: r.staffId, actorName: employeesRef.current.find((e) => e.staffId === r.staffId)?.name ?? r.staffId, role: (employeesRef.current.find((e) => e.staffId === r.staffId)?.role ?? "employee") as AuditLog["role"], action: "PASSWORD_RESET_SELF", target: r.staffId, detail: "Kata sandi diganti melalui tautan reset" }, ...prev]);
    return { ok: true };
  }, [resets]);

  /* --------------------------------- SMTP --------------------------------- */
  const updateSmtp = useCallback((patch: Partial<SmtpConfig>) => setSmtp((prev) => ({ ...prev, ...patch })), []);

  const postMail = useCallback(async (to: string, subject: string, html: string, text: string): Promise<{ ok: boolean; error?: string }> => {
    const cfg = smtpRef.current;
    if (!cfg.enabled || !cfg.user || !cfg.pass) return { ok: false, error: "SMTP belum dikonfigurasi." };
    try {
      const ctl = new AbortController();
      const t = window.setTimeout(() => ctl.abort(), 12_000);
      const res = await fetch("/.netlify/functions/send-mail", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, html, text, config: { host: cfg.host, port: cfg.port, secure: cfg.secure, user: cfg.user, pass: cfg.pass, fromName: cfg.fromName } }),
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

  const deliverResetEmail = useCallback(async (to: string, name: string, link: string): Promise<"smtp" | "demo"> => {
    const appName = companyRef.current.appName ?? "Vittoria HR";
    const subject = `Reset Kata Sandi — ${appName}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;"><h2 style="color:#f07300;">Reset Kata Sandi — ${appName}</h2><p>Halo <b>${name}</b>,</p><p>Klik tombol di bawah untuk membuat kata sandi baru.</p><p style="text-align:center;"><a href="${link}" style="display:inline-block;background:#f07300;color:#fff;text-decoration:none;font-weight:700;padding:14px 34px;border-radius:12px;">Buat Kata Sandi Baru</a></p><p style="color:#666;font-size:12px;">Atau salin: ${link}</p><p style="color:#bd7a06;font-size:12px;">Berlaku 30 menit, sekali pakai. Abaikan jika bukan Anda.</p></div>`;
    const text = `Halo ${name}, reset kata sandi ${appName}: ${link} (berlaku 30 menit, sekali pakai).`;
    const res = await postMail(to, subject, html, text);
    if (res.ok) {
      setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: "system", actorName: "Sistem", role: "system" as const, action: "AUTH_PW_RESET_SENT", target: to, detail: `Email reset dikirim via SMTP (${smtpRef.current.user})` }, ...prev]);
      return "smtp";
    }
    return "demo";
  }, [postMail]);

  const sendTestEmail = useCallback(async (to: string): Promise<{ ok: boolean; error?: string }> => {
    const appName = companyRef.current.appName ?? "Vittoria HR";
    const res = await postMail(to, `Tes Email Berhasil — ${appName}`, `<div style="font-family:Arial,sans-serif;padding:24px;"><h2>✉️ Koneksi SMTP berhasil!</h2><p>Server <b>${smtpRef.current.host}:${smtpRef.current.port}</b> terhubung. — ${appName}</p></div>`, `Tes email berhasil. — ${appName}`);
    const actor = sessionRef.current ? employeesRef.current.find((e) => e.staffId === sessionRef.current?.staffId) : null;
    setAudits((prev) => [{ id: uid("aud"), ts: Date.now(), actorId: actor?.staffId ?? "system", actorName: actor?.name ?? "Sistem", role: (actor?.role ?? "system") as AuditLog["role"], action: res.ok ? "SMTP_TEST_OK" : "SMTP_TEST_FAIL", target: to, detail: res.ok ? `Email tes terkirim ke ${to}` : `Email tes gagal: ${res.error}` }, ...prev]);
    return res;
  }, [postMail]);

  /* --------------------------------- breaks ------------------------------- */
  const todayKeyNow = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const activeBreak = useMemo(() => {
    const s = session;
    if (!s) return null;
    return breaks.find((b) => b.staffId === s.staffId && b.day === todayKeyNow() && !b.end) ?? null;
  }, [breaks, session]);
  const startBreak = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    setBreaks((prev) => [...prev, { id: uid("brk"), staffId: s.staffId, day: todayKeyNow(), start: Date.now(), end: null }]);
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
    Object.keys(localStorage).filter((k) => k.startsWith("vittoria:")).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem("vittoria:dataversion", "7");
    const c = seedCompany();
    const st = seedSites();
    setCompany(c); setSites(st); setSiteId(st[0].id);
    setEmployees(seedEmployees()); setShifts(seedShifts()); setLogs(seedLogs(st));
    setLeaves(seedLeaves()); setOrg(seedOrgNodes()); setBoard(seedBoardPosts());
    setAudits(seedAudit()); setNotifs(seedNotifs()); setBreaks([]); setPayslips([]); setResets([]);
    /* mirror the reset into the cloud so stale rows can't resurface on next pull */
    void import("./sql/cloud").then((m) => {
      if (!m.cloudActive()) return;
      ["logs", "leaves", "org", "board", "audits", "notifs", "breaks", "resets", "employees", "shifts", "sites", "departments", "quotas", "salarydefaults", "company"]
        .forEach((k) => m.cloudClear(k));
    });
    setLeaveQuotas(db.loadQuotas()); setSalaryDefaults(db.loadSalaryDefaults()); setDepartments(["Gudang"]);
    setSettings({ simEnabled: false, simLat: -6.17555, simLon: 106.82735, matchThreshold: 0.5 });
    db.markSeeded();
    setSession(null);
  }, []);

  const value: AppState = {
    company, sites, siteId, activeSite: activeSite as Site,
    employees, siteEmployees, logs, leaves, leaveQuotas, salaryDefaults, departments,
    shifts, org, siteOrg, board, audits, notifs, breaks, payslips, settings, smtp,
    engine, geo, fence, session: sessionEmployee, tokenExp: session?.accessExp ?? 0,
    sql, refreshSql, runSql, exportSqlFile, vacuumSql,
    cloud, presence, cloudInitNow, cloudPullNow, cloudPing,
    login, logout, importIdentity, switchSite,
    addEmployee, updateEmployee, removeEmployee, unbindDevice,
    addLog, clearLogs,
    addLeave, decideLeave,
    issuePayslip, withdrawPayslip,
    addSite, updateSite, removeSite,
    addShift, updateShift, removeShift,
    addOrgNode, updateOrgNode, removeOrgNode,
    postBoard, ackBoard, deleteBoard,
    addDepartment, renameDepartment, removeDepartment, updateLeaveQuota, updateSalaryDefault, importMasterData,
    requestReset, consumeReset, resetPassword, deliverResetEmail, sendTestEmail, updateSmtp,
    activeBreak, startBreak, endBreak,
    markNotifsRead, updateCompany, updateSettings, audit, resetAll,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function hqOf(s: Site) { return { lat: s.hqLat, lon: s.hqLon }; }
export type { AttendanceType };
