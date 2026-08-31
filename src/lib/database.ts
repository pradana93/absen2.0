/**
 * Data layer — schema, migrations, seeds, payroll engine, brand presets,
 * tenant identity codec, and CSV helpers. Web equivalent of database.py
 * (SQLite attendance.db). Storage is localStorage under the "vittoria:" ns.
 */
import { uid, wibDayKey } from "./format";

/* ------------------------------ constants ------------------------------- */
export const DEFAULT_HQ = { lat: -6.1754, lon: 106.8272 }; // Gudang Pusat
export const EMAIL_DOMAIN = "vittoria.co.id";
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const DEPARTMENTS = ["Gudang"];

export type Role = "superadmin" | "companyadmin" | "manager" | "employee";
export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Super Admin",
  companyadmin: "Admin HR",
  manager: "Manajer",
  employee: "Karyawan",
};

export type EmpStatus = "active" | "inactive" | "resigned";
export const STATUS_LABEL: Record<EmpStatus, string> = {
  active: "Aktif", inactive: "Nonaktif", resigned: "Resign",
};

export type AttendanceType = "IN" | "OUT";

/* ------------------------------- tables --------------------------------- */
export interface SalaryStructure {
  basic: number;      // gaji pokok / bulan
  transport: number;  // per hari hadir
  meal: number;       // per hari hadir
  otPerHour: number;  // upah lembur / jam
}

export const SEED_SALARY: Record<Role, SalaryStructure> = {
  superadmin: { basic: 18_000_000, transport: 25_000, meal: 20_000, otPerHour: 90_000 },
  companyadmin: { basic: 9_500_000, transport: 25_000, meal: 20_000, otPerHour: 50_000 },
  manager: { basic: 8_000_000, transport: 20_000, meal: 15_000, otPerHour: 45_000 },
  employee: { basic: 5_200_000, transport: 20_000, meal: 15_000, otPerHour: 30_000 },
};

/* ------------------------- sites (Gudang / Area) ------------------------ */
export type SiteColor = "sun" | "sky" | "teal" | "grape" | "coral";

export interface Site {
  id: string;
  name: string;        // "Gudang Pusat Jakarta"
  shortName: string;   // "Jakarta"
  address: string;
  hqLat: number;       // geofence_locations — each site owns its fence
  hqLon: number;
  radiusM: number;
  color: SiteColor;
}

/** Literal class map so Tailwind JIT keeps them. */
export const SITE_STYLE: Record<SiteColor, { chip: string; dot: string; ring: string; grad: string }> = {
  sun:   { chip: "bg-sun-100 text-sun-700",     dot: "bg-sun-500",   ring: "ring-sun-400",   grad: "from-sun-400 to-sun-600" },
  sky:   { chip: "bg-sky-100 text-sky-600",     dot: "bg-sky-500",   ring: "ring-sky-400",   grad: "from-sky-300 to-sky-600" },
  teal:  { chip: "bg-teal-100 text-teal-600",   dot: "bg-teal-500",  ring: "ring-teal-400",  grad: "from-teal-300 to-teal-600" },
  grape: { chip: "bg-grape-100 text-grape-600", dot: "bg-grape-500", ring: "ring-grape-400", grad: "from-grape-300 to-grape-600" },
  coral: { chip: "bg-coral-100 text-coral-600", dot: "bg-coral-500", ring: "ring-coral-400", grad: "from-coral-300 to-coral-600" },
};

export function seedSites(): Site[] {
  return [
    { id: "site-vit", name: "Gudang Vittoria", shortName: "Vittoria", address: "Jl. Gatot Subroto Kav. 21, Jakarta Pusat", hqLat: -6.1754, hqLon: 106.8272, radiusM: 100, color: "sun" },
    { id: "site-bc", name: "Gudang Batu Ceper", shortName: "Batu Ceper", address: "Jl. Pembangunan III, Batu Ceper, Tangerang", hqLat: -6.1668, hqLon: 106.6315, radiusM: 120, color: "sky" },
  ];
}

export interface Employee {
  staffId: string;
  nik: string;
  name: string;
  email: string;
  password: string; // demo — hash server-side in production
  phone: string;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
  department: string;
  position: string;
  role: Role;
  shiftId: string;
  status: EmpStatus;
  salary: SalaryStructure;
  siteId: string | null; // null = Kantor Pusat / semua area (Super Admin & HR)
  photo: string | null;
  descriptor: number[] | null; // 128-D face encoding
  hash: string | null;         // lite-mode dHash
  deviceId: string | null;
  deviceBoundAt: number | null;
  createdAt: number;
}

export interface AttendanceLog {
  id: string;
  ts: number;
  staffId: string;
  name: string;
  department: string;
  siteId: string; // the Gudang/Area where the clock happened
  type: AttendanceType;
  lat: number;
  lon: number;
  distanceM: number;
  faceDist: number | null;
  method: "face" | "manual";
  source: "gps" | "sim" | "manual";
  status: "VERIFIED" | "REJECTED";
  reason: string | null;
  lateMin?: number;
  overtimeMin?: number;
  workMin?: number;
  photo?: string | null; // verification snapshot thumbnail
}

export type LeaveType = "Tahunan" | "Sakit" | "Darurat" | "Melahirkan";
export type LeaveStatus = "pending" | "pending_hr" | "approved" | "rejected";
export const LEAVE_TYPES: LeaveType[] = ["Tahunan", "Sakit", "Darurat", "Melahirkan"];
export const LEAVE_QUOTAS: Record<LeaveType, number> = {
  Tahunan: 12, Sakit: 10, Darurat: 3, Melahirkan: 90,
};

export interface LeaveDecision { by: string; at: number; }
export interface LeaveRequest {
  id: string;
  staffId: string;
  name: string;
  type: LeaveType;
  date: string; // yyyy-mm-dd
  days: number;
  reason: string;
  attachment: { name: string; dataUrl: string } | null;
  status: LeaveStatus;
  managerDecision: LeaveDecision | null;
  hrDecision: LeaveDecision | null;
  createdAt: number;
}

export interface BreakRec {
  id: string;
  staffId: string;
  day: string; // yyyy-mm-dd
  start: number;
  end: number | null;
}

export interface Shift {
  id: string;
  name: string;
  start: string; // HH:mm
  end: string;   // HH:mm
  graceMin: number;
  color: string;
}

export interface Payslip {
  id: string;
  month: string; // yyyy-mm
  staffId: string;
  name: string;
  department: string;
  position: string;
  kerjaHari: number;      // expected workdays
  hadir: number;
  cuti: number;
  libur: number;
  terlambat: number;      // days late
  totalLateMin: number;
  lemburMin: number;
  gajiPokok: number;      // prorated basic
  transport: number;
  meal: number;
  lembur: number;
  bonus: number;
  potongTelat: number;
  potongAbsen: number;
  bruto: number;
  potongan: number;
  net: number;
  note: string;
  status: "draft" | "issued";
  issuedAt: number | null;
  issuedBy: string | null;
  createdAt: number;
}

export interface AuditLog {
  id: string;
  ts: number;
  actorId: string;
  actorName: string;
  role: Role | "system";
  action: string;
  target: string;
  detail: string;
}

export interface Notif {
  id: string;
  staffId: string;
  title: string;
  body: string;
  tone: "info" | "ok" | "warn" | "danger";
  ts: number;
  read: boolean;
}

export interface Settings {
  matchThreshold: number;
  simEnabled: boolean;
  simLat: number;
  simLon: number;
}
export const DEFAULT_SETTINGS: Settings = {
  matchThreshold: 0.5,
  simEnabled: false,
  simLat: -6.17555,
  simLon: 106.82735,
};

export interface Holiday { date: string; name: string; }
export interface Announcement { text: string; tone: "info" | "warn" | "danger"; }

export interface Company {
  id: string;
  name: string;
  shortName: string;
  address: string; // kantor pusat (branding only — geofences live on each Site)
  deviceBinding: boolean;
  holidays: Holiday[];
  appName: string;
  appTagline: string;
  logo: string | null;
  brand: string;
  announcement: Announcement | null;
  maintenance: boolean;
}

export const SEED_HOLIDAYS: Holiday[] = [
  { date: "2025-01-01", name: "Tahun Baru Masehi" },
  { date: "2025-03-31", name: "Idul Fitri 1446 H" },
  { date: "2025-04-01", name: "Idul Fitri (hari ke-2)" },
  { date: "2025-05-01", name: "Hari Buruh Internasional" },
  { date: "2025-08-17", name: "HUT Kemerdekaan RI" },
  { date: "2025-12-25", name: "Hari Raya Natal" },
  { date: "2026-01-01", name: "Tahun Baru Masehi" },
  { date: "2026-03-19", name: "Nyepi" },
  { date: "2026-03-20", name: "Idul Fitri 1447 H" },
  { date: "2026-05-01", name: "Hari Buruh Internasional" },
  { date: "2026-08-17", name: "HUT Kemerdekaan RI" },
  { date: "2026-12-25", name: "Hari Raya Natal" },
];

/* ------------------------- brand preset system --------------------------- */
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

/* ------------------------------ storage ---------------------------------- */
const NS = "vittoria:";
export const KEY_COMPANY = NS + "company";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch { /* quota / private mode */ }
}

export function clearAll() {
  ["employees", "logs", "settings", "seeded", "company", "shifts", "leaves", "breaks", "audit", "notifs", "session", "payslips", "org", "sites", "sitechoice"].forEach((k) =>
    localStorage.removeItem(NS + k),
  );
}

/**
 * Schema versioning — when the data model changes between releases we wipe
 * and reseed, so stale local data can never break login or rendering.
 */
export const DATA_VERSION = "7";
export function ensureFreshVersion() {
  try {
    if (localStorage.getItem(NS + "dataversion") !== DATA_VERSION) {
      clearAll();
      localStorage.setItem(NS + "dataversion", DATA_VERSION);
    }
  } catch { /* storage unavailable — run in-memory */ }
}

/* ------------------------- legacy migrations ----------------------------- */
const ROLE_MIGRATION: Record<string, Role> = {
  admin: "companyadmin", staff: "employee", hr: "companyadmin", su: "superadmin",
};
const SHIFT_MIGRATION: Record<string, string> = {
  pagi: "sh-pagi", siang: "sh-siang", malam: "sh-malam", fleksibel: "sh-fleks",
};
const STATUS_MIGRATION: Record<string, EmpStatus> = { disabled: "inactive", resigned: "resigned" };

function migrateEmployee(e: Partial<Employee> & Record<string, unknown>): Employee {
  const role = (ROLE_MIGRATION[String(e.role ?? "")] ?? e.role ?? "employee") as Role;
  return {
    staffId: String(e.staffId ?? "VTR-000"),
    nik: String(e.nik ?? ""),
    name: String(e.name ?? "Tanpa Nama"),
    email: String(e.email ?? slugEmail(String(e.name ?? "staff"), [])),
    password: String(e.password ?? "123456"),
    phone: String(e.phone ?? "—"),
    address: String(e.address ?? "—"),
    emergencyName: String(e.emergencyName ?? "—"),
    emergencyPhone: String(e.emergencyPhone ?? "—"),
    department: String(e.department ?? "Gudang"),
    position: String(e.position ?? "Staff"),
    role,
    shiftId: SHIFT_MIGRATION[String(e.shiftId ?? e.shift ?? "")] ?? String(e.shiftId ?? "sh-pagi"),
    status: STATUS_MIGRATION[String(e.status ?? "")] ?? (e.status as EmpStatus) ?? "active",
    salary: (e.salary as SalaryStructure) ?? SEED_SALARY[role],
    siteId: (e.siteId as string | null) ?? (role === "superadmin" || role === "companyadmin" ? null : "site-vit"),
    photo: (e.photo as string | null) ?? null,
    descriptor: (e.descriptor as number[] | null) ?? null,
    hash: (e.hash as string | null) ?? null,
    deviceId: (e.deviceId as string | null) ?? null,
    deviceBoundAt: (e.deviceBoundAt as number | null) ?? null,
    createdAt: Number(e.createdAt ?? Date.now()),
  };
}

export const db = {
  loadEmployees: () => load<unknown[]>("employees", []).map((e) => migrateEmployee(e as Partial<Employee> & Record<string, unknown>)),
  saveEmployees: (v: Employee[]) => save("employees", v),
  loadLogs: () => load<AttendanceLog[]>("logs", []),
  saveLogs: (v: AttendanceLog[]) => save("logs", v),
  loadSettings: () => ({ ...DEFAULT_SETTINGS, ...load<Partial<Settings>>("settings", {}) }),
  saveSettings: (v: Settings) => save("settings", v),
  wasSeeded: () => load<boolean>("seeded", false),
  markSeeded: () => save("seeded", true),
  loadCompany: () => ({ ...seedCompany(), ...load<Partial<Company>>("company", {}) }),
  saveCompany: (v: Company) => save("company", v),
  loadShifts: () => load<Shift[]>("shifts", []),
  saveShifts: (v: Shift[]) => save("shifts", v),
  loadLeaves: () => load<LeaveRequest[]>("leaves", []),
  saveLeaves: (v: LeaveRequest[]) => save("leaves", v),
  loadBreaks: () => load<BreakRec[]>("breaks", []),
  saveBreaks: (v: BreakRec[]) => save("breaks", v),
  loadAudit: () => load<AuditLog[]>("audit", []),
  saveAudit: (v: AuditLog[]) => save("audit", v),
  loadNotifs: () => load<Notif[]>("notifs", []),
  saveNotifs: (v: Notif[]) => save("notifs", v),
  loadSession: () => load<{ staffId: string; access: string; refresh: string; accessExp: number; refreshExp: number } | null>("session", null),
  saveSession: (v: unknown) => save("session", v),
  loadPayslips: () => load<Payslip[]>("payslips", []),
  savePayslips: (v: Payslip[]) => save("payslips", v),
  loadOrg: () => load<OrgNode[]>("org", []).map((n) => ({ ...n, siteId: n.siteId ?? "site-vit" })),
  saveOrg: (v: OrgNode[]) => save("org", v),
  loadSites: () => load<Site[]>("sites", []),
  saveSites: (v: Site[]) => save("sites", v),
  loadSiteChoice: () => load<string | null>("sitechoice", null),
  saveSiteChoice: (v: string | null) => save("sitechoice", v),
};
export const KEY_SITES = NS + "sites";

/* ------------------------------- helpers --------------------------------- */
export function genPassword(): string {
  return `vtr-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function slugEmail(name: string, taken: string[]): string {
  const base =
    name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, "")
      .trim().split(/\s+/).slice(0, 2).join(".") || "staff";
  let candidate = `${base}@${EMAIL_DOMAIN}`;
  let i = 2;
  const t = taken.map((s) => s.toLowerCase());
  while (t.includes(candidate)) candidate = `${base}${i++}@${EMAIL_DOMAIN}`;
  return candidate;
}

export function nextStaffId(employees: Employee[]): string {
  let max = 0;
  for (const e of employees) {
    const m = /^VTR-(\d+)$/.exec(e.staffId);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `VTR-${String(max + 1).padStart(3, "0")}`;
}

/* -------------------------------- seeds ---------------------------------- */
export function seedCompany(): Company {
  return {
    id: "comp-01",
    name: "PT Vittoria Logistik Indonesia",
    shortName: "Vittoria",
    address: "Jl. Gatot Subroto Kav. 21, Jakarta Pusat",
    deviceBinding: true,
    holidays: [...SEED_HOLIDAYS],
    appName: "Vittoria HR",
    appTagline: "Absensi Wajah & Geofencing",
    logo: null,
    brand: "sun",
    announcement: null,
    maintenance: false,
  };
}

export function seedShifts(): Shift[] {
  return [
    { id: "sh-pagi", name: "Pagi", start: "08:00", end: "16:00", graceMin: 15, color: "sun" },
    { id: "sh-siang", name: "Siang", start: "12:00", end: "20:00", graceMin: 15, color: "sky" },
    { id: "sh-malam", name: "Malam", start: "20:00", end: "04:00", graceMin: 20, color: "grape" },
    { id: "sh-fleks", name: "Fleksibel", start: "08:00", end: "17:00", graceMin: 60, color: "teal" },
  ];
}

function mkEmp(
  staffId: string, name: string, position: string,
  role: Role, shiftId: string, email: string, password: string,
  siteId: string | null,
): Employee {
  return {
    staffId,
    nik: `3171${String(Math.floor(100000000 + Math.random() * 899999999))}`,
    name, email, password,
    phone: `+62 812-${String(Math.floor(1000 + Math.random() * 8999))}-${String(Math.floor(1000 + Math.random() * 8999))}`,
    address: "Jakarta",
    emergencyName: "Keluarga",
    emergencyPhone: "+62 811-0000-0000",
    department: "Gudang", position, role, shiftId,
    status: "active",
    salary: { ...SEED_SALARY[role] },
    siteId,
    photo: null, descriptor: null, hash: null,
    deviceId: null, deviceBoundAt: null,
    createdAt: Date.now() - 60 * 86400_000,
  };
}

export function seedEmployees(): Employee[] {
  return [
    mkEmp("SU-001", "Wahyu Handoko", "Super Admin", "superadmin", "sh-fleks", "wh.leader.vt@gmail.com", "super123", null),
    mkEmp("HR-001", "Maya Kirana", "HR Manager", "companyadmin", "sh-fleks", `hr@${EMAIL_DOMAIN}`, "admin123", null),
    mkEmp("MGR-001", "Budi Hartono", "Manajer Operasional", "manager", "sh-pagi", `budi.hartono@${EMAIL_DOMAIN}`, "123456", "site-vit"),
    mkEmp("VTR-001", "Andi Saputra", "Operator Forklift", "employee", "sh-pagi", `andi.saputra@${EMAIL_DOMAIN}`, "123456", "site-vit"),
    mkEmp("VTR-002", "Rina Marlina", "Admin Gudang", "employee", "sh-pagi", `rina.marlina@${EMAIL_DOMAIN}`, "123456", "site-vit"),
    mkEmp("VTR-003", "Joko Prasetyo", "Driver", "employee", "sh-siang", `joko.prasetyo@${EMAIL_DOMAIN}`, "123456", "site-bc"),
    mkEmp("VTR-004", "Sari Wulandari", "Inspector", "employee", "sh-pagi", `sari.wulandari@${EMAIL_DOMAIN}`, "123456", "site-bc"),
    mkEmp("VTR-005", "Dedi Kurniawan", "Picker", "employee", "sh-malam", `dedi.kurniawan@${EMAIL_DOMAIN}`, "123456", "site-vit"),
  ];
}

function dayKeyOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function tsAt(day: string, hm: string): number {
  return new Date(`${day}T${hm}:00+07:00`).getTime();
}

export function seedLogs(sites: Site[]): AttendanceLog[] {
  const logs: AttendanceLog[] = [];
  const roster: Array<{ id: string; name: string; site: string }> = [
    { id: "MGR-001", name: "Budi Hartono", site: "site-vit" },
    { id: "VTR-001", name: "Andi Saputra", site: "site-vit" },
    { id: "VTR-002", name: "Rina Marlina", site: "site-vit" },
    { id: "VTR-003", name: "Joko Prasetyo", site: "site-bc" },
    { id: "VTR-004", name: "Sari Wulandari", site: "site-bc" },
    { id: "VTR-005", name: "Dedi Kurniawan", site: "site-vit" },
  ];
  const siteById = new Map(sites.map((s) => [s.id, s]));
  for (let d = 6; d >= 0; d--) {
    const day = dayKeyOffset(d);
    roster.forEach((s, si) => {
      const st = siteById.get(s.site);
      if (!st) return;
      const dist = 18 + ((si * 13 + d * 7) % 70);
      const late = (si + d) % 5 === 0;
      const inHm = late ? `08:${String(22 + ((si * 3) % 20)).padStart(2, "0")}` : `07:${String(45 + ((si * 4) % 14)).padStart(2, "0")}`;
      const outHm = `16:${String(5 + ((si * 6) % 30)).padStart(2, "0")}`;
      logs.push({
        id: uid("log"), ts: tsAt(day, inHm), staffId: s.id, name: s.name, department: "Gudang",
        siteId: st.id,
        type: "IN", lat: st.hqLat + (si % 3) * 0.00012, lon: st.hqLon + (si % 2) * 0.0001,
        distanceM: dist, faceDist: Math.round((0.28 + (si % 4) * 0.04) * 1000) / 1000,
        method: "face", source: "gps", status: "VERIFIED", reason: null,
        lateMin: late ? 10 + ((si * 5) % 25) : undefined,
      });
      logs.push({
        id: uid("log"), ts: tsAt(day, outHm), staffId: s.id, name: s.name, department: "Gudang",
        siteId: st.id,
        type: "OUT", lat: st.hqLat + (si % 3) * 0.00012, lon: st.hqLon + (si % 2) * 0.0001,
        distanceM: dist + 4, faceDist: Math.round((0.3 + (si % 4) * 0.035) * 1000) / 1000,
        method: "face", source: "gps", status: "VERIFIED", reason: null,
        workMin: 450 + ((si * 17) % 60),
        overtimeMin: si % 3 === 0 ? 15 + si * 6 : undefined,
      });
    });
    // one rejected geofence attempt for the anomaly widget
    if (d % 2 === 0) {
      const st = siteById.get("site-vit");
      if (st) {
        logs.push({
          id: uid("log"), ts: tsAt(day, "08:41"), staffId: "VTR-005", name: "Dedi Kurniawan", department: "Gudang",
          siteId: st.id,
          type: "IN", lat: st.hqLat + 0.004, lon: st.hqLon + 0.003,
          distanceM: st.radiusM + 320, faceDist: 0.31,
          method: "face", source: "gps", status: "REJECTED",
          reason: `Di luar radius (${st.radiusM + 320} m)`,
        });
      }
    }
  }
  return logs.sort((a, b) => b.ts - a.ts);
}

export function seedLeaves(): LeaveRequest[] {
  const today = dayKeyOffset(0);
  const d = new Date();
  d.setDate(d.getDate() + 6);
  const future = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return [
    {
      id: uid("lv"), staffId: "VTR-001", name: "Andi Saputra", type: "Tahunan", date: future, days: 2,
      reason: "Acara keluarga di Bandung", attachment: null, status: "pending",
      managerDecision: null, hrDecision: null, createdAt: Date.now() - 5 * 3600_000,
    },
    {
      id: uid("lv"), staffId: "VTR-004", name: "Sari Wulandari", type: "Sakit", date: today, days: 1,
      reason: "Demam, surat dokter terlampir", attachment: null, status: "pending",
      managerDecision: null, hrDecision: null, createdAt: Date.now() - 2 * 3600_000,
    },
    {
      id: uid("lv"), staffId: "VTR-005", name: "Dedi Kurniawan", type: "Darurat", date: today, days: 1,
      reason: "Urusan keluarga mendesak", attachment: null, status: "pending_hr",
      managerDecision: { by: "Budi Hartono", at: Date.now() - 3600_000 }, hrDecision: null,
      createdAt: Date.now() - 8 * 3600_000,
    },
    {
      id: uid("lv"), staffId: "VTR-002", name: "Rina Marlina", type: "Tahunan", date: dayKeyOffset(-12), days: 1,
      reason: "Perpanjang SIM", attachment: null, status: "approved",
      managerDecision: { by: "Budi Hartono", at: Date.now() - 13 * 86400_000 },
      hrDecision: { by: "Maya Kirana", at: Date.now() - 13 * 86400_000 + 7200_000 },
      createdAt: Date.now() - 14 * 86400_000,
    },
  ];
}

export function seedAudit(): AuditLog[] {
  return [
    { id: uid("aud"), ts: Date.now() - 30 * 60000, actorId: "system", actorName: "Sistem", role: "system", action: "SEED_DATA", target: "tenant", detail: "Data demo dimuat (karyawan, shift, absen 7 hari)" },
    { id: uid("aud"), ts: Date.now() - 25 * 60000, actorId: "HR-001", actorName: "Maya Kirana", role: "companyadmin", action: "AUTH_LOGIN", target: "HR-001", detail: "Login berhasil · JWT diterbitkan (8 jam)" },
    { id: uid("aud"), ts: Date.now() - 20 * 60000, actorId: "HR-001", actorName: "Maya Kirana", role: "companyadmin", action: "GEOFENCE_UPDATE", target: "comp-01", detail: "Radius → 100 m" },
    { id: uid("aud"), ts: Date.now() - 9 * 3600_000, actorId: "MGR-001", actorName: "Budi Hartono", role: "manager", action: "LEAVE_APPROVE_MGR", target: "VTR-005", detail: "Darurat 1 hari → pending_hr" },
  ];
}

export function seedNotifs(): Notif[] {
  return [
    { id: uid("ntf"), staffId: "HR-001", title: "Persetujuan menunggu", body: "1 pengajuan cuti tahap HR menunggu keputusan Anda.", tone: "warn", ts: Date.now() - 3 * 3600_000, read: false },
    { id: uid("ntf"), staffId: "MGR-001", title: "Persetujuan menunggu", body: "Andi Saputra mengajukan cuti 2 hari.", tone: "info", ts: Date.now() - 5 * 3600_000, read: false },
  ];
}

/* ------------------------- organization chart ---------------------------- */
export interface OrgNode {
  id: string;
  parentId: string | null;
  siteId: string; // each Gudang owns its own structure
  title: string;
  staffId: string | null;
  name: string | null;
  note: string | null;
  createdAt: number;
}

export function seedOrgNodes(): OrgNode[] {
  const t = Date.now() - 30 * 86400_000;
  return [
    /* Gudang Vittoria */
    { id: "org-vit-root", parentId: null, siteId: "site-vit", title: "Manajer Operasional", staffId: "MGR-001", name: null, note: "Pimpinan gudang & armada", createdAt: t },
    { id: "org-vit-adm", parentId: "org-vit-root", siteId: "site-vit", title: "Admin Gudang", staffId: "VTR-002", name: null, note: null, createdAt: t + 1 },
    { id: "org-vit-frk", parentId: "org-vit-root", siteId: "site-vit", title: "Operator Forklift", staffId: "VTR-001", name: null, note: "Shift pagi", createdAt: t + 2 },
    { id: "org-vit-pck", parentId: "org-vit-root", siteId: "site-vit", title: "Picker", staffId: "VTR-005", name: null, note: "Shift malam", createdAt: t + 3 },
    /* Gudang Batu Ceper */
    { id: "org-bc-root", parentId: null, siteId: "site-bc", title: "Kepala Gudang", staffId: null, name: "Hasan Basri", note: "Pimpinan gudang Batu Ceper", createdAt: t + 4 },
    { id: "org-bc-drv", parentId: "org-bc-root", siteId: "site-bc", title: "Driver", staffId: "VTR-003", name: null, note: null, createdAt: t + 5 },
    { id: "org-bc-qc", parentId: "org-bc-root", siteId: "site-bc", title: "Inspector", staffId: "VTR-004", name: null, note: null, createdAt: t + 6 },
  ];
}

/* ------------------------- tenant identity codec ------------------------- */
export interface TenantIdentity {
  appName: string;
  appTagline: string;
  logo: string | null;
  brand: string;
  name: string;
  shortName: string;
  announcement: Announcement | null;
  maintenance: boolean;
}

export function encodeIdentity(c: Company): string {
  const payload: TenantIdentity = {
    appName: c.appName, appTagline: c.appTagline, logo: c.logo, brand: c.brand,
    name: c.name, shortName: c.shortName, announcement: c.announcement, maintenance: c.maintenance,
  };
  return "vt1." + btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/=+$/, "");
}

export function decodeIdentity(code: string): TenantIdentity | null {
  try {
    const raw = code.trim().startsWith("vt1.") ? code.trim().slice(4) : code.trim();
    const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
    const obj = JSON.parse(decodeURIComponent(escape(atob(padded))));
    if (typeof obj?.appName !== "string") return null;
    return obj as TenantIdentity;
  } catch {
    return null;
  }
}

/* --------------------------- calendar helpers ---------------------------- */
export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", month: "long", year: "numeric" })
    .format(new Date(y, m - 1, 1));
}

export function expectedWorkdays(month: string, holidays?: Holiday[]): number {
  const hols = new Set((holidays ?? []).map((h) => h.date));
  return monthDays(month).filter((day) => {
    const dow = new Date(`${day}T12:00:00+07:00`).getDay();
    return dow !== 0 && dow !== 6 && !hols.has(day);
  }).length;
}

export interface DaySummary {
  inTs: number | null;
  outTs: number | null;
  breakMin: number;
  workMin: number;
  lateMin: number;
  overtimeMin: number;
  otMin: number;
  kind: "work" | "late" | "leave" | "absent" | "holiday" | "none";
}

export function daySummary(
  staffId: string, day: string,
  logs: AttendanceLog[], breaks: BreakRec[], leaves: LeaveRequest[],
  shifts: Shift[], shiftId: string, holidays?: Holiday[],
): DaySummary {
  const dayLogs = logs.filter((l) => l.staffId === staffId && wibDayKey(new Date(l.ts)) === day && l.status === "VERIFIED");
  const inTs = dayLogs.find((l) => l.type === "IN")?.ts ?? null;
  const outTs = [...dayLogs].reverse().find((l) => l.type === "OUT" && (!inTs || l.ts >= inTs))?.ts ?? null;
  const lateMin = dayLogs.filter((l) => l.type === "IN").reduce((a, l) => a + (l.lateMin ?? 0), 0);
  const overtimeMin = dayLogs.reduce((a, l) => a + (l.overtimeMin ?? 0), 0);
  const breakMin = Math.round(
    breaks.filter((b) => b.staffId === staffId && b.day === day && b.end).reduce((a, b) => a + (b.end! - b.start), 0) / 60000,
  );
  let workMin = 0;
  if (inTs && outTs) workMin = Math.max(0, Math.round((outTs - inTs) / 60000 - breakMin));
  else if (inTs && !outTs) workMin = Math.max(0, Math.round((Date.now() - inTs) / 60000 - breakMin));

  const onLeave = leaves.some((l) => l.staffId === staffId && l.status === "approved" && l.date <= day && day <= addDays(l.date, l.days - 1));
  const isHoliday = holidays?.some((h) => h.date === day) ?? false;
  const kind: DaySummary["kind"] = inTs
    ? (lateMin > 0 ? "late" : "work")
    : onLeave ? "leave" : isHoliday ? "holiday" : "none";
  return { inTs, outTs, breakMin, workMin, lateMin, overtimeMin, otMin: overtimeMin, kind };
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00+07:00`);
  d.setDate(d.getDate() + n);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function leaveUsed(leaves: LeaveRequest[], staffId: string, year: number, type: LeaveType): number {
  return leaves
    .filter((l) => l.staffId === staffId && l.type === type && l.status !== "rejected" && l.date.startsWith(String(year)))
    .reduce((a, l) => a + l.days, 0);
}

/* ------------------------------ payroll ---------------------------------- */
const PER_MINUTE = (basic: number) => basic / 25 / 8 / 60;

export function computeSlip(
  emp: Employee, month: string,
  logs: AttendanceLog[], breaks: BreakRec[], leaves: LeaveRequest[],
  shifts: Shift[], company: Company, bonus = 0, note = "",
): Payslip {
  const s = emp.salary;
  const workdays = expectedWorkdays(month, company.holidays);
  const days = monthDays(month);
  let hadir = 0, cuti = 0, libur = 0, terlambat = 0, totalLateMin = 0, lemburMin = 0;
  for (const day of days) {
    const sum = daySummary(emp.staffId, day, logs, breaks, leaves, shifts, emp.shiftId, company.holidays);
    if (sum.inTs) {
      hadir++;
      if (sum.lateMin > 0) { terlambat++; totalLateMin += sum.lateMin; }
      lemburMin += sum.overtimeMin;
    } else if (sum.kind === "leave") cuti++;
    else if (sum.kind === "holiday") libur++;
  }
  const hadirDihitung = Math.min(workdays, hadir + cuti);
  const gajiPokok = Math.round((s.basic * hadirDihitung) / Math.max(1, workdays));
  const transport = s.transport * hadir;
  const meal = s.meal * hadir;
  const lembur = Math.round((lemburMin / 60) * s.otPerHour);
  const absenHari = Math.max(0, workdays - hadir - cuti - libur);
  const potongTelat = Math.round(totalLateMin * PER_MINUTE(s.basic));
  const potongAbsen = Math.round(absenHari * (s.basic / Math.max(1, workdays)));
  const bruto = gajiPokok + transport + meal + lembur + bonus;
  const potongan = potongTelat + potongAbsen;
  return {
    id: uid("slip"), month, staffId: emp.staffId, name: emp.name,
    department: emp.department, position: emp.position,
    kerjaHari: workdays, hadir, cuti, libur, terlambat, totalLateMin, lemburMin,
    gajiPokok, transport, meal, lembur, bonus,
    potongTelat, potongAbsen, bruto, potongan,
    net: Math.max(0, bruto - potongan),
    note, status: "draft", issuedAt: null, issuedBy: null, createdAt: Date.now(),
  };
}

/* -------------------------------- export --------------------------------- */
export function buildCsv(logs: AttendanceLog[]): string {
  const head = "Waktu;StaffID;Nama;Departemen;Tipe;Status;Lat;Lon;JarakM;FaceDelta;Metode;Alasan";
  const body = logs.map((l) =>
    [
      new Date(l.ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
      l.staffId, l.name, l.department, l.type, l.status,
      l.lat.toFixed(6), l.lon.toFixed(6), String(l.distanceM),
      l.faceDist?.toFixed(3) ?? "", l.method, l.reason ?? "",
    ].join(";"),
  );
  return "\uFEFF" + [head, ...body].join("\n");
}

export function downloadTextFile(name: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
