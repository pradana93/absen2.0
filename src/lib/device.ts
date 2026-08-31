/**
 * Device fingerprint — stable per browser profile. Powers the anti-fraud
 * device binding (one account ↔ one device, releasable by Super Admin).
 */
let cache: string | null = null;

export function getDeviceId(): string {
  if (cache) return cache;
  try {
    const stored = localStorage.getItem("vittoria:device");
    if (stored) { cache = stored; return stored; }
  } catch { /* fallthrough */ }

  const nav = navigator as Navigator & { deviceMemory?: number };
  const raw = [
    navigator.userAgent,
    navigator.language,
    screen.width, screen.height, screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    nav.hardwareConcurrency ?? 0,
    nav.deviceMemory ?? 0,
  ].join("|");

  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < raw.length; i++) {
    h1 = Math.imul(h1 ^ raw.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + raw.charCodeAt(i), 2246822519) >>> 0;
  }
  const id = `dev-${h1.toString(36)}${h2.toString(36)}`;
  try { localStorage.setItem("vittoria:device", id); } catch { /* in-memory only */ }
  cache = id;
  return id;
}

export function shortDevice(id: string): string {
  return id.replace(/^dev-/, "").slice(0, 6).toUpperCase();
}
