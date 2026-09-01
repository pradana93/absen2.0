/**
 * Vittoria HR — cloud bridge (Fase 2).
 *
 * Thin serverless API between the static app and the Netlify DB (Postgres).
 * The browser never touches Postgres directly; it talks to this function,
 * which runs parameterized SQL only (identifiers are whitelisted, values are
 * always bound — no injection surface).
 *
 * Ops (POST JSON, header `x-vittoria-session` required):
 *   { op: "init" }                 → create all tables (idempotent)
 *   { op: "pull" }                 → full read of every collection
 *   { op: "sync", key, rows }      → upsert collection rows (chunked)
 *   { op: "remove", key, ids }     → delete rows by primary key
 *   { op: "clear", key }           → empty a table
 *
 * Env: DATABASE_URL is injected automatically when the Netlify DB is linked
 * to the site. Keep SPECS in sync with src/lib/sql/bridge.ts.
 */
import { neon } from "@neondatabase/serverless";

/* ------------------------------- column map ------------------------------ */
const KIND_SQL = { t: "TEXT", i: "BIGINT", r: "DOUBLE PRECISION", j: "JSONB", b: "BOOLEAN" };

/** key, table, primary key, cols: [prop, column, kind] */
const SPECS = [
  { key: "company", table: "companies", pk: "id", cols: [
    ["id", "id", "t"], ["name", "name", "t"], ["shortName", "short_name", "t"], ["address", "address", "t"],
    ["appName", "app_name", "t"], ["appTagline", "app_tagline", "t"], ["logo", "logo", "t"], ["brand", "brand", "t"],
    ["maintenance", "maintenance", "b"], ["deviceBinding", "device_binding", "b"],
    ["announcement", "announcement", "j"], ["holidays", "holidays", "j"]] },
  { key: "sites", table: "sites", pk: "id", cols: [
    ["id", "id", "t"], ["name", "name", "t"], ["shortName", "short_name", "t"], ["address", "address", "t"],
    ["hqLat", "hq_lat", "r"], ["hqLon", "hq_lon", "r"], ["radiusM", "radius_m", "i"], ["color", "color", "t"]] },
  { key: "employees", table: "employees", pk: "staff_id", cols: [
    ["staffId", "staff_id", "t"], ["nik", "nik", "t"], ["name", "name", "t"], ["email", "email", "t"],
    ["password", "password", "t"], ["phone", "phone", "t"], ["address", "address", "t"],
    ["emergencyName", "emergency_name", "t"], ["emergencyPhone", "emergency_phone", "t"],
    ["department", "department", "t"], ["position", "position", "t"], ["role", "role", "t"],
    ["shiftId", "shift_id", "t"], ["status", "status", "t"], ["salary", "salary", "j"], ["siteId", "site_id", "t"],
    ["photo", "photo", "t"], ["descriptor", "descriptor", "j"], ["hash", "hash", "t"],
    ["deviceId", "device_id", "t"], ["deviceBoundAt", "device_bound_at", "i"], ["createdAt", "created_at", "i"]] },
  { key: "logs", table: "attendance_logs", pk: "id", cols: [
    ["id", "id", "t"], ["ts", "ts", "i"], ["staffId", "staff_id", "t"], ["name", "name", "t"],
    ["department", "department", "t"], ["siteId", "site_id", "t"], ["type", "type", "t"],
    ["lat", "lat", "r"], ["lon", "lon", "r"], ["distanceM", "distance_m", "r"], ["faceDist", "face_dist", "r"],
    ["method", "method", "t"], ["source", "source", "t"], ["status", "status", "t"], ["reason", "reason", "t"],
    ["lateMin", "late_min", "i"], ["overtimeMin", "overtime_min", "i"], ["workMin", "work_min", "i"], ["photo", "photo", "t"]] },
  { key: "leaves", table: "leaves", pk: "id", cols: [
    ["id", "id", "t"], ["staffId", "staff_id", "t"], ["name", "name", "t"], ["type", "type", "t"],
    ["date", "date", "t"], ["days", "days", "i"], ["reason", "reason", "t"], ["attachment", "attachment", "j"],
    ["status", "status", "t"], ["managerDecision", "manager_decision", "j"], ["hrDecision", "hr_decision", "j"],
    ["createdAt", "created_at", "i"]] },
  { key: "shifts", table: "shifts", pk: "id", cols: [
    ["id", "id", "t"], ["name", "name", "t"], ["start", "start", "t"], ["end", "end", "t"],
    ["graceMin", "grace_min", "i"], ["color", "color", "t"]] },
  { key: "org", table: "org_nodes", pk: "id", cols: [
    ["id", "id", "t"], ["parentId", "parent_id", "t"], ["siteId", "site_id", "t"], ["title", "title", "t"],
    ["staffId", "staff_id", "t"], ["name", "name", "t"], ["note", "note", "t"], ["createdAt", "created_at", "i"]] },
  { key: "board", table: "board_posts", pk: "id", cols: [
    ["id", "id", "t"], ["siteId", "site_id", "t"], ["title", "title", "t"], ["body", "body", "t"],
    ["tone", "tone", "t"], ["createdBy", "created_by", "t"], ["createdAt", "created_at", "i"], ["acks", "acks", "j"]] },
  { key: "departments", table: "departments", pk: "name", cols: [["name", "name", "t"]] },
  { key: "quotas", table: "leave_quotas", pk: "type", cols: [["type", "type", "t"], ["days", "days", "i"]] },
  { key: "salarydefaults", table: "salary_defaults", pk: "role", cols: [
    ["role", "role", "t"], ["basic", "basic", "i"], ["transport", "transport", "i"], ["meal", "meal", "i"], ["otPerHour", "ot_per_hour", "i"]] },
  { key: "audits", table: "audit_logs", pk: "id", cols: [
    ["id", "id", "t"], ["ts", "ts", "i"], ["actorId", "actor_id", "t"], ["actorName", "actor_name", "t"],
    ["role", "role", "t"], ["action", "action", "t"], ["target", "target", "t"], ["detail", "detail", "t"]] },
  { key: "notifs", table: "notifications", pk: "id", cols: [
    ["id", "id", "t"], ["staffId", "staff_id", "t"], ["title", "title", "t"], ["body", "body", "t"],
    ["tone", "tone", "t"], ["ts", "ts", "i"], ["read", "read", "b"]] },
  { key: "breaks", table: "breaks", pk: "id", cols: [
    ["id", "id", "t"], ["staffId", "staff_id", "t"], ["day", "day", "t"], ["start", "start", "i"], ["end", "end", "i"]] },
  { key: "resets", table: "resets", pk: "token", cols: [
    ["token", "token", "t"], ["staffId", "staff_id", "t"], ["email", "email", "t"], ["exp", "exp", "i"], ["used", "used", "b"]] },
];

const META_DDL = `CREATE TABLE IF NOT EXISTS "meta" ("k" TEXT PRIMARY KEY, "v" TEXT)`;
const SCHEMA_VERSION = "2";

const specOf = (key) => SPECS.find((s) => s.key === key);
const q = (ident) => `"${ident.replace(/"/g, "")}"`;

/* ------------------------------ value mapping ---------------------------- */
function toDb(v, kind) {
  if (v === null || v === undefined) return null;
  if (kind === "j") return JSON.stringify(v);
  if (kind === "b") return Boolean(v);
  if (kind === "i" || kind === "r") return Number(v);
  return String(v);
}
function toProp(v, kind) {
  if (v === null || v === undefined) return null;
  if (kind === "j") { if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } } return v; }
  if (kind === "b") return Boolean(v);
  if (kind === "i" || kind === "r") return Number(v);
  return String(v);
}

/* --------------------------------- handler ------------------------------- */
export default async (req, context) => {
  const headers = {
    "content-type": "application/json",
    "access-control-allow-headers": "content-type, x-vittoria-session",
    "access-control-allow-methods": "POST, OPTIONS",
  };
  const origin = req.headers.get("origin") || "";
  const siteUrl = process.env.URL || "";
  const allowedOrigins = [siteUrl, process.env.NETLIFY_SITE_URL && `https://${process.env.NETLIFY_SITE_URL}`, "http://localhost:3000", "http://localhost:8888", "http://127.0.0.1:3000"].filter(Boolean);
  if (origin && !allowedOrigins.some((a) => origin.startsWith(a))) {
    return new Response(JSON.stringify({ ok: false, error: "Origin tidak diizinkan." }), { status: 403, headers });
  }
  headers["access-control-allow-origin"] = origin || siteUrl || "*";

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "POST only." }), { status: 405, headers });

  /* Fase 2 guard: session token must be present (verified server-side in Fase 3). */
  if (!req.headers.get("x-vittoria-session")) {
    return new Response(JSON.stringify({ ok: false, error: "Sesi tidak ditemukan." }), { status: 401, headers });
  }

  if (!process.env.DATABASE_URL) {
    return new Response(JSON.stringify({ ok: false, error: "DATABASE_URL belum ada — hubungkan Netlify DB ke site ini (Site configuration → Environment)." }), { status: 500, headers });
  }

  const sql = neon(process.env.DATABASE_URL);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Body tidak valid." }, 400); }
  const { op, key, rows, ids } = body;

  try {
    /* ------------------------------- init -------------------------------- */
    if (op === "init") {
      await sql(META_DDL);
      for (const s of SPECS) {
        const cols = s.cols.map(([, c, k]) => `${q(c)} ${KIND_SQL[k]}`).join(", ");
        await sql(`CREATE TABLE IF NOT EXISTS ${q(s.table)} (${cols}, PRIMARY KEY (${q(s.pk)}))`);
      }
      await sql(`INSERT INTO "meta" ("k","v") VALUES ('schema_version',$1),('created_at',$2)
                 ON CONFLICT ("k") DO UPDATE SET "v" = EXCLUDED."v"`, [SCHEMA_VERSION, String(Date.now())]);
      return json({ ok: true, schema_version: SCHEMA_VERSION, tables: SPECS.length });
    }

    /* ------------------------------- pull -------------------------------- */
    if (op === "pull") {
      const data = {};
      const counts = {};
      let ready = true;
      let total = 0;
      for (const s of SPECS) {
        const exists = await sql(`SELECT to_regclass($1) AS r`, [s.table]);
        if (!exists[0]?.r) { ready = false; counts[s.key] = 0; data[s.key] = []; continue; }
        const raw = await sql(`SELECT * FROM ${q(s.table)}`);
        const props = raw.map((row) => {
          const out = {};
          for (const [p, c, k] of s.cols) out[p] = toProp(row[c], k);
          return out;
        });
        data[s.key] = props;
        counts[s.key] = props.length;
        total += props.length;
      }
      let version = null;
      try { version = (await sql(`SELECT "v" FROM "meta" WHERE "k"='schema_version'`))[0]?.v ?? null; } catch { /* meta absent */ }
      return json({ ok: true, ready, hasData: total > 0, rows: total, counts, data, version });
    }

    const spec = specOf(key);
    if (!spec) return json({ ok: false, error: `Tabel "${key}" tidak dikenal.` }, 400);
    const exists = await sql(`SELECT to_regclass($1) AS r`, [spec.table]);
    if (!exists[0]?.r) return json({ ok: false, error: "Skema belum dibuat — jalankan op:init dulu." }, 409);

    /* ------------------------------- sync -------------------------------- */
    if (op === "sync") {
      if (!Array.isArray(rows)) return json({ ok: false, error: "rows harus array." }, 400);
      if (rows.length === 0) return json({ ok: true, affected: 0 });
      const cols = spec.cols.map(([, c]) => q(c)).join(", ");
      const setCols = spec.cols.filter(([, c]) => c !== spec.pk).map(([, c]) => `${q(c)} = EXCLUDED.${q(c)}`).join(", ");
      const width = spec.cols.length;
      const CHUNK = Math.max(1, Math.floor(60000 / width)); // stay under Postgres' 65535 params
      let affected = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = rows.slice(i, i + CHUNK);
        const params = [];
        const tuples = batch.map((row) => {
          const marks = spec.cols.map(([p, , k], ci) => { params.push(toDb(row[p], k)); return `$${params.length - 1 + 1}`; }).join(", ");
          return `(${marks})`;
        });
        const res = await sql(
          `INSERT INTO ${q(spec.table)} (${cols}) VALUES ${tuples.join(", ")}
           ON CONFLICT (${q(spec.pk)}) DO UPDATE SET ${setCols || `${q(spec.pk)} = EXCLUDED.${q(spec.pk)}`}`,
          params,
        );
        affected += Array.isArray(res) ? batch.length : batch.length;
      }
      await sql(`INSERT INTO "meta" ("k","v") VALUES ('last_push',$1) ON CONFLICT ("k") DO UPDATE SET "v" = EXCLUDED."v"`, [String(Date.now())]);
      return json({ ok: true, affected });
    }

    /* ------------------------------- remove ------------------------------ */
    if (op === "remove") {
      if (!Array.isArray(ids) || ids.length === 0) return json({ ok: true, affected: 0 });
      const res = await sql(`DELETE FROM ${q(spec.table)} WHERE ${q(spec.pk)} = ANY($1)`, [ids.map(String)]);
      return json({ ok: true, affected: Array.isArray(res) ? ids.length : 0 });
    }

    /* ------------------------------- clear ------------------------------- */
    if (op === "clear") {
      await sql(`DELETE FROM ${q(spec.table)}`);
      return json({ ok: true });
    }

    return json({ ok: false, error: `Op "${op}" tidak dikenal.` }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e?.message ?? e).slice(0, 300) }, 500);
  }
};
