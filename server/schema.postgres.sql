-- ============================================================================
-- Vittoria HR — Fase 2: Postgres cloud schema
-- Identical tables/columns to the embedded SQLite engine (src/lib/sql/schema.ts),
-- so the migration is data-only: export the .sqlite from Master Data, then
-- load via pgloader or a CSV import into these tables.
-- ============================================================================

CREATE TABLE meta (
  k TEXT PRIMARY KEY,
  v TEXT
);

CREATE TABLE companies (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  short_name      TEXT,
  address         TEXT,
  app_name        TEXT,
  app_tagline     TEXT,
  logo            TEXT,
  brand           TEXT,
  maintenance     BOOLEAN DEFAULT FALSE,
  device_binding  BOOLEAN DEFAULT TRUE,
  announcement    JSONB,
  holidays        JSONB
);

CREATE TABLE sites (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  short_name  TEXT,
  address     TEXT,
  hq_lat      DOUBLE PRECISION NOT NULL,
  hq_lon      DOUBLE PRECISION NOT NULL,
  radius_m    INTEGER NOT NULL DEFAULT 100,
  color       TEXT DEFAULT 'sun'
);

CREATE TABLE employees (
  staff_id        TEXT PRIMARY KEY,
  nik             TEXT,
  name            TEXT NOT NULL,
  email           TEXT UNIQUE,
  password_hash   TEXT,              -- Argon2id in production (never plaintext)
  phone           TEXT,
  address         TEXT,
  emergency_name  TEXT,
  emergency_phone TEXT,
  department      TEXT,
  position        TEXT,
  role            TEXT NOT NULL DEFAULT 'employee',
  shift_id        TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  salary          JSONB,
  site_id         TEXT REFERENCES sites(id) ON DELETE SET NULL,
  photo           TEXT,
  descriptor      JSONB,             -- 128-D face encoding
  hash            TEXT,
  device_id       TEXT,
  device_bound_at BIGINT,
  created_at      BIGINT
);

CREATE TABLE attendance_logs (
  id           TEXT PRIMARY KEY,
  ts           BIGINT NOT NULL,
  staff_id     TEXT NOT NULL REFERENCES employees(staff_id) ON DELETE CASCADE,
  name         TEXT,
  department   TEXT,
  site_id      TEXT REFERENCES sites(id) ON DELETE SET NULL,
  type         TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lon          DOUBLE PRECISION,
  distance_m   DOUBLE PRECISION,
  face_dist    DOUBLE PRECISION,
  method       TEXT,
  source       TEXT,
  status       TEXT NOT NULL,
  reason       TEXT,
  late_min     INTEGER,
  overtime_min INTEGER,
  work_min     INTEGER,
  photo        TEXT
);
CREATE INDEX idx_logs_staff_ts ON attendance_logs(staff_id, ts);
CREATE INDEX idx_logs_ts       ON attendance_logs(ts);
CREATE INDEX idx_logs_site     ON attendance_logs(site_id);

CREATE TABLE leaves (
  id               TEXT PRIMARY KEY,
  staff_id         TEXT NOT NULL REFERENCES employees(staff_id) ON DELETE CASCADE,
  name             TEXT,
  type             TEXT NOT NULL,
  date             TEXT NOT NULL,
  days             INTEGER NOT NULL,
  reason           TEXT,
  attachment       JSONB,
  status           TEXT NOT NULL,
  manager_decision JSONB,
  hr_decision      JSONB,
  created_at       BIGINT
);
CREATE INDEX idx_leaves_status ON leaves(status);

CREATE TABLE shifts (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  start     TEXT NOT NULL,
  "end"     TEXT NOT NULL,
  grace_min INTEGER DEFAULT 15,
  color     TEXT
);

CREATE TABLE org_nodes (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT REFERENCES org_nodes(id) ON DELETE SET NULL,
  site_id    TEXT REFERENCES sites(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  staff_id   TEXT REFERENCES employees(staff_id) ON DELETE SET NULL,
  name       TEXT,
  note       TEXT,
  created_at BIGINT
);

CREATE TABLE board_posts (
  id         TEXT PRIMARY KEY,
  site_id    TEXT REFERENCES sites(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  tone       TEXT DEFAULT 'info',
  created_by TEXT,
  created_at BIGINT,
  acks       JSONB
);

CREATE TABLE departments ( name TEXT PRIMARY KEY );

CREATE TABLE leave_quotas (
  type TEXT PRIMARY KEY,
  days INTEGER NOT NULL
);

CREATE TABLE salary_defaults (
  role        TEXT PRIMARY KEY,
  basic       INTEGER,
  transport   INTEGER,
  meal        INTEGER,
  ot_per_hour INTEGER
);

CREATE TABLE audit_logs (
  id         TEXT PRIMARY KEY,
  ts         BIGINT NOT NULL,
  actor_id   TEXT,
  actor_name TEXT,
  role       TEXT,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT
);
CREATE INDEX idx_audit_ts ON audit_logs(ts);

CREATE TABLE notifications (
  id       TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES employees(staff_id) ON DELETE CASCADE,
  title    TEXT,
  body     TEXT,
  tone     TEXT DEFAULT 'info',
  ts       BIGINT,
  read     BOOLEAN DEFAULT FALSE
);
CREATE INDEX idx_notifs_staff ON notifications(staff_id);

CREATE TABLE breaks (
  id       TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES employees(staff_id) ON DELETE CASCADE,
  day      TEXT NOT NULL,
  start    BIGINT NOT NULL,
  "end"    BIGINT
);

CREATE TABLE resets (
  token    TEXT PRIMARY KEY,
  staff_id TEXT REFERENCES employees(staff_id) ON DELETE CASCADE,
  email    TEXT,
  exp      BIGINT,
  used     BOOLEAN DEFAULT FALSE
);
