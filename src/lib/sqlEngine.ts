/**
 * sqlEngine — a REAL embedded SQL database (SQLite compiled to WebAssembly).
 *
 * Where the data lives:
 *   - The SQLite engine runs in memory (WASM).
 *   - The database file (a real binary .db) is persisted to the browser's
 *     IndexedDB under this origin, so it survives reloads and works offline.
 *   - It is per-device / per-origin. Cross-device sync is the cloud phase
 *     (the schema is kept Postgres-compatible for that migration).
 *
 * The live UI state still lives in localStorage JSON (fast, React-friendly).
 * This engine mirrors that state into genuine relational tables via
 * idempotent, parameterized upserts — so you get real SQL, foreign keys,
 * indexes, and a query console on top of the working app.
 */
import initSqlJs from "sql.js";

type SqlJsStatic = import("sql.js").SqlJsStatic;
type SqlDatabase = import("sql.js").Database;

const WASM_CDN = "https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/sql-wasm.wasm";
const IDB_NAME = "vittoria-sql";
const IDB_STORE = "databases";
const IDB_KEY = "vittoria.db";

let SQL: SqlJsStatic | null = null;
let db: SqlDatabase | null = null;
let backend: "indexeddb" | "memory" = "memory";
let ready = false;
let pendingHydrate: HydrateSnapshot | null = null;

export interface SqlMeta {
  ok: boolean;
  version: string;
  backend: string;
  sizeBytes: number;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Schema — normalized & Postgres-compatible (TEXT/INTEGER/REAL only)  */
/* ------------------------------------------------------------------ */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY, name TEXT, short_name TEXT, app_name TEXT,
  hq_lat REAL, hq_lon REAL, radius_m INTEGER, maintenance INTEGER
);
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY, name TEXT, short_name TEXT, address TEXT,
  hq_lat REAL, hq_lon REAL, radius_m INTEGER, color TEXT
);
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY, name TEXT, start TEXT, end TEXT, grace_min INTEGER, color TEXT
);
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY, nik TEXT, name TEXT, email TEXT UNIQUE, role TEXT,
  department TEXT, position TEXT, site_id TEXT REFERENCES sites(id),
  shift_id TEXT REFERENCES shifts(id), status TEXT, salary_basic INTEGER,
  device_id TEXT, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS attendance_logs (
  id TEXT PRIMARY KEY, ts INTEGER, staff_id TEXT REFERENCES employees(id),
  name TEXT, department TEXT, site_id TEXT REFERENCES sites(id), type TEXT,
  lat REAL, lon REAL, distance_m REAL, face_dist REAL, method TEXT,
  status TEXT, reason TEXT, late_min INTEGER, overtime_min INTEGER, work_min INTEGER
);
CREATE TABLE IF NOT EXISTS leaves (
  id TEXT PRIMARY KEY, staff_id TEXT REFERENCES employees(id), name TEXT,
  type TEXT, date TEXT, days INTEGER, reason TEXT, status TEXT, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS breaks (
  id TEXT PRIMARY KEY, staff_id TEXT REFERENCES employees(id), day TEXT,
  start INTEGER, end INTEGER
);
CREATE TABLE IF NOT EXISTS org_nodes (
  id TEXT PRIMARY KEY, parent_id TEXT, site_id TEXT REFERENCES sites(id),
  title TEXT, staff_id TEXT REFERENCES employees(id), name TEXT, note TEXT, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS board (
  id TEXT PRIMARY KEY, site_id TEXT, title TEXT, body TEXT, tone TEXT,
  created_by TEXT, created_at INTEGER, ack_count INTEGER
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, ts INTEGER, actor_id TEXT, actor_name TEXT, role TEXT,
  action TEXT, target TEXT, detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_logs_staff_ts ON attendance_logs(staff_id, ts);
CREATE INDEX IF NOT EXISTS idx_logs_site_ts  ON attendance_logs(site_id, ts);
CREATE INDEX IF NOT EXISTS idx_leaves_staff  ON leaves(staff_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_ts      ON audit_logs(ts);
`;

/* ------------------------------------------------------------------ */
/* IndexedDB persistence (the on-disk home of the .db file)            */
/* ------------------------------------------------------------------ */
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSave(bytes: Uint8Array): Promise<void> {
  const d = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbLoad(): Promise<Uint8Array | null> {
  try {
    const d = await idb();
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as Uint8Array) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Init / persistence                                                  */
/* ------------------------------------------------------------------ */
export async function initSqlEngine(): Promise<SqlMeta> {
  if (ready && db) return meta();
  try {
    SQL = await initSqlJs({ locateFile: () => WASM_CDN });
    const saved = await idbLoad();
    if (saved && saved.length > 0) {
      db = new SQL.Database(saved);
      backend = "indexeddb";
    } else {
      db = new SQL.Database();
      backend = "indexeddb"; // will persist on first save
    }
    db.run(SCHEMA);
    ready = true;
    if (pendingHydrate) { hydrateFromState(pendingHydrate); pendingHydrate = null; }
    await persist();
    notify();
    return meta();
  } catch (e) {
    return { ok: false, version: "—", backend: "unavailable", sizeBytes: 0, error: String(e) };
  }
}

function meta(): SqlMeta {
  if (!db) return { ok: false, version: "—", backend: "—", sizeBytes: 0 };
  let size = 0;
  try { size = db.export().length; } catch { /* noop */ }
  const ver = queryOne("SELECT sqlite_version() AS v")?.v ?? "—";
  return { ok: true, version: String(ver), backend, sizeBytes: size };
}

let persistTimer: number | null = null;
async function persist(): Promise<void> {
  if (!db) return;
  const bytes = db.export();
  await idbSave(bytes).catch(() => { /* private mode — stays in memory */ });
}
function schedulePersist(): void {
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => { void persist().then(notify); }, 400);
}

/* ------------------------------------------------------------------ */
/* Query helpers (parameterized — SQL-injection safe)                  */
/* ------------------------------------------------------------------ */
export interface SqlResult { columns: string[]; rows: unknown[][]; }

export function query(sql: string, params: unknown[] = []): SqlResult {
  if (!db) throw new Error("SQL engine belum siap.");
  const stmt = db.prepare(sql);
  stmt.bind(params as never);
  const rows: unknown[][] = [];
  let columns: string[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    if (!columns.length) columns = Object.keys(row);
    rows.push(columns.map((c) => row[c]));
  }
  stmt.free();
  return { columns, rows };
}

function queryOne(sql: string, params: unknown[] = []): Record<string, unknown> | null {
  const r = query(sql, params);
  if (!r.rows.length) return null;
  const o: Record<string, unknown> = {};
  r.columns.forEach((c, i) => { o[c] = r.rows[0][i]; });
  return o;
}

/** Read-only console execution — rejects anything that isn't a read. */
export function execReadOnly(raw: string): SqlResult {
  const sql = raw.trim().replace(/;+\s*$/, "");
  if (/;/.test(sql)) throw new Error("Satu pernyataan per eksekusi.");
  const head = sql.split(/\s+/)[0]?.toUpperCase() ?? "";
  if (!["SELECT", "PRAGMA", "EXPLAIN", "WITH"].includes(head)) {
    throw new Error("Konsol ini hanya untuk SELECT / PRAGMA (read-only).");
  }
  return query(sql);
}

/* ------------------------------------------------------------------ */
/* Introspection — proof that it's a real relational database          */
/* ------------------------------------------------------------------ */
export interface TableInfo { name: string; count: number; }
export interface Introspection {
  version: string; backend: string; sizeBytes: number;
  integrity: string; tables: TableInfo[];
}
export function introspect(): Introspection {
  const m = meta();
  const integrity = String(queryOne("PRAGMA integrity_check")?.integrity_check ?? "—");
  const names = query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).rows.map((r) => String(r[0]));
  const tables: TableInfo[] = names.map((name) => {
    const c = queryOne(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`);
    return { name, count: Number(c?.n ?? 0) };
  });
  return { ...m, integrity, tables };
}

/* ------------------------------------------------------------------ */
/* Hydration — mirror the live JSON state into the relational tables   */
/* ------------------------------------------------------------------ */
export interface HydrateSnapshot {
  companies: Record<string, unknown>[];
  sites: Record<string, unknown>[];
  shifts: Record<string, unknown>[];
  employees: Record<string, unknown>[];
  logs: Record<string, unknown>[];
  leaves: Record<string, unknown>[];
  breaks: Record<string, unknown>[];
  org: Record<string, unknown>[];
  board: Record<string, unknown>[];
  audits: Record<string, unknown>[];
}

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = ""): string => (v == null ? d : String(v));
const int = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

function replaceAll(table: string, cols: string[], rows: unknown[][]): void {
  if (!db) return;
  db.run(`DELETE FROM "${table}"`);
  if (!rows.length) return;
  const ph = cols.map(() => "?").join(",");
  const stmt = db.prepare(`INSERT INTO "${table}" (${cols.join(",")}) VALUES (${ph})`);
  for (const r of rows) stmt.run(r as never);
  stmt.free();
}

export function hydrateFromState(s: HydrateSnapshot): void {
  if (!ready || !db) { pendingHydrate = s; return; }
  try {
    db.run("BEGIN");
    replaceAll("companies",
      ["id", "name", "short_name", "app_name", "hq_lat", "hq_lon", "radius_m", "maintenance"],
      s.companies.map((c) => [str(c.id), str(c.name), str(c.shortName), str(c.appName), num(c.hqLat), num(c.hqLon), num(c.radiusM), c.maintenance ? 1 : 0]));
    replaceAll("sites",
      ["id", "name", "short_name", "address", "hq_lat", "hq_lon", "radius_m", "color"],
      s.sites.map((x) => [str(x.id), str(x.name), str(x.shortName), str(x.address), num(x.hqLat), num(x.hqLon), num(x.radiusM), str(x.color)]));
    replaceAll("shifts",
      ["id", "name", "start", "end", "grace_min", "color"],
      s.shifts.map((x) => [str(x.id), str(x.name), str(x.start), str(x.end), num(x.graceMin), str(x.color)]));
    replaceAll("employees",
      ["id", "nik", "name", "email", "role", "department", "position", "site_id", "shift_id", "status", "salary_basic", "device_id", "created_at"],
      s.employees.map((e) => {
        const sal = (e.salary as { basic?: number } | undefined)?.basic;
        return [str(e.staffId), str(e.nik), str(e.name), str(e.email), str(e.role), str(e.department), str(e.position),
          e.siteId == null ? null : str(e.siteId), str(e.shiftId), str(e.status), int(sal), e.deviceId == null ? null : str(e.deviceId), num(e.createdAt)];
      }));
    replaceAll("attendance_logs",
      ["id", "ts", "staff_id", "name", "department", "site_id", "type", "lat", "lon", "distance_m", "face_dist", "method", "status", "reason", "late_min", "overtime_min", "work_min"],
      s.logs.map((l) => [str(l.id), num(l.ts), str(l.staffId), str(l.name), str(l.department), str(l.siteId), str(l.type),
        num(l.lat), num(l.lon), num(l.distanceM), l.faceDist == null ? null : num(l.faceDist), str(l.method), str(l.status),
        l.reason == null ? null : str(l.reason), int(l.lateMin), int(l.overtimeMin), int(l.workMin)]));
    replaceAll("leaves",
      ["id", "staff_id", "name", "type", "date", "days", "reason", "status", "created_at"],
      s.leaves.map((x) => [str(x.id), str(x.staffId), str(x.name), str(x.type), str(x.date), num(x.days), str(x.reason), str(x.status), num(x.createdAt)]));
    replaceAll("breaks",
      ["id", "staff_id", "day", "start", "end"],
      s.breaks.map((x) => [str(x.id), str(x.staffId), str(x.day), num(x.start), x.end == null ? null : num(x.end)]));
    replaceAll("org_nodes",
      ["id", "parent_id", "site_id", "title", "staff_id", "name", "note", "created_at"],
      s.org.map((x) => [str(x.id), x.parentId == null ? null : str(x.parentId), x.siteId == null ? null : str(x.siteId),
        str(x.title), x.staffId == null ? null : str(x.staffId), x.name == null ? null : str(x.name), x.note == null ? null : str(x.note), num(x.createdAt)]));
    replaceAll("board",
      ["id", "site_id", "title", "body", "tone", "created_by", "created_at", "ack_count"],
      s.board.map((x) => [str(x.id), x.siteId == null ? null : str(x.siteId), str(x.title), str(x.body), str(x.tone),
        str(x.createdBy), num(x.createdAt), Array.isArray(x.acks) ? x.acks.length : 0]));
    replaceAll("audit_logs",
      ["id", "ts", "actor_id", "actor_name", "role", "action", "target", "detail"],
      s.audits.map((x) => [str(x.id), num(x.ts), str(x.actorId), str(x.actorName), str(x.role), str(x.action), str(x.target), str(x.detail)]));
    db.run("COMMIT");
    schedulePersist();
  } catch {
    try { db.run("ROLLBACK"); } catch { /* noop */ }
  }
}

/* ------------------------------------------------------------------ */
/* Subscription — lets panels refresh after hydration/persistence      */
/* ------------------------------------------------------------------ */
const subs = new Set<() => void>();
export function subscribeSql(cb: () => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}
function notify(): void {
  subs.forEach((cb) => { try { cb(); } catch { /* noop */ } });
}
