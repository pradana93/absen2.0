/** Demo JWT — HS256-shaped tokens signed device-locally (swap for real auth server in Fase 2). */
import { uid } from "./format";

export interface TokenPair { access: string; refresh: string; accessExp: number; refreshExp: number; }
export interface SessionState extends TokenPair { staffId: string; siteId: string; }

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/=+$/, "");

const ACCESS_TTL = 8 * 3600;
const REFRESH_TTL = 7 * 86400;

export function issueTokens(emp: { staffId: string; name: string; role: string }, tenant: string, siteId: string): SessionState {
  const now = Math.floor(Date.now() / 1000);
  const mk = (typ: "access" | "refresh", ttl: number): string => {
    const payload = { sub: emp.staffId, name: emp.name, role: emp.role, tenant, site: siteId, iat: now, exp: now + ttl, typ, jti: uid("jwt") };
    return `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64(JSON.stringify(payload))}.local-sig`;
  };
  return { access: mk("access", ACCESS_TTL), refresh: mk("refresh", REFRESH_TTL), accessExp: (now + ACCESS_TTL) * 1000, refreshExp: (now + REFRESH_TTL) * 1000, staffId: emp.staffId, siteId };
}

export function fmtExpLeft(expMs: number): string {
  const left = Math.max(0, expMs - Date.now());
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}
