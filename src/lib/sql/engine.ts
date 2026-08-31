/**
 * Embedded SQLite engine (Fase 1).
 *
 * Storage: the database lives as a byte array in memory and is persisted to
 * IndexedDB (database "vittoria-sql", store "files", key "main.sqlite") on
 * every commit — a real .sqlite file you can export and open in any SQL tool.
 * The WASM engine (~1.3 MB) loads once from CDN, then browser-cached.
 * If WASM/IndexedDB is unavailable the app silently keeps its localStorage
 * hot-cache (status "fallback") — nothing breaks.
 */
import initSqlJs, { type Database } from "sql.js";
import { SCHEMA_SQL } from "./schema";

const WASM_URL = "https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/sql-wasm.wasm";
const IDB_NAME = "vittoria-sql";
const IDB_STORE = "files";
const IDB_KEY = "main.sqlite";

export type SqlStatus = "boot" | "ready" | "fallback";

export interface SqlMeta {
  status: SqlStatus;
  version: string;      // e.g. "3.49.1"
  sizeKB: number;       // exported db size
  tables: number;
  rows: number;
}

let db: Database | null = null;
let status: SqlStatus = "boot";
const listeners = new Set<(s: SqlStatus) => void>();
let persistTimer: number | null = null;

export function onSqlStatus(cb: (s: SqlStatus) => void): () => void {
  listeners.add(cb); cb(status);
  return () => { listeners.delete(cb); };
}
function setStatus(s: SqlStatus) { status = s; listeners.forEach((cb) => cb(s)); }

/* ------------------------------ IndexedDB ------------------------------ */
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbLoad(): Promise<Uint8Array | null> {
  const conn = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve((req.result as Uint8Array) ?? null);
    req.onerror = () => reject(req.error);
  });
}
async function idbSave(bytes: Uint8Array): Promise<void> {
  const conn = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* -------------------------------- engine ------------------------------- */
export async function initSqlEngine(): Promise<SqlStatus> {
  if (status === "ready") return status;
  try {
    const SQL = await initSqlJs({ locateFile: () => WASM_URL });
    let bytes: Uint8Array | null = null;
    try { bytes = await idbLoad(); } catch { /* private mode — run in-memory */ }
    db = bytes && bytes.length ? new SQL.Database(bytes) : new SQL.Database();
    db.run(SCHEMA_SQL);
    setStatus("ready");
    return status;
  } catch (e) {
    console.warn("SQLite engine unavailable — using localStorage hot-cache.", e);
    db = null;
    setStatus("fallback");
    return status;
  }
}

/** Debounced write of the database file to IndexedDB. */
export function schedulePersist() {
  if (!db) return;
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    if (!db) return;
    const bytes = db.export();
    idbSave(bytes).then(() => {
      try { window.dispatchEvent(new Event("vittoria:sql-persisted")); } catch { /* noop */ }
    }).catch(() => { try { window.dispatchEvent(new Event("vittoria:storage-full")); } catch { /* noop */ } });
  }, 600);
}

export function sqlReady(): boolean { return status === "ready" && !!db; }

/* -------------------------------- queries ------------------------------ */
export function sqlRun(sql: string, params: unknown[] = []): void {
  if (!db) return;
  db.run(sql, params as never);
  schedulePersist();
}

export function sqlAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  if (!db) return [];
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params as never);
    const out: T[] = [];
    while (stmt.step()) out.push(stmt.getAsObject() as T);
    return out;
  } finally {
    stmt.free();
  }
}

export function sqlGet<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
  return sqlAll<T>(sql, params)[0] ?? null;
}

/* ----------------------------- meta (kv) -------------------------------- */
export function sqlGetMeta(key: string): string | null {
  return sqlGet<{ v: string | null }>("SELECT v FROM meta WHERE k = ?", [key])?.v ?? null;
}
export function sqlSetMeta(key: string, value: string): void {
  sqlRun("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", [key, value]);
}

/* --------------------- read-only console + stats ------------------------ */
export interface SqlResult { columns: string[]; rows: unknown[][]; }

export function sqlConsole(query: string): { ok: true; result: SqlResult } | { ok: false; error: string } {
  if (!db) return { ok: false, error: "Mesin SQLite belum siap." };
  const q = query.trim().replace(/;+\s*$/, "");
  if (!/^(SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(q)) {
    return { ok: false, error: "Konsol ini read-only — hanya SELECT / PRAGMA / WITH / EXPLAIN." };
  }
  try {
    const res = db.exec(q);
    const first = res[0];
    return { ok: true, result: { columns: first?.columns ?? [], rows: (first?.values ?? []).slice(0, 100) } };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

export function sqlStats(): SqlMeta {
  if (!db) return { status, version: "—", sizeKB: 0, tables: 0, rows: 0 };
  const version = db.exec("SELECT sqlite_version() AS v")[0]?.values[0]?.[0] as string ?? "—";
  const sizeKB = Math.round(db.export().length / 1024);
  const tables = (db.exec("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0]?.values[0]?.[0] as number) ?? 0;
  let rows = 0;
  try {
    const names = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0]?.values ?? [];
    for (const [n] of names) {
      rows += (db.exec(`SELECT COUNT(*) FROM "${String(n)}"`)[0]?.values[0]?.[0] as number) ?? 0;
    }
  } catch { /* noop */ }
  return { status, version, sizeKB, tables, rows };
}

/** Export the real database file (downloadable .sqlite). */
export function sqlExportBytes(): Uint8Array | null {
  return db ? db.export() : null;
}

export function sqlVacuum(): void {
  if (!db) return;
  db.run("VACUUM");
  schedulePersist();
}
