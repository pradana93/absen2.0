/**
 * Vittoria HR — cloud bridge (Fase 2 · v5: real Postgres driver).
 *
 * Thin serverless API between the static app and any Postgres database —
 * Supabase, Vercel Postgres, Netlify DB, Neon, or your own server. The
 * browser never touches Postgres directly; it talks to this function, which
 * runs parameterized SQL only (identifiers whitelisted, values always bound).
 *
 * Tables live in the dedicated `vittoria` schema — deliberately NOT `public`,
 * so Supabase/PostgREST never exposes them through the auto-generated REST
 * API (they hold passwords & PII).
 *
 * Ops (POST JSON, header `x-vittoria-session` required):
 *   { op: "init" }            → create schema + all tables (idempotent)
 *   { op: "pull", keys? }     → full or targeted read of collections
 *   { op: "sync", key, rows } → upsert rows (chunked, rev-stamped)
 *   { op: "remove", key, ids }→ delete by primary key
 *   { op: "clear", key }      → empty a table
 *   { op: "stats" }           → counts + rev stamps + active presence
 *   { op: "presence", ... }   → heartbeat + active device list
 *   { op: "ping" }            → end-to-end health check
 *
 * Env: DATABASE_URL or POSTGRES_URL. For Supabase on serverless, use the
 * **Transaction pooler** string (port 6543) to avoid exhausting direct
 * connections. Keep SPECS in sync with src/lib/sql/bridge.ts.
 */
import pg from "pg";

const SCHEMA = "vittoria";
const SCHEMA_VERSION = "3";

const KIND_SQL = { t: "TEXT", i: "BIGINT", r: "DOUBLE PRECISION", j: "JSONB", b: "BOOLEAN" };

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

const META_DDL = `CREATE TABLE IF NOT EXISTS "${SCHEMA}"."meta" ("k" TEXT PRIMARY KEY, "v" TEXT)`;
const PRESENCE_DDL = `CREATE TABLE IF NOT EXISTS "${SCHEMA}"."device_presence" (
  "device_id" TEXT PRIMARY KEY, "staff_id" TEXT, "staff_name" TEXT, "role" TEXT,
  "site_id" TEXT, "site_name" TEXT, "ua" TEXT, "ts" BIGINT)`;
const PRESENCE_WINDOW_MS = 3 * 60_000;

const specOf = (key) => SPECS.find((s) => s.key === key);
const q = (ident) => `"${String(ident).replace(/"/g, "")}"`;
const fq = (table) => `"${SCHEMA}"."${String(table).replace(/"/g, "")}"`; // schema-qualified

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
function presenceRow(r) {
  return {
    deviceId: String(r.device_id ?? ""), staffId: r.staff_id ?? null, name: String(r.staff_name ?? ""),
    role: String(r.role ?? ""), siteId: r.site_id ?? null, siteName: r.site_name ?? null, lastSeen: Number(r.ts ?? 0),
  };
}

/* --------------------- lazy pool (serverless-friendly) ------------------- */
let pool = null;
function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("NO_DB_URL");
  const opts = { connectionString: url, max: 1, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000 };
  /* Supabase (and most managed Postgres) require SSL; opt out only if the
     connection string explicitly disables it. */
  if (!/[?&]sslmode=disable/i.test(url)) opts.ssl = { rejectUnauthorized: false };
  pool = new pg.Pool(opts);
  pool.on("error", () => { /* idle client errors must not crash the function */ });
  return pool;
}

export default async (req, context) => {
  const headers = {
    "content-type": "application/json",
    "access-control-allow-headers": "content-type, x-vittoria-session",
    "access-control-allow-methods": "POST, OPTIONS",
  };
  const origin = req.headers.get("origin") || "";
  const siteUrl = process.env.URL || "";
  const allowedOrigins = [
    siteUrl,
    process.env.NETLIFY_SITE_URL && `https://${process.env.NETLIFY_SITE_URL}`,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    "http://localhost:3000", "http://localhost:8888", "http://127.0.0.1:3000",
  ].filter(Boolean);
  let originHost = "";
  try { originHost = origin ? new URL(origin).hostname : ""; } catch { /* malformed Origin — treated as untrusted host suffix check below fails safely */ }
  const originOk = !origin
    || allowedOrigins.some((a) => origin === a || origin.startsWith(a.replace(/\/$/, "")))
    || /\.vercel\.app$/.test(originHost)
    || /\.pages\.dev$/.test(originHost)
    || /\.netlify\.app$/.test(originHost)
    || /\.supabase\.co$/.test(originHost);
  if (!originOk) {
    return new Response(JSON.stringify({ ok: false, error: "Origin tidak diizinkan." }), { status: 403, headers });
  }
  headers["access-control-allow-origin"] = origin || siteUrl || "*";

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "POST only." }), { status: 405, headers });

  /* Fase 2 guard: session token present (server-side verification = Fase 3). */
  if (!req.headers.get("x-vittoria-session")) {
    return new Response(JSON.stringify({ ok: false, error: "Sesi tidak ditemukan." }), { status: 401, headers });
  }

  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

  let poolInst;
  try {
    poolInst = getPool();
  } catch {
    return json({ ok: false, error: "Belum ada connection string — set env DATABASE_URL (atau POSTGRES_URL). Supabase: pakai string Transaction pooler (port 6543)." }, 500);
  }
  const sql = async (text, params = []) => (await poolInst.query(text, params)).rows;

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Body tidak valid." }, 400); }
  const { op, key, rows, ids, keys } = body;

  try {
    /* schema + maintenance tables always ensured for meta-dependent ops */
    if (["init", "stats", "presence", "ping"].includes(op)) {
      await sql(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"`);
      await sql(META_DDL);
      await sql(PRESENCE_DDL);
    }

    /* ------------------------------- init -------------------------------- */
    if (op === "init") {
      for (const s of SPECS) {
        const cols = s.cols.map(([, c, k]) => `${q(c)} ${KIND_SQL[k]}`).join(", ");
        await sql(`CREATE TABLE IF NOT EXISTS ${fq(s.table)} (${cols}, PRIMARY KEY (${q(s.pk)}))`);
      }
      await sql(`INSERT INTO "${SCHEMA}"."meta" ("k","v") VALUES ('schema_version',$1),('created_at',$2)
                 ON CONFLICT ("k") DO UPDATE SET "v" = EXCLUDED."v"`, [SCHEMA_VERSION, String(Date.now())]);
      return json({ ok: true, schema_version: SCHEMA_VERSION, schema: SCHEMA, tables: SPECS.length });
    }

    /* ------------------------------- pull -------------------------------- */
    if (op === "pull") {
      const wanted = Array.isArray(keys) && keys.length ? SPECS.filter((s) => keys.includes(s.key)) : SPECS;
      const data = {};
      const counts = {};
      let ready = true;
      let total = 0;
      for (const s of wanted) {
        const exists = await sql(`SELECT to_regclass($1) AS r`, [`${SCHEMA}.${s.table}`]);
        if (!exists[0]?.r) { ready = false; counts[s.key] = 0; data[s.key] = []; continue; }
        const raw = await sql(`SELECT * FROM ${fq(s.table)}`);
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
      try { version = (await sql(`SELECT "v" FROM "${SCHEMA}"."meta" WHERE "k"='schema_version'`))[0]?.v ?? null; } catch { /* meta absent */ }
      return json({ ok: true, ready, hasData: total > 0, rows: total, counts, data, version });
    }

    /* ------------- table-keyed ops (sync/remove/clear) -------------------- */
    if (op === "sync" || op === "remove" || op === "clear") {
      const spec = specOf(key);
      if (!spec) return json({ ok: false, error: `Tabel "${key ?? "(kosong)"}" tidak dikenal.` }, 400);
      const exists = await sql(`SELECT to_regclass($1) AS r`, [`${SCHEMA}.${spec.table}`]);
      if (!exists[0]?.r) return json({ ok: false, error: "Skema belum dibuat — jalankan op:init dulu." }, 409);

      const bumpRev = () => sql(
        `INSERT INTO "${SCHEMA}"."meta" ("k","v") VALUES ($1,$2) ON CONFLICT ("k") DO UPDATE SET "v" = EXCLUDED."v"`,
        [`rev:${key}`, String(Date.now())],
      );

      if (op === "sync") {
        if (!Array.isArray(rows)) return json({ ok: false, error: "rows harus array." }, 400);
        if (rows.length === 0) { await bumpRev(); return json({ ok: true, affected: 0 }); }
        const cols = spec.cols.map(([, c]) => q(c)).join(", ");
        const setCols = spec.cols.filter(([, c]) => c !== spec.pk).map(([, c]) => `${q(c)} = EXCLUDED.${q(c)}`).join(", ");
        const width = spec.cols.length;
        const CHUNK = Math.max(1, Math.floor(60000 / width)); // under Postgres' 65535 params
        let affected = 0;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const batch = rows.slice(i, i + CHUNK);
          const params = [];
          const tuples = batch.map((row) => {
            const marks = spec.cols.map(([p, , k]) => { params.push(toDb(row[p], k)); return `$${params.length}`; }).join(", ");
            return `(${marks})`;
          });
          await sql(
            `INSERT INTO ${fq(spec.table)} (${cols}) VALUES ${tuples.join(", ")}
             ON CONFLICT (${q(spec.pk)}) DO UPDATE SET ${setCols || `${q(spec.pk)} = EXCLUDED.${q(spec.pk)}`}`,
            params,
          );
          affected += batch.length;
        }
        await bumpRev();
        await sql(`INSERT INTO "${SCHEMA}"."meta" ("k","v") VALUES ('last_push',$1) ON CONFLICT ("k") DO UPDATE SET "v" = EXCLUDED."v"`, [String(Date.now())]);
        return json({ ok: true, affected });
      }

      if (op === "remove") {
        if (!Array.isArray(ids) || ids.length === 0) return json({ ok: true, affected: 0 });
        await sql(`DELETE FROM ${fq(spec.table)} WHERE ${q(spec.pk)} = ANY($1)`, [ids.map(String)]);
        await bumpRev();
        return json({ ok: true, affected: ids.length });
      }

      /* clear */
      await sql(`DELETE FROM ${fq(spec.table)}`);
      await bumpRev();
      return json({ ok: true });
    }

    /* ------------------------------- stats ------------------------------- */
    if (op === "stats") {
      let total = 0;
      const counts = {};
      let tables = 0;
      for (const s of SPECS) {
        const ex = await sql(`SELECT to_regclass($1) AS r`, [`${SCHEMA}.${s.table}`]);
        if (!ex[0]?.r) { counts[s.key] = 0; continue; }
        tables++;
        const c = await sql(`SELECT COUNT(*)::int AS c FROM ${fq(s.table)}`);
        counts[s.key] = Number(c[0]?.c ?? 0);
        total += counts[s.key];
      }
      const revRows = await sql(`SELECT "k", "v" FROM "${SCHEMA}"."meta" WHERE "k" LIKE 'rev:%'`);
      const revs = {};
      for (const r of revRows) revs[String(r.k).slice(4)] = String(r.v);
      let version = null;
      try { version = (await sql(`SELECT "v" FROM "${SCHEMA}"."meta" WHERE "k"='schema_version'`))[0]?.v ?? null; } catch { /* noop */ }
      const ver = String((await sql(`SELECT version() AS v`))[0]?.v ?? "").split(", compiled")[0].split(" on ")[0];
      const pres = await sql(`SELECT * FROM "${SCHEMA}"."device_presence" WHERE "ts" > $1 ORDER BY "ts" DESC`, [Date.now() - PRESENCE_WINDOW_MS]);
      return json({
        ok: true, rows: total, tables, version, revs, counts,
        server_version: ver,
        presence_active: pres.map(presenceRow),
      });
    }

    /* ------------------------------ presence ----------------------------- */
    if (op === "presence") {
      if (body.deviceId) {
        await sql(
          `INSERT INTO "${SCHEMA}"."device_presence" ("device_id","staff_id","staff_name","role","site_id","site_name","ua","ts")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT ("device_id") DO UPDATE SET
             "staff_id"=EXCLUDED."staff_id","staff_name"=EXCLUDED."staff_name","role"=EXCLUDED."role",
             "site_id"=EXCLUDED."site_id","site_name"=EXCLUDED."site_name","ua"=EXCLUDED."ua","ts"=EXCLUDED."ts"`,
          [String(body.deviceId), body.staffId ?? null, String(body.name ?? ""), String(body.role ?? ""),
           body.siteId ?? null, body.siteName ?? null, String(body.ua ?? "").slice(0, 200), Date.now()],
        );
      }
      const pres = await sql(`SELECT * FROM "${SCHEMA}"."device_presence" WHERE "ts" > $1 ORDER BY "ts" DESC`, [Date.now() - PRESENCE_WINDOW_MS]);
      return json({ ok: true, presence_active: pres.map(presenceRow) });
    }

    /* ------------------------------- ping -------------------------------- */
    if (op === "ping") {
      const t0 = Date.now();
      const ver = String((await sql(`SELECT version() AS v`))[0]?.v ?? "unknown").split(", compiled")[0].split(" on ")[0];
      let tables = 0, rowsTotal = 0;
      const missing = [];
      for (const s of SPECS) {
        const ex = await sql(`SELECT to_regclass($1) AS r`, [`${SCHEMA}.${s.table}`]);
        if (ex[0]?.r) {
          tables++;
          const c = await sql(`SELECT COUNT(*)::int AS c FROM ${fq(s.table)}`);
          rowsTotal += Number(c[0]?.c ?? 0);
        } else missing.push(s.table);
      }
      return json({
        ok: true,
        server_version: ver,
        schema_ready: missing.length === 0,
        schema: SCHEMA,
        tables, missing: missing.slice(0, 5),
        rows: rowsTotal,
        server_ms: Date.now() - t0,
      });
    }

    return json({ ok: false, error: `Op "${op}" tidak dikenal.` }, 400);
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
      return json({ ok: false, error: `Koneksi ke database gagal (${msg.slice(0, 120)}). Cek connection string & status database.` }, 500);
    }
    return json({ ok: false, error: msg.slice(0, 300) }, 500);
  }
};
