/**
 * Data layer — schema, persistence (localStorage stand-in for SQLite),
 * seeds, migrations, payroll engine, brand presets and tenant identity
 * codecs. Web equivalent of database.py.
 */
import { GeoPoint } from "./geoUtils";
import { uid } from "./format";

/* ------------------------------- schema -------------------------------- */
export type Role = "superadmin" | "companyadmin" | "manager" | "employee";
export type EmpStatus = "active" | "inactive" | "resigned";

export interface SalaryStructure {
  basic: number;      // gaji pokok / bulan
  transport: number;  // tunjangan transport / hari hadir
  meal: number;       // uang makan / hari hadir
  otPerHour: number;  // upah lembur / jam
}

export interface Employee {
  staffId: string;
  nik: string;
  name: string;
  email: string;
  password: string; // plaintext demo — hash server-side in production
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
  photo: string | null;          // signature photo (baseline)
  descriptor: number[] | null;   // 128-D face encoding
  hash: string | null;           // dHash lite signature
  createdAt: number;
  deviceId?: string | null;      // bound device fingerprint (anti-fraud)
  deviceBoundAt?: number | null;
}

export type AttendanceType = "IN" | "OUT";
export interface AttendanceLog {
  id: string;
  ts: number;
  staffId: string;
  name: string;
  department: string;
  type: AttendanceType;
  lat: number;
  lon: number;
  distanceM: number;
  faceDist: number | null;
  method: "face" | "manual";
  source: "gps" | "sim";
  status: "VERIFIED" | "REJECTED";
  reason: string | null;
  lateMin?: number;
  overtimeMin?: number;
  workMin?: number;
  photo?: string | null; // verification snapshot thumbnail (evidence)
}

export interface BreakRec {
  id: string;
  staffId: string;
  day: string;  // yyyy-mm-dd
  start: number;
  end: number | null;
}

export type LeaveType = "Tahunan" | "Sakit" | "Darurat" | "Melahirkan";
export type LeaveStatus = "pending" | "pending_hr" | "approved" | "rejected";
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

export interface Payslip {
  id: string;
  staffId: string;
  name: string;
  month: string; // yyyy-mm
  expectedDays: number;
  presentDays: number;
  approvedLeaveDays: number;
  absentDays: number;
  lateMin: number;
  otMin: number;
  workMin: number;
  breakMin: number;
  basic: number;
  transport: number;
  meal: number;
  overtime: number;
  bonus: number;
  lateDeduct: number;
  absentDeduct: number;
  gross: number;
  net: number;
  note: string;
  status: "draft" | "issued";
  issuedAt?: number;
  issuedBy?: string;
}

export interface Shift {
  id: string;
  name: string;
  start: string; // HH:mm
  end: string;   // HH:mm
  graceMin: number;
  color: string; // pastel key
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

export interface Holiday { date: string; name: string; }
export interface Announcement { text: string; tone: "info" | "warn" | "danger"; }

export interface Company {
  id: string;
  name: string;
  shortName: string;
  address: string;
  hqLat: number;
  hqLon: number;
  radiusM: number;
  deviceBinding: boolean;
  holidays: Holiday[];
  appName: string;
  appTagline: string;
  logo: string | null;
  brand: string;
  announcement: Announcement | null;
  maintenance: boolean;
}

export interface BrandPreset {
  id: string;
  name: string;
  swatch: string;
  vars: Record<string, string>;
}

export interface Settings {
  simEnabled: boolean;
  simLat: number;
  simLon: number;
  matchThreshold: number;
}

export interface DaySummary {
  inTs: number | null;
  outTs: number | null;
  breakMin: number;
  workMin: number;
  lateMin: number;
  overtimeMin: number;
  kind: "work" | "leave" | "holiday" | "none";
}

/* ------------------------------ constants ------------------------------ */
export const DEFAULT_HQ: GeoPoint = { lat: -6.1754, lon: 106.8272 };
export const EMAIL_DOMAIN = "vittoria.co.id";
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const DEPARTMENTS = ["Gudang", "Logistik", "Operasional", "QC", "Keuangan"];

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Super Admin",
  companyadmin: "Admin HR",
  manager: "Manajer",
  employee: "Karyawan",
};

export const STATUS_LABEL: Record<EmpStatus, string> = {
  active: "Aktif", inactive: "Nonaktif", resigned: "Resign",
};

export const LEAVE_TYPES: LeaveType[] = ["Tahunan", "Sakit", "Darurat", "Melahirkan"];
export const LEAVE_QUOTAS: Record<LeaveType, number> = {
  Tahunan: 12, Sakit: 10, Darurat: 3, Melahirkan: 90,
};

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

/* ----------------------------- persistence ----------------------------- */
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
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
  } catch {
    /* storage full / unavailable — keep running in-memory */
  }
}

export function clearAll() {
  ["employees", "logs", "settings", "seeded", "company", "shifts", "leaves", "breaks", "audit", "notifs", "session", "payslips"].forEach((k) =>
    localStorage.removeItem(NS + k),
  );
}

/** Schema versioning — wipe & reseed when the model changes between releases. */
export const DATA_VERSION = "6";
export function ensureFreshVersion() {
  try {
    if (localStorage.getItem(NS + "dataversion") !== DATA_VERSION) {
      clearAll();
      localStorage.setItem(NS + "dataversion", DATA_VERSION);
    }
  } catch {
    /* storage unavailable — run in-memory */
  }
}

/* ------------------------------ migrations ------------------------------ */
const ROLE_MIGRATION: Record<string, Role> = {
  admin: "companyadmin",
  staff: "employee",
  hr: "companyadmin",
};
const SHIFT_MIGRATION: Record<string, string> = {
  pagi: "sh-pagi", siang: "sh-siang", malam: "sh-malam", fleksibel: "sh-fleks",
};

function migrateEmployee(e: Partial<Employee> & Record<string, unknown>): Employee {
  const role = (ROLE_MIGRATION[String(e.role ?? "")] ?? e.role ?? "employee") as Role;
  const shiftId = SHIFT_MIGRATION[String(e.shiftId ?? "")] ?? e.shiftId ?? "sh-pagi";
  return {
    staffId: String(e.staffId ?? "VTR-000"),
    nik: String(e.nik ?? "—"),
    name: String(e.name ?? "Karyawan"),
    email: String(e.email ?? slugEmail(String(e.name ?? "staff"), [])),
    password: String(e.password ?? "123456"),
    phone: String(e.phone ?? "—"),
    address: String(e.address ?? "—"),
    emergencyName: String(e.emergencyName ?? "—"),
    emergencyPhone: String(e.emergencyPhone ?? "—"),
    department: String(e.department ?? "Gudang"),
    position: String(e.position ?? "Staff"),
    role,
    shiftId,
    status: (e.status as EmpStatus) ?? "active",
    salary: (e.salary as SalaryStructure) ?? SEED_SALARY[role],
    photo: (e.photo as string | null) ?? null,
    descriptor: (e.descriptor as number[] | null) ?? null,
    hash: (e.hash as string | null) ?? null,
    createdAt: Number(e.createdAt ?? Date.now()),
    deviceId: (e.deviceId as string | null) ?? null,
    deviceBoundAt: (e.deviceBoundAt as number | null) ?? null,
  };
}

export const db = {
  loadEmployees: () => load<Record<string, unknown>[]>( "employees", []).map(migrateEmployee),
  saveEmployees: (v: Employee[]) => save("employees", v),
  loadLogs: () => load<AttendanceLog[]>("logs", []),
  saveLogs: (v: AttendanceLog[]) => save("logs", v),
  loadBreaks: () => load<BreakRec[]>("breaks", []),
  saveBreaks: (v: BreakRec[]) => save("breaks", v),
  loadLeaves: () => load<LeaveRequest[]>("leaves", []),
  saveLeaves: (v: LeaveRequest[]) => save("leaves", v),
  loadPayslips: () => load<Payslip[]>("payslips", []),
  savePayslips: (v: Payslip[]) => save("payslips", v),
  loadShifts: () => load<Shift[]>("shifts", []),
  saveShifts: (v: Shift[]) => save("shifts", v),
  loadAudit: () => load<AuditLog[]>("audit", []),
  saveAudit: (v: AuditLog[]) => save("audit", v.slice(0, 400)),
  loadNotifs: () => load<Notif[]>("notifs", []),
  saveNotifs: (v: Notif[]) => save("notifs", v.slice(0, 120)),
  loadSettings: () => ({ ...DEFAULT_SETTINGS, ...load<Partial<Settings>>("settings", {}) }),
  saveSettings: (v: Settings) => save("settings", v),
  loadCompany: () => ({ ...seedCompany(), ...load<Partial<Company>>("company", {}) }),
  saveCompany: (v: Company) => save("company", v),
  loadSession: () => load<{ staffId: string; access: string; refresh: string; accessExp: number; refreshExp: number } | null>("session", null),
  saveSession: (v: unknown) => save("session", v),
  wasSeeded: () => load<boolean>("seeded", false),
  markSeeded: () => save("seeded", true),
};

export const DEFAULT_SETTINGS: Settings = {
  simEnabled: true,
  simLat: -6.17555,
  simLon: 106.82735,
  matchThreshold: 0.5,
};

/* -------------------------------- seeds -------------------------------- */
const SEED_SALARY: Record<Role, SalaryStructure> = {
  employee: { basic: 5_200_000, transport: 20_000, meal: 15_000, otPerHour: 30_000 },
  manager: { basic: 8_500_000, transport: 25_000, meal: 20_000, otPerHour: 45_000 },
  companyadmin: { basic: 9_500_000, transport: 25_000, meal: 20_000, otPerHour: 50_000 },
  superadmin: { basic: 12_000_000, transport: 30_000, meal: 25_000, otPerHour: 60_000 },
};

export function genPassword(): string {
  return `vtr-${Math.floor(1000 + Math.random() * 9000)}`;
}

/** "Rina Marlina" → "rina.marlina@vittoria.co.id" (de-duplicated). */
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

export function seedCompany(): Company {
  return {
    id: "comp-01",
    name: "PT Vittoria Logistik Indonesia",
    shortName: "Vittoria",
    address: "Jl. Gatot Subroto Kav. 21, Jakarta Pusat",
    hqLat: DEFAULT_HQ.lat,
    hqLon: DEFAULT_HQ.lon,
    radiusM: 100,
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

function mkEmp(
  staffId: string, name: string, department: string, position: string,
  role: Role, shiftId: string, email: string, password: string,
): Employee {
  return {
    staffId, nik: `3171${String(Math.floor(100000000 + Math.random() * 899999999))}`,
    name, email, password,
    phone: "+62 812-3456-78" + staffId.slice(-2),
    address: "Jakarta",
    emergencyName: "Keluarga", emergencyPhone: "+62 811-0000-1111",
    department, position, role, shiftId, status: "active",
    salary: { ...SEED_SALARY[role] },
    photo: null, descriptor: null, hash: null,
    createdAt: Date.now() - (30 + Math.floor(Math.random() * 200)) * 86400_000,
    deviceId: null, deviceBoundAt: null,
  };
}

export function seedEmployees(): Employee[] {
  return [
    mkEmp("SU-001", "Wahyu Handoko", "Direksi", "Super Admin", "superadmin", "sh-fleks", "wh.leader.vt@gmail.com", "super123"),
    mkEmp("HR-001", "Maya Kirana", "HR", "HR Manager", "companyadmin", "sh-fleks", `hr@${EMAIL_DOMAIN}`, "admin123"),
    mkEmp("MGR-001", "Budi Hartono", "Operasional", "Manajer Operasional", "manager", "sh-pagi", `budi.hartono@${EMAIL_DOMAIN}`, "123456"),
    mkEmp("VTR-001", "Andi Saputra", "Gudang", "Operator Forklift", "employee", "sh-pagi", `andi.saputra@${EMAIL_DOMAIN}`, "123456"),
    mkEmp("VTR-002", "Rina Marlina", "Gudang", "Admin Gudang", "employee", "sh-pagi", `rina.marlina@${EMAIL_DOMAIN}`, "123456"),
    mkEmp("VTR-003", "Joko Prasetyo", "Logistik", "Driver", "employee", "sh-siang", `joko.prasetyo@${EMAIL_DOMAIN}`, "123456"),
    mkEmp("VTR-004", "Sari Wulandari", "QC", "Inspector", "employee", "sh-pagi", `sari.wulandari@${EMAIL_DOMAIN}`, "123456"),
    mkEmp("VTR-005", "Dedi Kurniawan", "Gudang", "Picker", "employee", "sh-malam", `dedi.kurniawan@${EMAIL_DOMAIN}`, "123456"),
  ];
}

export function seedShifts(): Shift[] {
  return [
    { id: "sh-pagi", name: "Pagi", start: "08:00", end: "16:00", graceMin: 15, color: "sun" },
    { id: "sh-siang", name: "Siang", start: "12:00", end: "20:00", graceMin: 15, color: "sky" },
    { id: "sh-malam", name: "Malam", start: "20:00", end: "04:00", graceMin: 20, color: "grape" },
    { id: "sh-fleks", name: "Fleksibel", start: "08:00", end: "17:00", graceMin: 60, color: "teal" },
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

/** 7 days of plausible history for the seeded roster. */
export function seedLogs(hq: GeoPoint, radiusM: number): AttendanceLog[] {
  const staff = seedEmployees().filter((e) => e.role === "employee" || e.role === "manager");
  const shifts = seedShifts();
  const out: AttendanceLog[] = [];
  for (let d = 7; d >= 1; d--) {
    const day = dayKeyOffset(d);
    const dow = new Date(`${day}T12:00:00+07:00`).getDay();
    if (dow === 0) continue; // Minggu libur
    for (const e of staff) {
      const sh = shifts.find((s) => s.id === e.shiftId) ?? shifts[0];
      if (d === 3 && e.staffId === "VTR-003") continue; // absen
      const late = d === 2 && e.staffId === "VTR-001" ? 24 : Math.random() < 0.12 ? Math.floor(Math.random() * 18) + 1 : 0;
      const jitter = () => (Math.random() - 0.5) * 0.0004;
      const [ih, im] = sh.start.split(":").map(Number);
      const inMin = ih * 60 + im + late;
      const inHm = `${String(Math.floor(inMin / 60) % 24).padStart(2, "0")}:${String(inMin % 60).padStart(2, "0")}`;
      const outHm = sh.end === "04:00" && sh.start > sh.end ? "04:05" : sh.end;
      const distIn = Math.round(Math.random() * radiusM * 0.7);
      const distOut = Math.round(Math.random() * radiusM * 0.8);
      out.push({
        id: uid("log"), ts: tsAt(day, inHm), staffId: e.staffId, name: e.name, department: e.department,
        type: "IN", lat: hq.lat + jitter(), lon: hq.lon + jitter(), distanceM: distIn,
        faceDist: Math.round(Math.random() * 35) / 100, method: "face", source: "gps",
        status: "VERIFIED", reason: null, lateMin: late > sh.graceMin ? late - sh.graceMin : undefined,
      });
      out.push({
        id: uid("log"), ts: tsAt(day, outHm) + (sh.start > sh.end ? 86400_000 : 0), staffId: e.staffId, name: e.name, department: e.department,
        type: "OUT", lat: hq.lat + jitter(), lon: hq.lon + jitter(), distanceM: distOut,
        faceDist: Math.round(Math.random() * 35) / 100, method: "face", source: "gps",
        status: "VERIFIED", reason: null, workMin: 480 - 30 + (late > sh.graceMin ? -(late - sh.graceMin) : 0),
      });
    }
    // satu penolakan geofence biar audit hidup
    if (d === 4) {
      const e = staff[1];
      out.push({
        id: uid("log"), ts: tsAt(day, "08:12"), staffId: e.staffId, name: e.name, department: e.department,
        type: "IN", lat: hq.lat + 0.0042, lon: hq.lon - 0.0031, distanceM: 517,
        faceDist: 0.21, method: "face", source: "gps", status: "REJECTED",
        reason: "Di luar radius (517 m)",
      });
    }
  }
  return out.sort((a, b) => b.ts - a.ts);
}

export function seedLeaves(): LeaveRequest[] {
  const now = Date.now();
  const today = dayKeyOffset(0);
  const future = dayKeyOffset(-4);
  return [
    {
      id: uid("lv"), staffId: "VTR-001", name: "Andi Saputra", type: "Tahunan", date: future, days: 2,
      reason: "Acara keluarga di Bandung", attachment: null, status: "pending",
      managerDecision: null, hrDecision: null, createdAt: now - 5 * 3600_000,
    },
    {
      id: uid("lv"), staffId: "VTR-004", name: "Sari Wulandari", type: "Sakit", date: today, days: 1,
      reason: "Demam, surat dokter terlampir",
      attachment: { name: "surat-dokter.pdf", dataUrl: "" },
      status: "pending_hr",
      managerDecision: { by: "Budi Hartono", at: now - 26 * 3600_000 }, hrDecision: null,
      createdAt: now - 30 * 3600_000,
    },
    {
      id: uid("lv"), staffId: "VTR-002", name: "Rina Marlina", type: "Tahunan", date: dayKeyOffset(-12), days: 1,
      reason: "Perpanjang SIM", attachment: null, status: "approved",
      managerDecision: { by: "Budi Hartono", at: now - 20 * 86400_000 }, hrDecision: { by: "Maya Kirana", at: now - 19 * 86400_000 },
      createdAt: now - 21 * 86400_000,
    },
  ];
}

export function seedAudit(): AuditLog[] {
  const now = Date.now();
  return [
    { id: uid("aud"), ts: now - 3600_000, actorId: "HR-001", actorName: "Maya Kirana", role: "companyadmin", action: "GEOFENCE_UPDATE", target: "comp-01", detail: "Radius → 100 m" },
    { id: uid("aud"), ts: now - 5 * 3600_000, actorId: "VTR-001", actorName: "Andi Saputra", role: "employee", action: "LEAVE_REQUEST", target: "VTR-001", detail: "Tahunan · 2 hari" },
    { id: uid("aud"), ts: now - 8 * 3600_000, actorId: "SU-001", actorName: "Wahyu Handoko", role: "superadmin", action: "AUTH_LOGIN", target: "SU-001", detail: "Login berhasil · JWT diterbitkan (8 jam)" },
  ];
}

export function seedNotifs(): Notif[] {
  return [
    { id: uid("ntf"), staffId: "HR-001", title: "Persetujuan menunggu", body: "1 pengajuan cuti tahap HR menunggu keputusan Anda.", tone: "warn", ts: Date.now() - 3 * 3600_000, read: false },
    { id: uid("ntf"), staffId: "MGR-001", title: "Persetujuan menunggu", body: "Andi Saputra mengajukan cuti 2 hari.", tone: "info", ts: Date.now() - 5 * 3600_000, read: false },
  ];
}

/* --------------------------- payroll helpers ---------------------------- */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= n; d++) out.push(`${month}-${String(d).padStart(2, "0")}`);
  return out;
}

export function leaveUsed(leaves: LeaveRequest[], staffId: string, year: number, type: LeaveType): number {
  return leaves
    .filter((l) => l.staffId === staffId && l.type === type && l.status === "approved" && l.date.startsWith(String(year)))
    .reduce((a, l) => a + l.days, 0);
}

/** Roll a day up into attendance facts (holiday & leave aware). */
export function daySummary(
  staffId: string, day: string,
  logs: AttendanceLog[], breaks: BreakRec[], leaves: LeaveRequest[],
  shifts: Shift[], shiftId?: string, holidays?: Holiday[],
): DaySummary {
  const dayLogs = logs.filter((l) => l.staffId === staffId && l.status === "VERIFIED" && wibDayKeyOf(l.ts) === day);
  const inLog = [...dayLogs].reverse().find((l) => l.type === "IN");
  const outLog = [...dayLogs].reverse().find((l) => l.type === "OUT" && (!inLog || l.ts >= inLog.ts));
  const dayBreaks = breaks.filter((b) => b.staffId === staffId && b.day === day);
  const breakMin = Math.round(dayBreaks.reduce((a, b) => a + (b.end ? b.end - b.start : 0), 0) / 60000);
  const workMin = inLog && outLog ? Math.max(0, Math.round((outLog.ts - inLog.ts) / 60000) - breakMin) : 0;

  let lateMin = 0;
  const sh = shiftId ? shifts.find((s) => s.id === shiftId) : null;
  if (inLog && sh && sh.id !== "sh-fleks") {
    const start = Number(sh.start.slice(0, 2)) * 60 + Number(sh.start.slice(3));
    const inMin = wibMinutesOf(inLog.ts);
    if (inMin > start + sh.graceMin) lateMin = inMin - start - sh.graceMin;
  }
  let overtimeMin = 0;
  if (outLog && sh && sh.id !== "sh-fleks" && sh.end > sh.start) {
    const end = Number(sh.end.slice(0, 2)) * 60 + Number(sh.end.slice(3));
    overtimeMin = Math.max(0, wibMinutesOf(outLog.ts) - end);
  }

  const onLeave = leaves.some((l) => l.staffId === staffId && l.status === "approved" && l.date <= day && day <= addDays(l.date, l.days - 1));
  const isHoliday = holidays?.some((h) => h.date === day) ?? false;
  const kind: DaySummary["kind"] = inLog ? "work" : onLeave ? "leave" : isHoliday ? "holiday" : outLog ? "work" : "none";
  return { inTs: inLog?.ts ?? null, outTs: outLog?.ts ?? null, breakMin, workMin, lateMin, overtimeMin, kind };
}

function wibDayKeyOf(ts: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
}
function wibMinutesOf(ts: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ts));
  return (Number(parts.find((p) => p.type === "hour")?.value) % 24) * 60 + Number(parts.find((p) => p.type === "minute")?.value);
}
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00+07:00`);
  d.setDate(d.getDate() + n);
  return wibDayKeyOf(d.getTime());
}

/** Auto-compute a payslip from live attendance for a month. */
export function computeSlip(
  emp: Employee, month: string,
  logs: AttendanceLog[], breaks: BreakRec[], leaves: LeaveRequest[], holidays: Holiday[],
): Omit<Payslip, "id" | "status" | "note" | "issuedAt" | "issuedBy"> {
  const days = monthDays(month);
  const today = dayKeyOffset(0);
  const shifts = seedShifts();
  let presentDays = 0, approvedLeaveDays = 0, lateMin = 0, otMin = 0, workMin = 0, breakMin = 0;
  let expectedDays = 0;
  for (const day of days) {
    if (day > today) continue;
    const dow = new Date(`${day}T12:00:00+07:00`).getDay();
    const isHoliday = holidays.some((h) => h.date === day);
    if (dow === 0 || isHoliday) continue;
    expectedDays++;
    const s = daySummary(emp.staffId, day, logs, breaks, leaves, shifts, emp.shiftId, holidays);
    if (s.inTs) {
      presentDays++;
      lateMin += s.lateMin;
      otMin += s.overtimeMin;
      workMin += s.workMin;
      breakMin += s.breakMin;
    } else if (s.kind === "leave") {
      approvedLeaveDays++;
    }
  }
  const absentDays = Math.max(0, expectedDays - presentDays - approvedLeaveDays);
  const workedRatio = expectedDays ? Math.min(1, (presentDays + approvedLeaveDays) / expectedDays) : 0;
  const basic = Math.round(emp.salary.basic * workedRatio);
  const transport = emp.salary.transport * presentDays;
  const meal = emp.salary.meal * presentDays;
  const overtime = Math.round((otMin / 60) * emp.salary.otPerHour);
  const perMin = emp.salary.basic / (expectedDays || 22) / 480;
  const lateDeduct = Math.round(lateMin * perMin);
  const absentDeduct = Math.round(absentDays * (emp.salary.basic / (expectedDays || 22)));
  const gross = basic + transport + meal + overtime;
  const net = Math.max(0, gross - lateDeduct - absentDeduct);
  return {
    staffId: emp.staffId, name: emp.name, month,
    expectedDays, presentDays, approvedLeaveDays, absentDays,
    lateMin, otMin, workMin, breakMin,
    basic, transport, meal, overtime, bonus: 0,
    lateDeduct, absentDeduct, gross, net,
  };
}

/* ------------------------------ csv & files ----------------------------- */
export function buildCsv(logs: AttendanceLog[]): string {
  const head = ["Timestamp (WIB)", "Staff ID", "Nama", "Departemen", "Tipe", "Lat", "Lon", "Jarak (m)", "Face Δ", "Metode", "Sumber", "Status", "Keterangan"];
  const rows = logs.map((l) => [
    new Date(l.ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
    l.staffId, l.name, l.department, l.type,
    l.lat.toFixed(5), l.lon.toFixed(5), String(l.distanceM),
    l.faceDist?.toFixed(3) ?? "-", l.method, l.source, l.status, l.reason ?? "",
  ]);
  return "\uFEFF" + [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* --------------------------- tenant identity ---------------------------- */
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

/** Encode branding into a compact transferable string (link/code import). */
export function encodeIdentity(c: Company): string {
  const payload: TenantIdentity = {
    appName: c.appName, appTagline: c.appTagline, logo: c.logo, brand: c.brand,
    name: c.name, shortName: c.shortName, announcement: c.announcement, maintenance: c.maintenance,
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/=+$/, "");
}

export function decodeIdentity(code: string): TenantIdentity | null {
  try {
    const padded = code + "=".repeat((4 - (code.length % 4)) % 4);
    const obj = JSON.parse(decodeURIComponent(escape(atob(padded))));
    if (typeof obj.appName !== "string") return null;
    return obj as TenantIdentity;
  } catch {
    return null;
  }
}
