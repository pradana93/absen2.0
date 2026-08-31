/**
 * database.ts — data access layer.
 * Fase 1: localStorage is the synchronous hot-cache; every write is mirrored
 * transactionally into embedded SQLite (lib/sql) which is the durable engine
 * (persisted to IndexedDB). Fase 2: the same collections map onto Postgres.
 */
import { uid, wibDayKey } from "./format";
import { readCollection, SPECS, syncCollection } from "./sql/bridge";
import { sqlGetMeta, sqlReady, sqlSetMeta } from "./sql/engine";

/* --------------------------------- types -------------------------------- */
export type Role = "employee" | "manager" | "companyadmin" | "superadmin";
export type EmpStatus = "active" | "inactive" | "resigned";
export type AttendanceType = "IN" | "OUT";
export type LeaveType = "Tahunan" | "Sakit" | "Darurat" | "Melahirkan";
export type LeaveStatus = "pending" | "pending_hr" | "approved" | "rejected";
export type SiteColor = "sun" | "sky" | "teal" | "grape" | "coral";

export interface SalaryStructure { basic: number; transport: number; meal: number; otPerHour: number; }

export interface Employee {
  staffId: string; nik: string; name: string; email: string; password: string;
  phone: string; address: string; emergencyName: string; emergencyPhone: string;
  department: string; position: string; role: Role; shiftId: string; status: EmpStatus;
  salary: SalaryStructure; siteId: string | null;
  photo: string | null; descriptor: number[] | null; hash: string | null;
  deviceId: string | null; deviceBoundAt: number | null; createdAt: number;
}

export interface AttendanceLog {
  id: string; ts: number; staffId: string; name: string; department: string; siteId: string;
  type: AttendanceType; lat: number; lon: number; distanceM: number; faceDist: number | null;
  method: "face" | "manual"; source: "gps" | "sim" | "manual"; status: "VERIFIED" | "REJECTED";
  reason: string | null; lateMin?: number; overtimeMin?: number; workMin?: number; photo?: string | null;
}

export interface LeaveRequest {
  id: string; staffId: string; name: string; type: LeaveType; date: string; days: number;
  reason: string; attachment: { name: string; dataUrl: string } | null; status: LeaveStatus;
  managerDecision: { by: string; at: number } | null; hrDecision: { by: string; at: number } | null;
  createdAt: number;
}

export interface Shift { id: string; name: string; start: string; end: string; graceMin: number; color: SiteColor; }

export interface OrgNode {
  id: string; parentId: string | null; siteId: string; title: string;
  staffId: string | null; name: string | null; note: string | null; createdAt: number;
}

export interface BoardPost {
  id: string; siteId: string | null; title: string; body: string;
  tone: "info" | "warn" | "danger" | "ok"; createdBy: string; createdAt: number; acks: string[];
}

export interface Notif { id: string; staffId: string; title: string; body: string; tone: "ok" | "warn" | "danger" | "info"; ts: number; read: boolean; }
export interface AuditLog { id: string; ts: number; actorId: string; actorName: string; role: Role | "system"; action: string; target: string; detail: string; }
export interface BreakRec { id: string; staffId: string; day: string; start: number; end: number | null; }

export interface Holiday { date: string; name: string; }
export interface AnnouncementBanner { text: string; tone: "info" | "warn" | "danger"; }

export interface Company {
  id: string; name: string; shortName: string; address: string;
  appName: string; appTagline: string; logo: string | null; brand: string;
  maintenance: boolean; deviceBinding: boolean;
  announcement: AnnouncementBanner | null; holidays: Holiday[];
}

export interface Site {
  id: string; name: string; shortName: string; address: string;
  hqLat: number; hqLon: number; radiusM: number; color: SiteColor;
}

export interface Settings { simEnabled: boolean; simLat: number; simLon: number; matchThreshold: number; }
export interface SmtpConfig { enabled: boolean; host: string; port: number; secure: boolean; user: string; pass: string; fromName: string; }
export interface ResetToken { token: string; staffId: string; email: string; exp: number; used: boolean; }

export interface Payslip {
  id: string; staffId: string; name: string; month: string;
  status: "draft" | "issued"; issuedAt?: number; issuedBy?: string;
  hadir: number; terlambat: number; lateMin: number;
  basicProrated: number; allowances: number; overtimePay: number; overtimeMin: number;
  bonus: number; deductions: number; net: number; note?: string;
}

export interface TenantIdentity {
  name: string; appName: string; appTagline: string; logo: string | null; brand: string;
  announcement?: AnnouncementBanner | null;
}

export interface MasterPayload {
  company?: Company; sites?: Site[]; employees?: Employee[]; shifts?: Shift[];
  departments?: string[]; leaveQuotas?: Partial<Record<LeaveType, number>>;
  salaryDefaults?: Partial<Record<Role, SalaryStructure>>;
}

/* ------------------------------- constants ------------------------------ */
export const NS = "vittoria:";
export const KEY_COMPANY = NS + "company";
export const KEY_SITES = NS + "sites";
export const DATA_VERSION = "7";

export const ROLE_LABEL: Record<Role, string> = {
  employee: "Karyawan", manager: "Manajer", companyadmin: "Admin HR", superadmin: "Super Admin",
};
export const STATUS_LABEL: Record<EmpStatus, string> = { active: "Aktif", inactive: "Nonaktif", resigned: "Resign" };
export const LEAVE_TYPES: LeaveType[] = ["Tahunan", "Sakit", "Darurat", "Melahirkan"];
export const LEAVE_QUOTAS: Record<LeaveType, number> = { Tahunan: 12, Sakit: 10, Darurat: 3, Melahirkan: 90 };
export const EMAIL_DOMAIN = "vittoria.co.id";
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const SITE_STYLE: Record<SiteColor, { chip: string; dot: string; grad: string }> = {
  sun:   { chip: "bg-sun-100 text-sun-700",     dot: "bg-sun-500",   grad: "from-sun-400 to-sun-600" },
  sky:   { chip: "bg-sky-100 text-sky-600",     dot: "bg-sky-500",   grad: "from-sky-300 to-sky-600" },
  teal:  { chip: "bg-teal-100 text-teal-600",   dot: "bg-teal-500",  grad: "from-teal-300 to-teal-600" },
  grape: { chip: "bg-grape-100 text-grape-600", dot: "bg-grape-500", grad: "from-grape-300 to-grape-600" },
  coral: { chip: "bg-coral-100 text-coral-600", dot: "bg-coral-500", grad: "from-coral-300 to-coral-600" },
};

export interface BrandPreset { id: string; name: string; swatch: string; vars: Record<string, string>; }
export const BRAND_PRESETS: BrandPreset[] = [
  { id: "sun", name: "Safety Orange", swatch: "#f07300", vars: { "--color-sun-300": "#ffc684", "--color-sun-400": "#ff9d2e", "--color-sun-500": "#f07300", "--color-sun-600": "#d95f00" } },
  { id: "navy", name: "Corporate Navy", swatch: "#2b4d9b", vars: { "--color-sun-300": "#9db6ee", "--color-sun-400": "#5f83d6", "--color-sun-500": "#2b4d9b", "--color-sun-600": "#1f3a78" } },
  { id: "forest", name: "Forest Green", swatch: "#1d8a56", vars: { "--color-sun-300": "#8fdcb4", "--color-sun-400": "#43bd82", "--color-sun-500": "#1d8a56", "--color-sun-600": "#146b42" } },
  { id: "coral", name: "Signal Coral", swatch: "#e0483e", vars: { "--color-sun-300": "#ffb0a8", "--color-sun-400": "#f4736a", "--color-sun-500": "#e0483e", "--color-sun-600": "#b93329" } },
  { id: "grape", name: "Royal Grape", swatch: "#7a3fc4", vars: { "--color-sun-300": "#cfaef2", "--color-sun-400": "#a06be0", "--color-sun-500": "#7a3fc4", "--color-sun-600": "#5f2da0" } },
  { id: "teal", name: "Deep Teal", swatch: "#0e8f96", vars: { "--color-sun-300": "#8adde0", "--color-sun-400": "#3cb4ba", "--color-sun-500": "#0e8f96", "--color-sun-600": "#0a6e74" } },
];

export function applyBrand(id: string) {
  const preset = BRAND_PRESETS.find((p) => p.id === id) ?? BRAND_PRESETS[0];
  const root = document.documentElement;
  Object.entries(preset.vars).forEach(([k, v]) => root.style.setProperty(k, v));
}

/* -------------------------------- storage ------------------------------- */
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

/** Write-through: hot-cache (localStorage) + durable engine (SQLite). */
function save(key: string, value: unknown) {
  try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch {
    try { window.dispatchEvent(new Event("vittoria:storage-full")); } catch { /* noop */ }
  }
  if (sqlReady() && SPECS[key]) {
    const rows = key === "company" ? [value as Record<string, unknown>] : (value as Record<string, unknown>[]);
    if (Array.isArray(rows)) syncCollection(key, rows);
  }
}

export function clearAll() {
  Object.keys(localStorage).filter((k) => k.startsWith(NS)).forEach((k) => localStorage.removeItem(k));
  import("./sql/bridge").then((b) => b.clearAllTables()).catch(() => undefined);
}

/* ------------------------------ versioning ------------------------------ */
export function ensureFreshVersion() {
  try {
    if (localStorage.getItem(NS + "dataversion") !== DATA_VERSION) {
      Object.keys(localStorage).filter((k) => k.startsWith(NS)).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(NS + "dataversion", DATA_VERSION);
    }
  } catch { /* private mode */ }
}

/* --------------------------------- seeds -------------------------------- */
export const SEED_HOLIDAYS: Holiday[] = [
  { date: "2025-01-01", name: "Tahun Baru Masehi" }, { date: "2025-03-31", name: "Idul Fitri 1446 H" },
  { date: "2025-05-01", name: "Hari Buruh Internasional" }, { date: "2025-08-17", name: "HUT Kemerdekaan RI" },
  { date: "2025-12-25", name: "Hari Raya Natal" }, { date: "2026-01-01", name: "Tahun Baru Masehi" },
  { date: "2026-03-20", name: "Idul Fitri 1447 H" }, { date: "2026-05-01", name: "Hari Buruh Internasional" },
  { date: "2026-08-17", name: "HUT Kemerdekaan RI" }, { date: "2026-12-25", name: "Hari Raya Natal" },
];

export function seedCompany(): Company {
  return {
    id: "comp-01", name: "PT Vittoria Logistik Indonesia", shortName: "Vittoria",
    address: "Jl. Gatot Subroto Kav. 21, Jakarta Pusat",
    appName: "Vittoria HR", appTagline: "Absensi Wajah & Geofencing",
    logo: null, brand: "sun", maintenance: false, deviceBinding: true,
    announcement: null, holidays: [...SEED_HOLIDAYS],
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
    { id: "sh-fleks", name: "Fleksibel", start: "08:00", end: "17:00", graceMin: 60, color: "teal" },
  ];
}

export function seedEmployees(): Employee[] {
  const t = Date.now() - 60 * 86400_000;
  const mk = (
    staffId: string, name: string, role: Role, dept: string, position: string, shiftId: string,
    siteId: string | null, email: string, password: string, basic: number,
  ): Employee => ({
    staffId, nik: `3171${String(100000000 + Math.floor(Math.random() * 899999999))}`, name, email, password,
    phone: "+62 812-0000-0000", address: "—", emergencyName: "—", emergencyPhone: "—",
    department: dept, position, role, shiftId, status: "active",
    salary: { basic, transport: 20_000, meal: 15_000, otPerHour: role === "employee" ? 30_000 : 45_000 },
    siteId, photo: null, descriptor: null, hash: null, deviceId: null, deviceBoundAt: null, createdAt: t,
  });
  return [
    mk("SU-001", "Wahyu Handoko", "superadmin", "Direksi", "Direktur Utama", "sh-fleks", null, "wh.leader.vt@gmail.com", "super123", 25_000_000),
    mk("HR-001", "Maya Kirana", "companyadmin", "HR", "HR Manager", "sh-fleks", null, `hr@${EMAIL_DOMAIN}`, "admin123", 12_000_000),
    mk("MGR-001", "Budi Hartono", "manager", "Gudang", "Manajer Operasional", "sh-pagi", "site-vit", `budi.hartono@${EMAIL_DOMAIN}`, "123456", 9_500_000),
    mk("VTR-001", "Andi Saputra", "employee", "Gudang", "Operator Forklift", "sh-pagi", "site-vit", `andi.saputra@${EMAIL_DOMAIN}`, "123456", 5_200_000),
    mk("VTR-002", "Rina Marlina", "employee", "Gudang", "Admin Gudang", "sh-pagi", "site-vit", `rina.marlina@${EMAIL_DOMAIN}`, "123456", 5_600_000),
    mk("VTR-003", "Joko Prasetyo", "employee", "Gudang", "Driver", "sh-siang", "site-bc", `joko.prasetyo@${EMAIL_DOMAIN}`, "123456", 5_400_000),
    mk("VTR-004", "Sari Wulandari", "employee", "Gudang", "Inspector", "sh-pagi", "site-bc", `sari.wulandari@${EMAIL_DOMAIN}`, "123456", 5_300_000),
    mk("VTR-005", "Dedi Kurniawan", "employee", "Gudang", "Picker", "sh-malam", "site-vit", `dedi.kurniawan@${EMAIL_DOMAIN}`, "123456", 5_100_000),
  ];
}

function dayKeyOffset(offset: number): string {
  const d = new Date(); d.setDate(d.getDate() - offset);
  return wibDayKey(d);
}
function tsAt(dayKey: string, hm: string): number {
  return new Date(`${dayKey}T${hm}:00+07:00`).getTime();
}

export function seedLogs(sites: Site[]): AttendanceLog[] {
  const logs: AttendanceLog[] = [];
  const roster = [
    { id: "MGR-001", name: "Budi Hartono", site: "site-vit" },
    { id: "VTR-001", name: "Andi Saputra", site: "site-vit" },
    { id: "VTR-002", name: "Rina Marlina", site: "site-vit" },
    { id: "VTR-003", name: "Joko Prasetyo", site: "site-bc" },
    { id: "VTR-004", name: "Sari Wulandari", site: "site-bc" },
    { id: "VTR-005", name: "Dedi Kurniawan", site: "site-vit" },
  ];
  const byId = new Map(sites.map((s) => [s.id, s]));
  for (let d = 6; d >= 0; d--) {
    const day = dayKeyOffset(d);
    roster.forEach((r, si) => {
      const st = byId.get(r.site); if (!st) return;
      const dist = 18 + ((si * 13 + d * 7) % 70);
      const late = (si + d) % 5 === 0;
      const inHm = late ? `08:${String(22 + ((si * 3) % 20)).padStart(2, "0")}` : `07:${String(45 + ((si * 4) % 14)).padStart(2, "0")}`;
      logs.push({
        id: uid("log"), ts: tsAt(day, inHm), staffId: r.id, name: r.name, department: "Gudang", siteId: st.id,
        type: "IN", lat: st.hqLat + (si % 3) * 0.00012, lon: st.hqLon + (si % 2) * 0.0001,
        distanceM: dist, faceDist: Math.round((0.28 + (si % 4) * 0.04) * 1000) / 1000,
        method: "face", source: "gps", status: "VERIFIED", reason: null,
        lateMin: late ? 10 + ((si * 5) % 25) : undefined,
      });
      logs.push({
        id: uid("log"), ts: tsAt(day, `16:${String(5 + ((si * 6) % 30)).padStart(2, "0")}`), staffId: r.id, name: r.name,
        department: "Gudang", siteId: st.id, type: "OUT", lat: st.hqLat + (si % 3) * 0.00012, lon: st.hqLon + (si % 2) * 0.0001,
        distanceM: dist + 4, faceDist: Math.round((0.3 + (si % 4) * 0.035) * 1000) / 1000,
        method: "face", source: "gps", status: "VERIFIED", reason: null,
        workMin: 450 + ((si * 17) % 60), overtimeMin: si % 3 === 0 ? 15 + si * 6 : undefined,
      });
    });
    if (d % 2 === 0) {
      const st = byId.get("site-vit");
      if (st) logs.push({
        id: uid("log"), ts: tsAt(day, "08:41"), staffId: "VTR-005", name: "Dedi Kurniawan", department: "Gudang",
        siteId: st.id, type: "IN", lat: st.hqLat + 0.004, lon: st.hqLon + 0.003,
        distanceM: st.radiusM + 320, faceDist: 0.31, method: "face", source: "gps", status: "REJECTED",
        reason: `Di luar radius (${st.radiusM + 320} m)`,
      });
    }
  }
  return logs.sort((a, b) => b.ts - a.ts);
}

export function seedLeaves(): LeaveRequest[] {
  const t = Date.now();
  return [
    { id: uid("lv"), staffId: "VTR-002", name: "Rina Marlina", type: "Tahunan", date: dayKeyOffset(-4), days: 2, reason: "Acara keluarga di Bandung", attachment: null, status: "pending", managerDecision: null, hrDecision: null, createdAt: t - 5 * 3600_000 },
    { id: uid("lv"), staffId: "VTR-003", name: "Joko Prasetyo", type: "Sakit", date: dayKeyOffset(-2), days: 1, reason: "Demam, surat dokter menyusul", attachment: null, status: "pending_hr", managerDecision: { by: "Budi Hartono", at: t - 20 * 3600_000 }, hrDecision: null, createdAt: t - 26 * 3600_000 },
    { id: uid("lv"), staffId: "VTR-001", name: "Andi Saputra", type: "Tahunan", date: dayKeyOffset(6), days: 1, reason: "Urusan administrasi", attachment: null, status: "approved", managerDecision: { by: "Budi Hartono", at: t - 6 * 86400_000 }, hrDecision: { by: "Maya Kirana", at: t - 5 * 86400_000 }, createdAt: t - 7 * 86400_000 },
  ];
}

export function seedOrgNodes(): OrgNode[] {
  const t = Date.now() - 30 * 86400_000;
  return [
    { id: "org-vit-root", parentId: null, siteId: "site-vit", title: "Manajer Operasional", staffId: "MGR-001", name: null, note: "Pimpinan gudang & armada", createdAt: t },
    { id: "org-vit-adm", parentId: "org-vit-root", siteId: "site-vit", title: "Admin Gudang", staffId: "VTR-002", name: null, note: null, createdAt: t + 1 },
    { id: "org-vit-frk", parentId: "org-vit-root", siteId: "site-vit", title: "Operator Forklift", staffId: "VTR-001", name: null, note: "Shift pagi", createdAt: t + 2 },
    { id: "org-vit-pck", parentId: "org-vit-root", siteId: "site-vit", title: "Picker", staffId: "VTR-005", name: null, note: "Shift malam", createdAt: t + 3 },
    { id: "org-bc-root", parentId: null, siteId: "site-bc", title: "Kepala Gudang", staffId: null, name: "Hasan Basri", note: "Pimpinan gudang Batu Ceper", createdAt: t + 4 },
    { id: "org-bc-drv", parentId: "org-bc-root", siteId: "site-bc", title: "Driver", staffId: "VTR-003", name: null, note: null, createdAt: t + 5 },
    { id: "org-bc-qc", parentId: "org-bc-root", siteId: "site-bc", title: "Inspector", staffId: "VTR-004", name: null, note: null, createdAt: t + 6 },
  ];
}

export function seedBoardPosts(): BoardPost[] {
  return [
    { id: "an-1", siteId: null, tone: "warn", title: "Stock opname akhir bulan", body: "Gudang akan stock opname hari Sabtu 08.00–12.00. Semua staf wajib hadir; absensi tetap menggunakan wajah + GPS.", createdBy: "Maya Kirana", createdAt: Date.now() - 6 * 3600_000, acks: ["VTR-002"] },
    { id: "an-2", siteId: "site-vit", tone: "info", title: "APD baru sudah tersedia", body: "Rompi & helm baru bisa diambil di ruang admin depan. Mohon tukarkan yang lama.", createdBy: "Budi Hartono", createdAt: Date.now() - 26 * 3600_000, acks: ["VTR-001", "VTR-005"] },
  ];
}

export function seedAudit(): AuditLog[] {
  const t = Date.now();
  return [
    { id: uid("aud"), ts: t - 3 * 3600_000, actorId: "system", actorName: "Sistem", role: "system", action: "SEED", target: "tenant", detail: "Data demo Vittoria (2 gudang) dimuat" },
    { id: uid("aud"), ts: t - 2 * 3600_000, actorId: "HR-001", actorName: "Maya Kirana", role: "companyadmin", action: "GEOFENCE_UPDATE", target: "site-vit", detail: "Radius Gudang Vittoria → 100 m" },
  ];
}

export function seedNotifs(): Notif[] {
  return [
    { id: uid("ntf"), staffId: "MGR-001", title: "Cuti menunggu persetujuan", body: "Rina Marlina · Tahunan 2 hari", tone: "warn", ts: Date.now() - 5 * 3600_000, read: false },
  ];
}

/* ------------------------------ accessors ------------------------------- */
const migrateEmployee = (e: Partial<Employee>): Employee => ({
  staffId: e.staffId ?? "—", nik: e.nik ?? "—", name: e.name ?? "—", email: e.email ?? "—",
  password: e.password ?? "123456", phone: e.phone ?? "—", address: e.address ?? "—",
  emergencyName: e.emergencyName ?? "—", emergencyPhone: e.emergencyPhone ?? "—",
  department: e.department === "Direksi" || e.department === "HR" ? e.department : "Gudang",
  position: e.position ?? "Staff", role: e.role ?? "employee", shiftId: e.shiftId ?? "sh-pagi",
  status: e.status ?? "active",
  salary: e.salary ?? { basic: 5_200_000, transport: 20_000, meal: 15_000, otPerHour: 30_000 },
  siteId: e.siteId === undefined ? (e.role === "superadmin" || e.role === "companyadmin" ? null : "site-vit") : e.siteId,
  photo: e.photo ?? null, descriptor: e.descriptor ?? null, hash: e.hash ?? null,
  deviceId: e.deviceId ?? null, deviceBoundAt: e.deviceBoundAt ?? null, createdAt: e.createdAt ?? Date.now(),
});

export const db = {
  loadCompany: (): Company => ({ ...seedCompany(), ...load<Partial<Company>>("company", {}) }),
  saveCompany: (v: Company) => save("company", v),
  loadSites: (): Site[] => { const s = load<Site[]>("sites", []); return s.length ? s : seedSites(); },
  saveSites: (v: Site[]) => save("sites", v),
  loadSiteChoice: () => load<string | null>("sitechoice", null),
  saveSiteChoice: (v: string | null) => save("sitechoice", v),
  loadEmployees: () => load<Partial<Employee>[]>("employees", []).map(migrateEmployee),
  saveEmployees: (v: Employee[]) => save("employees", v),
  loadLogs: () => load<AttendanceLog[]>("logs", []),
  saveLogs: (v: AttendanceLog[]) => save("logs", v),
  loadLeaves: () => load<LeaveRequest[]>("leaves", []),
  saveLeaves: (v: LeaveRequest[]) => save("leaves", v),
  loadShifts: () => load<Shift[]>("shifts", []),
  saveShifts: (v: Shift[]) => save("shifts", v),
  loadOrg: () => load<OrgNode[]>("org", []).map((n) => ({ ...n, siteId: n.siteId ?? "site-vit" })),
  saveOrg: (v: OrgNode[]) => save("org", v),
  loadBoard: () => load<BoardPost[]>("board", []),
  saveBoard: (v: BoardPost[]) => save("board", v),
  loadDepartments: () => { const d = load<string[]>("departments", []); return d.length ? d : ["Gudang"]; },
  saveDepartments: (v: string[]) => save("departments", v),
  loadQuotas: () => load<Record<LeaveType, number>>("quotas", { ...LEAVE_QUOTAS }),
  saveQuotas: (v: Record<LeaveType, number>) => save("quotas", v),
  loadSalaryDefaults: () => load<Record<Role, SalaryStructure>>("salarydefaults", {
    employee: { basic: 5_200_000, transport: 20_000, meal: 15_000, otPerHour: 30_000 },
    manager: { basic: 9_500_000, transport: 25_000, meal: 20_000, otPerHour: 45_000 },
    companyadmin: { basic: 12_000_000, transport: 25_000, meal: 20_000, otPerHour: 50_000 },
    superadmin: { basic: 25_000_000, transport: 30_000, meal: 25_000, otPerHour: 60_000 },
  }),
  saveSalaryDefaults: (v: Record<Role, SalaryStructure>) => save("salarydefaults", v),
  loadAudit: () => load<AuditLog[]>("audit", []),
  saveAudit: (v: AuditLog[]) => save("audit", v),
  loadNotifs: () => load<Notif[]>("notifs", []),
  saveNotifs: (v: Notif[]) => save("notifs", v),
  loadBreaks: () => load<BreakRec[]>("breaks", []),
  saveBreaks: (v: BreakRec[]) => save("breaks", v),
  loadResets: () => load<ResetToken[]>("resets", []),
  saveResets: (v: ResetToken[]) => save("resets", v),
  loadSettings: (): Settings => ({ simEnabled: false, simLat: -6.17555, simLon: 106.82735, matchThreshold: 0.5, ...load<Partial<Settings>>("settings", {}) }),
  saveSettings: (v: Settings) => save("settings", v),
  loadSmtp: (): SmtpConfig => ({ enabled: false, host: "smtp.gmail.com", port: 465, secure: true, user: "", pass: "", fromName: "Vittoria HR", ...load<Partial<SmtpConfig>>("smtp", {}) }),
  saveSmtp: (v: SmtpConfig) => save("smtp", v),
  loadSession: () => load<{ staffId: string; siteId: string; accessExp: number; refreshExp: number; access: string; refresh: string } | null>("session", null),
  saveSession: (v: unknown) => save("session", v),
  wasSeeded: () => load<boolean>("seeded", false),
  markSeeded: () => save("seeded", true),
};

/* --------------------- SQL boot: one-way migration ---------------------- */
/** After the engine is ready: if SQL is empty but the cache is seeded, copy everything in. */
export function bootSqlSync() {
  if (!sqlReady()) return;
  if (sqlGetMeta("migrated") === "1") return;
  const push = (key: string, rows: Record<string, unknown>[]) => { if (rows.length) syncCollection(key, rows); };
  push("company", [db.loadCompany() as unknown as Record<string, unknown>]);
  push("sites", db.loadSites() as unknown as Record<string, unknown>[]);
  push("employees", db.loadEmployees() as unknown as Record<string, unknown>[]);
  push("logs", db.loadLogs() as unknown as Record<string, unknown>[]);
  push("leaves", db.loadLeaves() as unknown as Record<string, unknown>[]);
  push("shifts", db.loadShifts() as unknown as Record<string, unknown>[]);
  push("org", db.loadOrg() as unknown as Record<string, unknown>[]);
  push("board", db.loadBoard() as unknown as Record<string, unknown>[]);
  push("departments", db.loadDepartments().map((name) => ({ name })));
  push("quotas", Object.entries(db.loadQuotas()).map(([type, days]) => ({ type, days })));
  push("salarydefaults", Object.entries(db.loadSalaryDefaults()).map(([role, s]) => ({ role, ...s })));
  push("audits", db.loadAudit() as unknown as Record<string, unknown>[]);
  push("notifs", db.loadNotifs() as unknown as Record<string, unknown>[]);
  push("breaks", db.loadBreaks() as unknown as Record<string, unknown>[]);
  push("resets", db.loadResets() as unknown as Record<string, unknown>[]);
  sqlSetMeta("migrated", "1");
  sqlSetMeta("migrated_at", String(Date.now()));
}

/** Hydrate collections from SQL (source of truth once migrated). */
export function hydrateFromSql(): Record<string, unknown[]> | null {
  if (!sqlReady() || sqlGetMeta("migrated") !== "1") return null;
  return {
    company: readCollection("company"), sites: readCollection("sites"), employees: readCollection("employees"),
    logs: readCollection("logs"), leaves: readCollection("leaves"), shifts: readCollection("shifts"),
    org: readCollection("org"), board: readCollection("board"), departments: readCollection("departments"),
    quotas: readCollection("quotas"), salarydefaults: readCollection("salarydefaults"),
    audits: readCollection("audits"), notifs: readCollection("notifs"), breaks: readCollection("breaks"),
    resets: readCollection("resets"),
  };
}

/* ------------------------------- utilities ------------------------------ */
export function slugEmail(name: string, taken: string[]): string {
  const base = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, "").trim().split(/\s+/).slice(0, 2).join(".") || "staff";
  let candidate = `${base}@${EMAIL_DOMAIN}`;
  let i = 2;
  const t = taken.map((s) => s.toLowerCase());
  while (t.includes(candidate)) candidate = `${base}${i++}@${EMAIL_DOMAIN}`;
  return candidate;
}

export function genPassword(): string { return `vtr-${Math.floor(1000 + Math.random() * 9000)}`; }

export function nextStaffId(employees: Employee[]): string {
  let max = 0;
  for (const e of employees) {
    const m = e.staffId.match(/^VTR-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `VTR-${String(max + 1).padStart(3, "0")}`;
}

export function encodeIdentity(c: Pick<Company, "name" | "appName" | "appTagline" | "logo" | "brand">): string {
  const payload: TenantIdentity = { name: c.name, appName: c.appName, appTagline: c.appTagline, logo: c.logo, brand: c.brand };
  return `vt1.${btoa(unescape(encodeURIComponent(JSON.stringify(payload))))}`;
}
export function decodeIdentity(code: string): TenantIdentity | null {
  try {
    const m = code.trim().match(/^vt1\.(.+)$/s);
    if (!m) return null;
    const p = JSON.parse(decodeURIComponent(escape(atob(m[1])))) as TenantIdentity;
    return typeof p.appName === "string" ? p : null;
  } catch { return null; }
}

export function buildCsv(logs: AttendanceLog[]): string {
  const head = ["Waktu (WIB)", "Staff ID", "Nama", "Departemen", "Gudang", "Tipe", "Status", "Jarak (m)", "Face Δ", "Metode", "Sumber", "Alasan"];
  const rows = logs.map((l) => [
    new Date(l.ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
    l.staffId, l.name, l.department, l.siteId, l.type, l.status,
    String(Math.round(l.distanceM)), l.faceDist?.toFixed(3) ?? "", l.method, l.source, l.reason ?? "",
  ]);
  return "\uFEFF" + [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
}

export function downloadTextFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ------------------------------ date helpers ---------------------------- */
export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date(y, m - 1, 1));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}
export function monthWorkdays(month: string, holidays: Holiday[]): number {
  return monthDays(month).filter((d) => {
    const wd = new Date(`${d}T00:00:00+07:00`).getDay();
    return wd !== 0 && wd !== 6 && !holidays.some((h) => h.date === d);
  }).length;
}

export interface DaySummary {
  inTs: number | null; outTs: number | null; breakMin: number; workMin: number;
  lateMin: number; overtimeMin: number; kind: "work" | "leave" | "holiday" | "none";
}
export function daySummary(
  staffId: string, day: string, logs: AttendanceLog[], breaks: BreakRec[], leaves: LeaveRequest[],
  shifts: Shift[], shiftId: string, holidays: Holiday[],
): DaySummary {
  const dayLogs = logs.filter((l) => l.staffId === staffId && wibDayKey(new Date(l.ts)) === day && l.status === "VERIFIED");
  const inLog = [...dayLogs].reverse().find((l) => l.type === "IN");
  const outLog = [...dayLogs].reverse().find((l) => l.type === "OUT" && (!inLog || l.ts >= inLog.ts));
  const breakMin = Math.round(breaks.filter((b) => b.staffId === staffId && b.day === day && b.end).reduce((a, b) => a + (b.end! - b.start), 0) / 60000);
  const sh = shifts.find((s) => s.id === shiftId);
  let lateMin = 0;
  if (inLog && sh && sh.id !== "sh-fleks") {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(inLog.ts));
    const mins = (Number(parts.find((p) => p.type === "hour")?.value) % 24) * 60 + Number(parts.find((p) => p.type === "minute")?.value);
    const start = Number(sh.start.slice(0, 2)) * 60 + Number(sh.start.slice(3));
    lateMin = Math.max(0, mins - start - sh.graceMin);
  }
  const onLeave = leaves.some((lv) => lv.staffId === staffId && lv.status === "approved" && lv.date <= day && day <= lv.date);
  const isHoliday = holidays.some((h) => h.date === day);
  const workMin = inLog && outLog ? Math.max(0, Math.round((outLog.ts - inLog.ts) / 60000) - breakMin) : inLog ? outLog?.workMin ?? 0 : 0;
  const overtimeMin = outLog?.overtimeMin ?? 0;
  const kind: DaySummary["kind"] = inTs(inLog) ? "work" : onLeave ? "leave" : isHoliday ? "holiday" : "none";
  return { inTs: inLog?.ts ?? null, outTs: outLog?.ts ?? null, breakMin, workMin, lateMin, overtimeMin, kind };
}
function inTs(l: AttendanceLog | undefined): boolean { return !!l; }

export function leaveUsed(leaves: LeaveRequest[], staffId: string, year: number, type: LeaveType): number {
  return leaves.filter((l) => l.staffId === staffId && l.type === type && l.status !== "rejected" && l.date.startsWith(String(year))).reduce((a, l) => a + l.days, 0);
}

/* -------------------------------- payroll ------------------------------- */
export function computeSlip(
  emp: Employee, month: string, logs: AttendanceLog[], breaks: BreakRec[], leaves: LeaveRequest[],
  shifts: Shift[], holidays: Holiday[],
): Payslip {
  const days = monthDays(month);
  let hadir = 0, lateMin = 0, workMin = 0, overtimeMin = 0;
  for (const d of days) {
    const s = daySummary(emp.staffId, d, logs, breaks, leaves, shifts, emp.shiftId, holidays);
    if (s.inTs) { hadir++; lateMin += s.lateMin; workMin += s.workMin; overtimeMin += s.overtimeMin; }
  }
  const workdays = monthWorkdays(month, holidays);
  const attended = days.filter((d) => daySummary(emp.staffId, d, logs, breaks, leaves, shifts, emp.shiftId, holidays).kind !== "none").length;
  const basicProrated = Math.round(emp.salary.basic * (Math.min(hadir + leaveUsed(leaves, emp.staffId, Number(month.slice(0, 4)), "Tahunan") , workdays) / Math.max(1, workdays)));
  const allowances = hadir * (emp.salary.transport + emp.salary.meal);
  const overtimePay = Math.round((overtimeMin / 60) * emp.salary.otPerHour);
  const lateDeduct = Math.round((lateMin / 60) * (emp.salary.basic / workdays / 8));
  const absentDays = Math.max(0, workdays - attended);
  const absentDeduct = Math.round(absentDays * (emp.salary.basic / workdays));
  const deductions = lateDeduct + absentDeduct;
  const net = basicProrated + allowances + overtimePay - deductions;
  return {
    id: `slip-${emp.staffId}-${month}`, staffId: emp.staffId, name: emp.name, month,
    status: "draft", hadir, terlambat: lateMin > 0 ? days.filter((d) => daySummary(emp.staffId, d, logs, breaks, leaves, shifts, emp.shiftId, holidays).lateMin > 0).length : 0,
    lateMin, basicProrated, allowances, overtimePay, overtimeMin, bonus: 0, deductions, net,
  };
}

/* ------------------------------ misc helpers ---------------------------- */
export function readCrashLog(): { ts: number; msg: string } | null {
  try {
    const raw = localStorage.getItem(NS + "crashlog");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function shrinkPhoto(dataUrl: string, maxDim: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function smtpEnvBlock(s: SmtpConfig): string {
  return `SMTP_HOST=${s.host}\nSMTP_PORT=${s.port}\nSMTP_SECURE=${s.secure}\nSMTP_USER=${s.user}\nSMTP_PASS=${s.pass}\nSMTP_FROM_NAME=${s.fromName}`;
}
