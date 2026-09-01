-- ============================================================================
-- Vittoria HR — Netlify DB (Postgres) schema, Fase 2.
--
-- You normally don't run this by hand: in the app, open
-- Master Data → Cloud (Netlify DB) → "Siapkan Skema & Unggah Data" and the
-- bundled Netlify Function creates every table idempotently (CREATE TABLE
-- IF NOT EXISTS) and uploads your local data.
--
-- This file is the human-readable reference of that exact DDL.
-- Column mapping mirrors src/lib/sql/bridge.ts (SPECS) and
-- netlify/functions/api.mjs — keep all three in sync.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "meta" ("k" TEXT PRIMARY KEY, "v" TEXT);

CREATE TABLE IF NOT EXISTS "companies" (
  "id" TEXT, "name" TEXT, "short_name" TEXT, "address" TEXT,
  "app_name" TEXT, "app_tagline" TEXT, "logo" TEXT, "brand" TEXT,
  "maintenance" BOOLEAN, "device_binding" BOOLEAN,
  "announcement" JSONB, "holidays" JSONB,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sites" (
  "id" TEXT, "name" TEXT, "short_name" TEXT, "address" TEXT,
  "hq_lat" DOUBLE PRECISION, "hq_lon" DOUBLE PRECISION, "radius_m" BIGINT, "color" TEXT,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "employees" (
  "staff_id" TEXT, "nik" TEXT, "name" TEXT, "email" TEXT, "password" TEXT,
  "phone" TEXT, "address" TEXT, "emergency_name" TEXT, "emergency_phone" TEXT,
  "department" TEXT, "position" TEXT, "role" TEXT, "shift_id" TEXT, "status" TEXT,
  "salary" JSONB, "site_id" TEXT, "photo" TEXT, "descriptor" JSONB, "hash" TEXT,
  "device_id" TEXT, "device_bound_at" BIGINT, "created_at" BIGINT,
  PRIMARY KEY ("staff_id")
);

CREATE TABLE IF NOT EXISTS "attendance_logs" (
  "id" TEXT, "ts" BIGINT, "staff_id" TEXT, "name" TEXT, "department" TEXT, "site_id" TEXT,
  "type" TEXT, "lat" DOUBLE PRECISION, "lon" DOUBLE PRECISION, "distance_m" DOUBLE PRECISION,
  "face_dist" DOUBLE PRECISION, "method" TEXT, "source" TEXT, "status" TEXT, "reason" TEXT,
  "late_min" BIGINT, "overtime_min" BIGINT, "work_min" BIGINT, "photo" TEXT,
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_logs_ts" ON "attendance_logs" ("ts");
CREATE INDEX IF NOT EXISTS "idx_logs_staff" ON "attendance_logs" ("staff_id");

CREATE TABLE IF NOT EXISTS "leaves" (
  "id" TEXT, "staff_id" TEXT, "name" TEXT, "type" TEXT, "date" TEXT, "days" BIGINT,
  "reason" TEXT, "attachment" JSONB, "status" TEXT,
  "manager_decision" JSONB, "hr_decision" JSONB, "created_at" BIGINT,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "shifts" (
  "id" TEXT, "name" TEXT, "start" TEXT, "end" TEXT, "grace_min" BIGINT, "color" TEXT,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "org_nodes" (
  "id" TEXT, "parent_id" TEXT, "site_id" TEXT, "title" TEXT,
  "staff_id" TEXT, "name" TEXT, "note" TEXT, "created_at" BIGINT,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "board_posts" (
  "id" TEXT, "site_id" TEXT, "title" TEXT, "body" TEXT, "tone" TEXT,
  "created_by" TEXT, "created_at" BIGINT, "acks" JSONB,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "departments" ("name" TEXT, PRIMARY KEY ("name"));

CREATE TABLE IF NOT EXISTS "leave_quotas" ("type" TEXT, "days" BIGINT, PRIMARY KEY ("type"));

CREATE TABLE IF NOT EXISTS "salary_defaults" (
  "role" TEXT, "basic" BIGINT, "transport" BIGINT, "meal" BIGINT, "ot_per_hour" BIGINT,
  PRIMARY KEY ("role")
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" TEXT, "ts" BIGINT, "actor_id" TEXT, "actor_name" TEXT,
  "role" TEXT, "action" TEXT, "target" TEXT, "detail" TEXT,
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_audit_ts" ON "audit_logs" ("ts");

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT, "staff_id" TEXT, "title" TEXT, "body" TEXT, "tone" TEXT, "ts" BIGINT, "read" BOOLEAN,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "breaks" (
  "id" TEXT, "staff_id" TEXT, "day" TEXT, "start" BIGINT, "end" BIGINT,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "resets" (
  "token" TEXT, "staff_id" TEXT, "email" TEXT, "exp" BIGINT, "used" BOOLEAN,
  PRIMARY KEY ("token")
);
