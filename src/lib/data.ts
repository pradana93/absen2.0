/**
 * data.ts — the app's data model, seeds, and persistence.
 *
 * Two persistence layers work together:
 *  1. localStorage JSON — the fast, React-friendly live state (source of truth for the UI).
 *  2. Embedded SQLite (sqlEngine.ts) — a REAL relational mirror of this state,
 *     persisted to IndexedDB, queryable with genuine SQL. See lib/sqlEngine.ts.
 */

/* ------------------------------- types ---------------------------------- */
export type Role = "superadmin" | "companyadmin" | "manager" | "employee";
export type EmpStatus = "active" | "inactive" | "resigned";
export type AttendanceType = "IN" | "OUT";
export type LeaveType = "Tahunan" | "Sakit" | "Darurat" | "Melahirkan";
export type LeaveStatus = "pending" | "pending_hr" | "approved" | "rejected";
export type SiteColor = "sun" | "sky" | "teal" | "grape" | "coral";

export interface SalaryStructure { basic: number; transport: number; meal: number; otPerHour: number; }

export interface Site {
  id: string; name: string; shortName: string; address: string;
  hqLat: number; hqLon: number; radiusM: number; color: SiteColor;
}
export interface Shift { id: string; name: string; start: string; end: string; graceMin: number; color: SiteColor; }
export interface Employee {
  staffId: string; nik: string; name: string; email: string; password: string;
  phone: string; address: string; emergencyName: string; emergencyPhone: string;
  department: string; position: string; role: Role; shiftId: string; status: EmpStatus;
  salary: SalaryStructure; siteId: string | null; photo: string | null;
  hash: string | null; deviceId: string | null; deviceBoundAt: number | null; createdAt: number;
}
export interface AttendanceLog {
  id: string; ts: number; staffId: string; name: string; department: string; siteId: string;
  type: AttendanceType; lat: number; lon: number; distanceM: number; faceDist: number | null;
  method: "face" | "manual"; source: "gps" | "sim" | "manual";
  status: "VERIFIED" | "REJECTED"; reason: string | null;
  lateMin?: number; overtimeMin?: number; workMin?: number; photo?: string | null;
}
export interface Leave {
  id: string; staffId: string; name: string; type: LeaveType; date: string; days: number;
  reason: string; status: LeaveStatus; managerDecision: { by: string; at: number } | null;
  hrDecision: { by: string; at: number } | null; createdAt: number;
}
export interface BreakRec { id: string; staffId: string; day: string; start: number; end: number | null; }
export interface OrgNode {
  id: string; parentId: string | null; siteId: string | null; title: string;
  staffId: string | null; name: string | null; note: string | null; createdAt: number;
}
export interface BoardPost {
  id: string; siteId: string | null; title: string; body: string; tone: "info" | "warn" | "danger" | "ok";
  createdBy: string; createdAt: number; acks: string[];
}
export interface AuditLog {
  id: string; ts: number; actorId: string; actorName: string; role: Role | "system";
  action: string; target: string; detail: string;
}
export interface Company {
  id: string; name: string; shortName: string; appName: string; appTagline: string;
  hqLat: number; hqLon: number; radiusM: number; maintenance: boolean;
  logo: string | null; brand: string;
}

/* ----------------------------- constants -------------------------------- */
export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Super Admin", companyadmin: "Admin HR", manager: "Manajer", employee: "Karyawan",
};
export const STATUS_LABEL: Record<EmpStatus, string> = { active: "Aktif", inactive: "Nonaktif", resigned: "Resign" };
export const LEAVE_TYPES: LeaveType[] = ["Tahunan", "Sakit", "Darurat", "Melahirkan"];
export const LEAVE_QUOTAS: Record<LeaveType, number> = { Tahunan: 12, Sakit: 10, Darurat: 3, Melahirkan: 90 };
export const DEPARTMENTS = ["Gudang", "Logistik", "Operasional", "QC", "HR", "Keuangan"];
export const SITE_STYLE: Record<SiteColor, { chip: string; dot: string; grad: string }> = {
  sun: { chip: "bg-sun-100 text-sun-700", dot: "bg-sun-500", grad: "from-sun-400 to-sun-600" },
  sky: { chip: "bg-sky-100 text-sky-600", dot: "bg-sky-500", grad: "from-sky-300 to-sky-600" },
  teal: { chip: "bg-teal-100 text-teal-600", dot: "bg-teal-500", grad: "from-teal-300 to-teal-600" },
  grape: { chip: "bg-grape-100 text-grape-600", dot: "bg-grape-500", grad: "from-grape-300 to-grape-600" },
  coral: { chip: "bg-coral-100 text-coral-600", dot: "bg-coral-500", grad: "from-coral-300 to-coral-600" },
};
const SEED_SALARY: Record<Role, SalaryStructure> = {
  superadmin: { basic: 12_000_000, transport: 25_000, meal: 20_000, otPerHour: 60_000 },
  companyadmin: { basic: 9_500_000, transport: 20_000, meal: 15_000, otPerHour: 45_000 },
  manager: { basic: 8_000_000, transport: 20_000, meal: 15_000, otPerHour: 45_000 },
  employee: { basic: 5_200_000, transport: 20_000, meal: 15_000, otPerHour: 30_000 },
};

/* ------------------------------ utilities ------------------------------- */
export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const TZ = "Asia/Jakarta";
export function wibClock(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(d).replace(/\./g, ":");
}
export function wibDate(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}
export function wibShortDate(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" }).format(d);
}
export function wibTime(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d).replace(/\./g, ":");
}
export function wibDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export const todayKey = (): string => wibDayKey(new Date());
export function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s} dtk lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return wibShortDate(new Date(ts));
}
export function fmtDuration(min: number): string {
  return `${Math.floor(min / 60)}j ${String(Math.round(min % 60)).padStart(2, "0")}m`;
}
export function idr(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

/* ------------------------------- geospatial ----------------------------- */
export interface GeoPoint { lat: number; lon: number; }
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
export function formatMeters(m: number): string {
  if (m < 0) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

/* --------------------------- face signature ----------------------------- */
/** Perceptual difference-hash (dHash) of a canvas — a lightweight face signature. */
export function dHash(canvas: HTMLCanvasElement, size = 16): string {
  const c = document.createElement("canvas");
  c.width = size + 1; c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0, size + 1, size);
  const data = ctx.getImageData(0, 0, size + 1, size).data;
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  let out = "";
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out += gray[y * (size + 1) + x] > gray[y * (size + 1) + x + 1] ? "1" : "0";
  return out;
}
export function hamming(a: string, b: string): number {
  let d = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
  return d / Math.max(1, n);
}

/* ------------------------------- seeds ---------------------------------- */
export function seedCompany(): Company {
  return {
    id: "comp-01", name: "PT Vittoria Logistik Indonesia", shortName: "Vittoria",
    appName: "Vittoria HR", appTagline: "Absensi Wajah & Geofencing",
    hqLat: -6.1754, hqLon: 106.8272, radiusM: 100, maintenance: false, logo: null, brand: "sun",
  };
}
export function seedSites(): Site[] {
  return [
    { id: "site-vit", name: "Gudang Vittoria", shortName: "Vittoria", address: "Jl. Gatot Subroto Kav. 21, Jakarta Pusat", hqLat: -6.1754, hqLon: 106.8272, radiusM: 100, color: "sun" },
    { id: "site-bc", name: "Gudang Batu Ceper", shortName: "Batu Ceper", address: "Jl. Pembangunan III, Batu Ceper, Tangerang", hqLat: -6.1668, hqLon: 106.6315, radiusM: 120, color: "sky" },
  ];
}
export function seedShifts(): Shift[] {
  return [
    { id: "sh-pagi", name: "Shift Pagi", start: "08:00", end: "16:00", graceMin: 15, color: "sun" },
    { id: "sh-siang", name: "Shift Siang", start: "14:00", end: "22:00", graceMin: 15, color: "sky" },
    { id: "sh-malam", name: "Shift Malam", start: "22:00", end: "06:00", graceMin: 20, color: "grape" },
    { id: "sh-fleks", name: "Fleksibel (Kantor)", start: "08:00", end: "17:00", graceMin: 30, color: "teal" },
  ];
}
function emp(partial: Partial<Employee> & { staffId: string; name: string; role: Role; email: string }): Employee {
  const role = partial.role;
  return {
    nik: `3171${String(Math.floor(100000000 + Math.random() * 899999999))}`,
    password: role === "superadmin" ? "super123" : role === "companyadmin" ? "admin123" : "123456",
    phone: "+62 812-0000-0000", address: "—", emergencyName: "—", emergencyPhone: "—",
    department: "Gudang", position: "Staff", shiftId: "sh-pagi", status: "active",
    salary: { ...SEED_SALARY[role] }, siteId: "site-vit", photo: null, hash: null,
    deviceId: null, deviceBoundAt: null, createdAt: Date.now() - 60 * 86400_000,
    ...partial,
  };
}
export function seedEmployees(): Employee[] {
  return [
    emp({ staffId: "SU-001", name: "Wahyu Handoko", role: "superadmin", email: "wh.leader.vt@gmail.com", position: "Super Admin", department: "HR", siteId: null, shiftId: "sh-fleks" }),
    emp({ staffId: "HR-001", name: "Maya Kirana", role: "companyadmin", email: "hr@vittoria.co.id", position: "HR Manager", department: "HR", siteId: null, shiftId: "sh-fleks" }),
    emp({ staffId: "MGR-001", name: "Budi Hartono", role: "manager", email: "budi.hartono@vittoria.co.id", position: "Manajer Operasional", department: "Operasional", siteId: "site-vit" }),
    emp({ staffId: "VTR-001", name: "Andi Saputra", role: "employee", email: "andi.saputra@vittoria.co.id", position: "Operator Forklift", siteId: "site-vit" }),
    emp({ staffId: "VTR-002", name: "Rina Marlina", role: "employee", email: "rina.marlina@vittoria.co.id", position: "Admin Gudang", siteId: "site-vit" }),
    emp({ staffId: "VTR-003", name: "Joko Prasetyo", role: "employee", email: "joko.prasetyo@vittoria.co.id", position: "Driver", department: "Logistik", siteId: "site-bc", shiftId: "sh-siang" }),
    emp({ staffId: "VTR-004", name: "Sari Wulandari", role: "employee", email: "sari.wulandari@vittoria.co.id", position: "QC Inspector", department: "QC", siteId: "site-bc" }),
  ];
}
function tsAt(day: string, hm: string): number {
  return new Date(`${day}T${hm}:00+07:00`).getTime();
}
function dayKeyOffset(offset: number): string {
  const d = new Date(); d.setDate(d.getDate() - offset);
  return wibDayKey(d);
}
export function seedLogs(sites: Site[]): AttendanceLog[] {
  const logs: AttendanceLog[] = [];
  const roster = [
    { id: "MGR-001", name: "Budi Hartono", site: "site-vit" },
    { id: "VTR-001", name: "Andi Saputra", site: "site-vit" },
    { id: "VTR-002", name: "Rina Marlina", site: "site-vit" },
    { id: "VTR-003", name: "Joko Prasetyo", site: "site-bc" },
    { id: "VTR-004", name: "Sari Wulandari", site: "site-bc" },
  ];
  const byId = new Map(sites.map((s) => [s.id, s]));
  for (let d = 6; d >= 0; d--) {
    const day = dayKeyOffset(d);
    roster.forEach((r, si) => {
      const st = byId.get(r.site); if (!st) return;
      const dist = 18 + ((si * 13 + d * 7) % 70);
      const late = (si + d) % 5 === 0;
      const inHm = late ? `08:${String(22 + ((si * 3) % 20)).padStart(2, "0")}` : `07:${String(45 + ((si * 4) % 14)).padStart(2, "0")}`;
      logs.push({ id: uid("log"), ts: tsAt(day, inHm), staffId: r.id, name: r.name, department: "Gudang", siteId: st.id, type: "IN", lat: st.hqLat, lon: st.hqLon, distanceM: dist, faceDist: 0.3, method: "face", source: "gps", status: "VERIFIED", reason: null, lateMin: late ? 12 + si * 4 : undefined });
      logs.push({ id: uid("log"), ts: tsAt(day, `16:${String(5 + ((si * 6) % 30)).padStart(2, "0")}`), staffId: r.id, name: r.name, department: "Gudang", siteId: st.id, type: "OUT", lat: st.hqLat, lon: st.hqLon, distanceM: dist + 4, faceDist: 0.32, method: "face", source: "gps", status: "VERIFIED", reason: null, workMin: 450 + ((si * 17) % 60), overtimeMin: si % 3 === 0 ? 15 + si * 6 : undefined });
    });
  }
  return logs.sort((a, b) => b.ts - a.ts);
}
export function seedLeaves(): Leave[] {
  return [
    { id: uid("lv"), staffId: "VTR-001", name: "Andi Saputra", type: "Tahunan", date: dayKeyOffset(-3), days: 2, reason: "Acara keluarga", status: "pending", managerDecision: null, hrDecision: null, createdAt: Date.now() - 5 * 3600_000 },
    { id: uid("lv"), staffId: "VTR-003", name: "Joko Prasetyo", type: "Sakit", date: dayKeyOffset(2), days: 1, reason: "Demam", status: "approved", managerDecision: { by: "Budi Hartono", at: Date.now() - 2 * 86400_000 }, hrDecision: { by: "Maya Kirana", at: Date.now() - 86400_000 }, createdAt: Date.now() - 3 * 86400_000 },
  ];
}
export function seedOrg(): OrgNode[] {
  const t = Date.now() - 30 * 86400_000;
  return [
    { id: "org-1", parentId: null, siteId: "site-vit", title: "Manajer Operasional", staffId: "MGR-001", name: null, note: "Pimpinan gudang", createdAt: t },
    { id: "org-2", parentId: "org-1", siteId: "site-vit", title: "Admin Gudang", staffId: "VTR-002", name: null, note: null, createdAt: t + 1 },
    { id: "org-3", parentId: "org-1", siteId: "site-vit", title: "Operator Forklift", staffId: "VTR-001", name: null, note: null, createdAt: t + 2 },
  ];
}
export function seedBoard(): BoardPost[] {
  return [
    { id: "an-1", siteId: null, title: "Stock opname akhir bulan", body: "Gudang stock opname Sabtu 08.00–12.00. Semua staf wajib hadir.", tone: "warn", createdBy: "Maya Kirana", createdAt: Date.now() - 6 * 3600_000, acks: ["VTR-002"] },
  ];
}
export function seedAudit(): AuditLog[] {
  return [
    { id: uid("aud"), ts: Date.now() - 3600_000, actorId: "HR-001", actorName: "Maya Kirana", role: "companyadmin", action: "SEED", target: "system", detail: "Data demo awal dimuat" },
  ];
}

/* ---------------------------- persistence ------------------------------- */
export const DATA_VERSION = "7";
const NS = "vittoria:";
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch { return fallback; }
}
function save(key: string, value: unknown): void {
  try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch { /* quota */ }
}
export const db = {
  loadCompany: () => load<Company>("company", seedCompany()), saveCompany: (v: Company) => save("company", v),
  loadSites: () => load<Site[]>("sites", []), saveSites: (v: Site[]) => save("sites", v),
  loadShifts: () => load<Shift[]>("shifts", []), saveShifts: (v: Shift[]) => save("shifts", v),
  loadEmployees: () => load<Employee[]>("employees", []), saveEmployees: (v: Employee[]) => save("employees", v),
  loadLogs: () => load<AttendanceLog[]>("logs", []), saveLogs: (v: AttendanceLog[]) => save("logs", v),
  loadLeaves: () => load<Leave[]>("leaves", []), saveLeaves: (v: Leave[]) => save("leaves", v),
  loadBreaks: () => load<BreakRec[]>("breaks", []), saveBreaks: (v: BreakRec[]) => save("breaks", v),
  loadOrg: () => load<OrgNode[]>("org", []), saveOrg: (v: OrgNode[]) => save("org", v),
  loadBoard: () => load<BoardPost[]>("board", []), saveBoard: (v: BoardPost[]) => save("board", v),
  loadAudit: () => load<AuditLog[]>("audit", []), saveAudit: (v: AuditLog[]) => save("audit", v),
  loadSession: () => load<{ staffId: string; siteId: string } | null>("session", null),
  saveSession: (v: { staffId: string; siteId: string } | null) => save("session", v),
  wasSeeded: () => load<boolean>("seeded", false), markSeeded: () => save("seeded", true),
};
export function clearAll(): void {
  ["company", "sites", "shifts", "employees", "logs", "leaves", "breaks", "org", "board", "audit", "session", "seeded"].forEach((k) => {
    try { localStorage.removeItem(NS + k); } catch { /* noop */ }
  });
}
export function ensureFreshVersion(): void {
  try {
    if (localStorage.getItem(NS + "dataversion") !== DATA_VERSION) {
      clearAll();
      localStorage.setItem(NS + "dataversion", DATA_VERSION);
    }
  } catch { /* noop */ }
}

/* ------------------------------- exports -------------------------------- */
export function downloadTextFile(name: string, content: string, mime = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
export function buildCsv(logs: AttendanceLog[]): string {
  const head = "Waktu;Staff;Nama;Tipe;Gudang;Jarak(m);Status;Alasan";
  const body = logs.map((l) => [
    new Date(l.ts).toLocaleString("id-ID", { timeZone: TZ }), l.staffId, l.name, l.type,
    l.siteId, String(Math.round(l.distanceM)), l.status, l.reason ?? "",
  ].join(";"));
  return "\uFEFF" + [head, ...body].join("\n");
}
