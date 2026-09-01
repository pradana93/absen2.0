/**
 * Cloud bridge client (Fase 2) — talks to the Netlify Function that fronts
 * the Netlify DB (Postgres). The embedded SQLite engine stays as the instant
 * local cache; when the cloud is reachable it becomes the shared source of
 * truth for the whole team.
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

const apiUrl = () => new URL(".netlify/functions/api", window.location.href).href;

function sessionToken(): string {
  try {
    const raw = localStorage.getItem("vittoria:session");
    if (raw) return JSON.parse(raw)?.access ?? "local-session";
  } catch { /* noop */ }
  return "local-session";
}

async function post(body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(apiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-vittoria-session": sessionToken() },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !j || j.ok !== true) {
    throw new Error(String(j?.error ?? `HTTP ${res.status}`));
  }
  return j;
}

/* --------------------------------- ops ----------------------------------- */
export interface PullResult {
  ok: boolean; ready: boolean; hasData: boolean; rows: number;
  counts: Record<string, number>; data: Record<string, unknown[]>; version: string | null;
}

export async function cloudPull(): Promise<PullResult> {
  setCloudStatus("connecting");
  try {
    const j = await post({ op: "pull" });
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
  } catch {
    setCloudStatus("off");
    return { ok: false, ready: false, hasData: false, rows: 0, counts: {}, data: {}, version: null };
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

/** Debounced per-collection push; the local save already happened. */
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
        setCloudStatus("error");
        try { window.dispatchEvent(new Event("vittoria:cloud-error")); } catch { /* noop */ }
      });
  }, 800));
}

export function cloudRemove(key: string, ids: string[]): void {
  if (!active || ids.length === 0) return;
  void post({ op: "remove", key, ids }).catch(() => {
    setCloudStatus("error");
    try { window.dispatchEvent(new Event("vittoria:cloud-error")); } catch { /* noop */ }
  });
}

export function cloudClear(key: string): void {
  if (!active) return;
  void post({ op: "clear", key }).catch(() => {
    setCloudStatus("error");
    try { window.dispatchEvent(new Event("vittoria:cloud-error")); } catch { /* noop */ }
  });
}
