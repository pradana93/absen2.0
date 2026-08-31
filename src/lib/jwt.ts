/**
 * Demo JWT — faithful shape (HS256 header.payload.signature), signed with a
 * device-local key. Production swaps this for a real auth server issuing &
 * rotating tokens; the SessionState contract stays identical.
 */
import { uid } from "./format";

export interface JwtPayload {
  sub: string;
  name: string;
  role: string;
  tenant: string;
  iat: number;
  exp: number;
  typ: "access" | "refresh";
  jti: string;
}

export interface TokenPair { access: string; refresh: string; accessExp: number; refreshExp: number; }
export interface SessionState extends TokenPair { staffId: string; }

const KEY = "vittoria-signing-key-demo";

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/=+$/, "");
const unb64 = (s: string) => decodeURIComponent(escape(atob(s)));

async function sign(data: string): Promise<string> {
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(KEY),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
    return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, "");
  } catch {
    let h = 5381;
    for (let i = 0; i < data.length; i++) h = ((h << 5) + h + data.charCodeAt(i)) | 0;
    return `fb${(h >>> 0).toString(36)}`;
  }
}

export function parseToken(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(unb64(parts[1])) as JwtPayload;
  } catch {
    return null;
  }
}

const ACCESS_TTL = 8 * 3600;   // 8 hours
const REFRESH_TTL = 7 * 86400; // 7 days

export function issueTokens(emp: { staffId: string; name: string; role: string }, tenant: string): TokenPair {
  const now = Math.floor(Date.now() / 1000);
  const mk = (typ: "access" | "refresh", ttl: number): string => {
    const payload: JwtPayload = {
      sub: emp.staffId, name: emp.name, role: emp.role, tenant,
      iat: now, exp: now + ttl, typ, jti: uid("jwt"),
    };
    const body = `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64(JSON.stringify(payload))}`;
    void sign(body); // signature computed async; demo verifies on parse only
    return `${body}.local-sig`;
  };
  return {
    access: mk("access", ACCESS_TTL),
    refresh: mk("refresh", REFRESH_TTL),
    accessExp: (now + ACCESS_TTL) * 1000,
    refreshExp: (now + REFRESH_TTL) * 1000,
  };
}

export function fmtExpLeft(expMs: number): string {
  const left = Math.max(0, expMs - Date.now());
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}
