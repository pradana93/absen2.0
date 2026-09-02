/**
 * Cloud bridge client (Fase 2 · v3: live sync + presence).
 *
 * Talks to the Netlify Function fronting the Netlify DB (Postgres). The
 * embedded SQLite engine stays as the instant local cache; when the cloud is
 * reachable it becomes the shared source of truth for the whole team.
 *
 * Wire format: prop-shaped objects (camelCase, real JSON/booleans) — the
 * function owns the column mapping, so the client stays engine-agnostic.
 */

export type CloudStatus = "off" | "connecting" | "on" | "error";

const listeners = new Set<(s: CloudStatus) => void>();
let status: CloudStatus = "off";
export function onCloudStatus(cb: (s: CloudStatus) => void): () => void {
  listeners.add(cb); cb(status);
  return () => { listeners.delete(cb); };
}
export function setCloudStatus(s: CloudStatus) { status = s; listeners.forEach((cb) => cb(s)); }

let active = false;
export const cloudActive = () => active;
export function setCloudActive(v: boolean) { active = v; if (!v && status === "on") setCloudStatus("off"); }

/* ------------------------- host-aware endpoints -------------------------- */
const OVERRIDE_KEY = "vittoria:apiUrl";

export function getApiOverride(): string | null {
  try { return localStorage.getItem(OVERRIDE_KEY); } catch { return null; }
}
export function setApiOverride(v: string | null): void {
  try {
    if (v) localStorage.setItem(OVERRIDE_KEY, v);
    else localStorage.removeItem(OVERRIDE_KEY);
  } catch { /* private mode */ }
}

/** True when running on a real host where serverless functions exist. */
export function isDeployedHost(): boolean {
  const h = window.location.hostname;
  if (getApiOverride()) return true;
  if (/(^|\.)netlify\.app$/.test(h)) return true;
  if (/(^|\.)pages\.dev$/.test(h)) return true;
  if (/(^|\.)vercel\.app$/.test(h)) return true;
  if (/(^|\.)pythonanywhere\.com$/.test(h)) return true;
  /* custom domain / any other public host: treat as deployed — the ping
     (langkah 2 "Cek Semua") is the real judge of whether the function is alive. */
  if (h === "localhost" || /^127\./.test(h) || h === "0.0.0.0" || h === "::1" || /\.localhost$/.test(h)) return false;
  return true;
}

export function apiUrl(): string {
  const o = getApiOverride();
  if (o) return o;
  const h = window.location.hostname;
  if (/(^|\.)pages\.dev$/.test(h)) return new URL("/api", window.location.href).href;            // Cloudflare Pages Function
  if (/(^|\.)vercel\.app$/.test(h)) return new URL("/api/db", window.location.href).href;         // Vercel edge route
  if (/(^|\.)pythonanywhere\.com$/.test(h)) return new URL("/api/ops", window.location.href).href; // Flask
  return new URL(".netlify/functions/api", window.location.href).href;                            // Netlify (default)
}

export function mailUrl(): string {
  const h = window.location.hostname;
  if (/(^|\.)pages\.dev$/.test(h)) return new URL("/send-mail", window.location.href).href;
  if (/(^|\.)vercel\.app$/.test(h)) return new URL("/api/mail", window.location.href).href;
  if (/(^|\.)pythonanywhere\.com$/.test(h)) return new URL("/api/mail", window.location.href).href;
  return new URL(".netlify/functions/send-mail", window.location.href).href;
}

function sessionToken(): string {
  try {
    const raw = localStorage.getItem("vittoria:session");
    if (raw) return JSON.parse(raw)?.access ?? "local-session";
  } catch { /* noop */ }
  return "local-session";
}

async function post(body: unknown): Promise<Record<string, unknown>> {
  const dbUrl = getApiOverride();
  const payload = dbUrl ? { ...(body as object), dbUrl } : body;
  const res = await fetch(apiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-vittoria-session": sessionToken() },
    body: JSON.stringify(payload),
  });
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !j || j.ok !== true) {
    throw new Error(String(j?.error ?? `HTTP ${res.status}`));
  }
  return j;
}

/* --------------------------------- pull ---------------------------------- */
export interface PullResult {
  ok: boolean; ready: boolean; hasData: boolean; rows: number;
  counts: Record<string, number>; data: Record<string, unknown[]>; version: string | null;
  error?: string;
}

/** Full pull (no keys) or targeted pull of changed collections. */
export async function cloudPull(keys?: string[]): Promise<PullResult> {
  setCloudStatus("connecting");
  try {
    const j = await post(keys?.length ? { op: "pull", keys } : { op: "pull" });
    setCloudStatus("on");
    return {
      ok: true,
      ready: Boolean(j.ready),
      hasData: Boolean(j.hasData),
      rows: Number(j.rows ?? 0),
      counts: (j.counts as Record<string, number>) ?? {},
      data: (j.data as Record<string, unknown[]>) ?? {},
      version: (j.version as string) ?? null,
    };
  } catch (e) {
    setCloudStatus("off");
    return { ok: false, ready: false, hasData: false, rows: 0, counts: {}, data: {}, version: null, error: String((e as Error)?.message ?? e) };
  }
}

export async function cloudInit(): Promise<{ ok: boolean; error?: string }> {
  try {
    await post({ op: "init" });
    setCloudStatus("on");
    return { ok: true };
  } catch (e) {
    setCloudStatus("error");
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/* ------------------------------ stats + revs ------------------------------ */
export interface PresenceRow {
  deviceId: string; staffId: string | null; name: string; role: string;
  siteId: string | null; siteName: string | null; lastSeen: number;
}
export interface StatsResult {
  ok: boolean; rows: number; tables: number; version: string | null;
  revs: Record<string, string>; presenceActive: PresenceRow[]; serverVersion: string;
}

/** Cheap health read: row counts, per-table revisions, active presence. */
export async function cloudStats(): Promise<StatsResult | null> {
  try {
    const j = await post({ op: "stats" });
    setCloudStatus("on");
    return {
      ok: true,
      rows: Number(j.rows ?? 0),
      tables: Number(j.tables ?? 0),
      version: (j.version as string) ?? null,
      revs: (j.revs as Record<string, string>) ?? {},
      presenceActive: ((j.presence_active as unknown[]) ?? []) as PresenceRow[],
      serverVersion: String(j.server_version ?? ""),
    };
  } catch {
    return null;
  }
}

/* --------------------------------- ping ----------------------------------- */
export interface PingResult {
  ok: boolean; serverVersion?: string; schemaReady?: boolean; tables?: number;
  missing?: string[]; rows?: number; serverMs?: number; clientMs?: number; error?: string;
}

/** End-to-end health check: browser → function → Postgres → back. */
export async function cloudPing(): Promise<PingResult> {
  const t0 = performance.now();
  try {
    const j = await post({ op: "ping" });
    setCloudStatus("on");
    return {
      ok: true,
      serverVersion: String(j.server_version ?? ""),
      schemaReady: Boolean(j.schema_ready),
      tables: Number(j.tables ?? 0),
      missing: (j.missing as string[]) ?? [],
      rows: Number(j.rows ?? 0),
      serverMs: Number(j.server_ms ?? 0),
      clientMs: Math.round(performance.now() - t0),
    };
  } catch (e) {
    setCloudStatus("error");
    return { ok: false, error: String((e as Error)?.message ?? e), clientMs: Math.round(performance.now() - t0) };
  }
}

/* -------------------------------- heartbeat ------------------------------- */
export function heartbeat(p: {
  deviceId: string; staffId: string; name: string; role: string;
  siteId: string | null; siteName: string | null;
}): Promise<PresenceRow[] | null> {
  if (!active) return Promise.resolve(null);
  return post({ op: "presence", ...p, ua: navigator.userAgent })
    .then((j) => {
      setCloudStatus("on");
      return ((j.presence_active as unknown[]) ?? []) as PresenceRow[];
    })
    .catch(() => null);
}

/* ----------------------------- offline retry ------------------------------ */
const QUEUE_KEY = "vittoria:cloudqueue";
const pendingRows = new Map<string, unknown[]>();

function enqueue(key: string, rows: unknown[]) {
  pendingRows.set(key, rows);
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as string[];
    if (!q.includes(key)) q.push(key);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-20)));
  } catch { /* private mode — memory-only queue */ }
}

/** Retry any queued collections after connectivity returns. */
export async function flushQueue(): Promise<void> {
  if (!active) return;
  let queued: string[] = [];
  try { queued = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as string[]; } catch { return; }
  if (!queued.length) return;
  const still: string[] = [];
  for (const key of queued) {
    const rows = pendingRows.get(key);
    if (!rows) continue; // page reloaded — next edit of that collection re-syncs it
    try {
      await post({ op: "sync", key, rows });
      pendingRows.delete(key);
    } catch {
      still.push(key);
    }
  }
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(still)); } catch { /* noop */ }
  if (!still.length) { try { window.dispatchEvent(new Event("vittoria:cloud-synced")); } catch { /* noop */ } }
}

/* ---------------------------- debounced writes ---------------------------- */
const timers = new Map<string, number>();
export function queueCloudSync(key: string, rows: unknown): void {
  if (!active) return;
  const prev = timers.get(key);
  if (prev) window.clearTimeout(prev);
  timers.set(key, window.setTimeout(() => {
    timers.delete(key);
    void post({ op: "sync", key, rows })
      .then(() => { if (status !== "on") setCloudStatus("on"); try { window.dispatchEvent(new Event("vittoria:cloud-synced")); } catch { /* noop */ } })
      .catch(() => {
        enqueue(key, rows as unknown[]);
        setCloudStatus("error");
        try { window.dispatchEvent(new Event("vittoria:cloud-error")); } catch { /* noop */ }
      });
  }, 800));
}

export function cloudRemove(key: string, ids: string[]): void {
  if (!active || ids.length === 0) return;
  void post({ op: "remove", key, ids })
    .then(() => { try { window.dispatchEvent(new Event("vittoria:cloud-synced")); } catch { /* noop */ } })
    .catch(() => { setCloudStatus("error"); try { window.dispatchEvent(new Event("vittoria:cloud-error")); } catch { /* noop */ } });
}

export function cloudClear(key: string): void {
  if (!active) return;
  void post({ op: "clear", key })
    .then(() => { try { window.dispatchEvent(new Event("vittoria:cloud-synced")); } catch { /* noop */ } })
    .catch(() => { setCloudStatus("error"); try { window.dispatchEvent(new Event("vittoria:cloud-error")); } catch { /* noop */ } });
}
