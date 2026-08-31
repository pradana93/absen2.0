/** Geospatial utilities — Haversine distance & geofence evaluation. */
export interface GeoPoint { lat: number; lon: number; }
export type GeoStatus = "searching" | "locked" | "denied" | "unavailable" | "sim";
export interface GeoReading extends GeoPoint { accuracy: number; status: GeoStatus; ts: number; simulated: boolean; }

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface FenceVerdict { distanceM: number; inside: boolean; from: GeoPoint; }
export function evaluateFence(pos: GeoPoint, hq: GeoPoint, radiusM: number): FenceVerdict {
  const distanceM = haversineMeters(pos, hq);
  return { distanceM, inside: distanceM <= radiusM, from: hq };
}
export function formatMeters(m: number): string {
  if (m < 0) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}
export function formatCoord(p: GeoPoint): string { return `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`; }

export function destination(p: GeoPoint, bearing: number, distM: number): GeoPoint {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const toDeg = (x: number) => (x * 180) / Math.PI;
  const br = toRad(bearing);
  const lat1 = toRad(p.lat);
  const lon1 = toRad(p.lon);
  const dr = distM / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br));
  const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(lat1), Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: toDeg(lat2), lon: toDeg(lon2) };
}

export function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const toDeg = (x: number) => (x * 180) / Math.PI;
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
