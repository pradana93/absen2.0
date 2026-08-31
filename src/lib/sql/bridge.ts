/**
 * Bridge — maps the app's JSON collections onto relational tables.
 * Every write is transactional (DELETE + parameterized INSERTs), which is
 * what makes SQLite the durable engine while React state stays the fast
 * in-memory working set. In Fase 2 these specs map 1:1 onto Postgres.
 */
import { sqlAll, sqlReady, sqlRun } from "./engine";

type Kind = "t" | "i" | "r" | "j" | "b"; // text / int / real / json / bool
type Col = [prop: string, col: string, kind: Kind];

interface Spec { table: string; cols: Col[]; }

export const SPECS: Record<string, Spec> = {
  company: {
    table: "companies",
    cols: [
      ["id", "id", "t"], ["name", "name", "t"], ["shortName", "short_name", "t"], ["address", "address", "t"],
      ["appName", "app_name", "t"], ["appTagline", "app_tagline", "t"], ["logo", "logo", "t"], ["brand", "brand", "t"],
      ["maintenance", "maintenance", "b"], ["deviceBinding", "device_binding", "b"],
      ["announcement", "announcement", "j"], ["holidays", "holidays", "j"],
    ],
  },
  sites: {
    table: "sites",
    cols: [
      ["id", "id", "t"], ["name", "name", "t"], ["shortName", "short_name", "t"], ["address", "address", "t"],
      ["hqLat", "hq_lat", "r"], ["hqLon", "hq_lon", "r"], ["radiusM", "radius_m", "i"], ["color", "color", "t"],
    ],
  },
  employees: {
    table: "employees",
    cols: [
      ["staffId", "staff_id", "t"], ["nik", "nik", "t"], ["name", "name", "t"], ["email", "email", "t"],
      ["password", "password", "t"], ["phone", "phone", "t"], ["address", "address", "t"],
      ["emergencyName", "emergency_name", "t"], ["emergencyPhone", "emergency_phone", "t"],
      ["department", "department", "t"], ["position", "position", "t"], ["role", "role", "t"],
      ["shiftId", "shift_id", "t"], ["status", "status", "t"], ["salary", "salary", "j"], ["siteId", "site_id", "t"],
      ["photo", "photo", "t"], ["descriptor", "descriptor", "j"], ["hash", "hash", "t"],
      ["deviceId", "device_id", "t"], ["deviceBoundAt", "device_bound_at", "i"], ["createdAt", "created_at", "i"],
    ],
  },
  logs: {
    table: "attendance_logs",
    cols: [
      ["id", "id", "t"], ["ts", "ts", "i"], ["staffId", "staff_id", "t"], ["name", "name", "t"],
      ["department", "department", "t"], ["siteId", "site_id", "t"], ["type", "type", "t"],
      ["lat", "lat", "r"], ["lon", "lon", "r"], ["distanceM", "distance_m", "r"], ["faceDist", "face_dist", "r"],
      ["method", "method", "t"], ["source", "source", "t"], ["status", "status", "t"], ["reason", "reason", "t"],
      ["lateMin", "late_min", "i"], ["overtimeMin", "overtime_min", "i"], ["workMin", "work_min", "i"], ["photo", "photo", "t"],
    ],
  },
  leaves: {
    table: "leaves",
    cols: [
      ["id", "id", "t"], ["staffId", "staff_id", "t"], ["name", "name", "t"], ["type", "type", "t"],
      ["date", "date", "t"], ["days", "days", "i"], ["reason", "reason", "t"], ["attachment", "attachment", "j"],
      ["status", "status", "t"], ["managerDecision", "manager_decision", "j"], ["hrDecision", "hr_decision", "j"],
      ["createdAt", "created_at", "i"],
    ],
  },
  shifts: {
    table: "shifts",
    cols: [["id", "id", "t"], ["name", "name", "t"], ["start", "start", "t"], ["end", "end", "t"], ["graceMin", "grace_min", "i"], ["color", "color", "t"]],
  },
  org: {
    table: "org_nodes",
    cols: [
      ["id", "id", "t"], ["parentId", "parent_id", "t"], ["siteId", "site_id", "t"], ["title", "title", "t"],
      ["staffId", "staff_id", "t"], ["name", "name", "t"], ["note", "note", "t"], ["createdAt", "created_at", "i"],
    ],
  },
  board: {
    table: "board_posts",
    cols: [
      ["id", "id", "t"], ["siteId", "site_id", "t"], ["title", "title", "t"], ["body", "body", "t"],
      ["tone", "tone", "t"], ["createdBy", "created_by", "t"], ["createdAt", "created_at", "i"], ["acks", "acks", "j"],
    ],
  },
  departments: { table: "departments", cols: [["name", "name", "t"]] },
  quotas: { table: "leave_quotas", cols: [["type", "type", "t"], ["days", "days", "i"]] },
  salarydefaults: {
    table: "salary_defaults",
    cols: [["role", "role", "t"], ["basic", "basic", "i"], ["transport", "transport", "i"], ["meal", "meal", "i"], ["otPerHour", "ot_per_hour", "i"]],
  },
  audits: {
    table: "audit_logs",
    cols: [
      ["id", "id", "t"], ["ts", "ts", "i"], ["actorId", "actor_id", "t"], ["actorName", "actor_name", "t"],
      ["role", "role", "t"], ["action", "action", "t"], ["target", "target", "t"], ["detail", "detail", "t"],
    ],
  },
  notifs: {
    table: "notifications",
    cols: [["id", "id", "t"], ["staffId", "staff_id", "t"], ["title", "title", "t"], ["body", "body", "t"], ["tone", "tone", "t"], ["ts", "ts", "i"], ["read", "read", "b"]],
  },
  breaks: {
    table: "breaks",
    cols: [["id", "id", "t"], ["staffId", "staff_id", "t"], ["day", "day", "t"], ["start", "start", "i"], ["end", "end", "i"]],
  },
  resets: {
    table: "resets",
    cols: [["token", "token", "t"], ["staffId", "staff_id", "t"], ["email", "email", "t"], ["exp", "exp", "i"], ["used", "used", "b"]],
  },
};

function toDbValue(v: unknown, kind: Kind): unknown {
  if (v === null || v === undefined) return null;
  if (kind === "j") return JSON.stringify(v);
  if (kind === "b") return v ? 1 : 0;
  return v;
}
function fromDbValue(v: unknown, kind: Kind): unknown {
  if (v === null || v === undefined) return null;
  if (kind === "j") { try { return JSON.parse(String(v)); } catch { return null; } }
  if (kind === "b") return Number(v) === 1;
  return v;
}

/** Transactional replace of a whole collection. */
export function syncCollection(key: string, rows: Record<string, unknown>[]): void {
  const spec = SPECS[key];
  if (!spec || !sqlReady()) return;
  try {
    sqlRun("BEGIN");
    sqlRun(`DELETE FROM ${spec.table}`);
    const cols = spec.cols.map(([, c]) => c).join(", ");
    const marks = spec.cols.map(() => "?").join(", ");
    for (const row of rows) {
      sqlRun(`INSERT INTO ${spec.table} (${cols}) VALUES (${marks})`, spec.cols.map(([p, , k]) => toDbValue(row[p], k)));
    }
    sqlRun("COMMIT");
  } catch {
    try { sqlRun("ROLLBACK"); } catch { /* noop */ }
  }
}

/** Read a whole collection back out (prop-shaped objects). */
export function readCollection<T = Record<string, unknown>>(key: string): T[] {
  const spec = SPECS[key];
  if (!spec || !sqlReady()) return [];
  const raw = sqlAll<Record<string, unknown>>(`SELECT * FROM ${spec.table}`);
  return raw.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [p, c, k] of spec.cols) out[p] = fromDbValue(r[c], k);
    return out as T;
  });
}

/** Wipe every table (used by Reset Data). */
export function clearAllTables(): void {
  if (!sqlReady()) return;
  for (const key of Object.keys(SPECS)) {
    try { sqlRun(`DELETE FROM ${SPECS[key].table}`); } catch { /* noop */ }
  }
  try { sqlRun("DELETE FROM meta"); } catch { /* noop */ }
}
