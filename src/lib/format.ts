/** Time & number formatting — all display times in WIB (Asia/Jakarta). */

const TZ = "Asia/Jakarta";

export function wibClock(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(d).replace(/\./g, ":");
}

export function wibDate(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(d);
}

export function wibShortDate(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ, day: "2-digit", month: "short", year: "numeric",
  }).format(d);
}

export function wibTime(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d).replace(/\./g, ":");
}

/** yyyy-mm-dd in WIB — for date filters & log keys. */
export function wibDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function todayKey(): string {
  return wibDayKey(new Date());
}

export function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s} dtk lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return wibShortDate(new Date(ts));
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** "Rp 5.200.000" — Indonesian Rupiah, no decimals. */
export function idr(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n);
}

/** 485 → "8j 05m" */
export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}j ${String(m).padStart(2, "0")}m`;
}
