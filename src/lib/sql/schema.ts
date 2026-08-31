/**
 * Vittoria HR — SQLite schema ( Fase 1: embedded engine ).
 * The same DDL (Postgres-flavored) ships in server/schema.postgres.sql for
 * the Fase 2 cloud migration — table & column names stay identical.
 */
export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT
);

CREATE TABLE IF NOT EXISTS companies (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  short_name      TEXT,
  address         TEXT,
  app_name        TEXT,
  app_tagline     TEXT,
  logo            TEXT,
  brand           TEXT,
  maintenance     INTEGER DEFAULT 0,
  device_binding  INTEGER DEFAULT 1,
  announcement    TEXT,            -- json {text,tone} | null
  holidays        TEXT             -- json [{date,name}]
);

CREATE TABLE IF NOT EXISTS sites (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  short_name  TEXT,
  address     TEXT,
  hq_lat      REAL NOT NULL,
  hq_lon      REAL NOT NULL,
  radius_m    INTEGER NOT NULL DEFAULT 100,
  color       TEXT DEFAULT 'sun'
);

CREATE TABLE IF NOT EXISTS employees (
  staff_id        TEXT PRIMARY KEY,
  nik             TEXT,
  name            TEXT NOT NULL,
  email           TEXT UNIQUE,
  password        TEXT,
  phone           TEXT,
  address         TEXT,
  emergency_name  TEXT,
  emergency_phone TEXT,
  department      TEXT,
  position        TEXT,
  role            TEXT NOT NULL DEFAULT 'employee',
  shift_id        TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  salary          TEXT,            -- json SalaryStructure
  site_id         TEXT REFERENCES sites(id) ON DELETE SET NULL,
  photo           TEXT,
  descriptor      TEXT,            -- json number[128]
  hash            TEXT,
  device_id       TEXT,
  device_bound_at INTEGER,
  created_at      INTEGER
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id          TEXT PRIMARY KEY,
  ts          INTEGER NOT NULL,
  staff_id    TEXT NOT NULL REFERENCES employees(staff_id) ON DELETE CASCADE,
  name        TEXT,
  department  TEXT,
  site_id     TEXT REFERENCES sites(id) ON DELETE SET NULL,
  type        TEXT NOT NULL,       -- IN | OUT
  lat         REAL,
  lon         REAL,
  distance_m  REAL,
  face_dist   REAL,
  method      TEXT,                -- face | manual
  source      TEXT,                -- gps | sim | manual
  status      TEXT NOT NULL,       -- VERIFIED | REJECTED
  reason      TEXT,
  late_min    INTEGER,
  overtime_min INTEGER,
  work_min    INTEGER,
  photo       TEXT
);
CREATE INDEX IF NOT EXISTS idx_logs_staff_ts ON attendance_logs(staff_id, ts);
CREATE INDEX IF NOT EXISTS idx_logs_ts       ON attendance_logs(ts);
CREATE INDEX IF NOT EXISTS idx_logs_site     ON attendance_logs(site_id);

CREATE TABLE IF NOT EXISTS leaves (
  id               TEXT PRIMARY KEY,
  staff_id         TEXT NOT NULL REFERENCES employees(staff_id) ON DELETE CASCADE,
  name             TEXT,
  type             TEXT NOT NULL,
  date             TEXT NOT NULL,
  days             INTEGER NOT NULL,
  reason           TEXT,
  attachment       TEXT,           -- json {name,dataUrl} | null
  status           TEXT NOT NULL,  -- pending | pending_hr | approved | rejected
  manager_decision TEXT,           -- json {by,at}
  hr_decision      TEXT,
  created_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_leaves_status ON leaves(status);

CREATE TABLE IF NOT EXISTS shifts (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  start     TEXT NOT NULL,
  end       TEXT NOT NULL,
  grace_min INTEGER DEFAULT 15,
  color     TEXT
);

CREATE TABLE IF NOT EXISTS org_nodes (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT REFERENCES org_nodes(id) ON DELETE SET NULL,
  site_id    TEXT REFERENCES sites(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  staff_id   TEXT REFERENCES employees(staff_id) ON DELETE SET NULL,
  name       TEXT,
  note       TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS board_posts (
  id         TEXT PRIMARY KEY,
  site_id    TEXT REFERENCES sites(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  tone       TEXT DEFAULT 'info',
  created_by TEXT,
  created_at INTEGER,
  acks       TEXT                  -- json string[] of staff_ids
);

CREATE TABLE IF NOT EXISTS departments (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS leave_quotas (
  type TEXT PRIMARY KEY,
  days INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS salary_defaults (
  role        TEXT PRIMARY KEY,
  basic       INTEGER,
  transport   INTEGER,
  meal        INTEGER,
  ot_per_hour INTEGER
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  ts         INTEGER NOT NULL,
  actor_id   TEXT,
  actor_name TEXT,
  role       TEXT,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(ts);

CREATE TABLE IF NOT EXISTS notifications (
  id       TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES employees(staff_id) ON DELETE CASCADE,
  title    TEXT,
  body     TEXT,
  tone     TEXT DEFAULT 'info',
  ts       INTEGER,
  read     INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notifs_staff ON notifications(staff_id);

CREATE TABLE IF NOT EXISTS breaks (
  id       TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES employees(staff_id) ON DELETE CASCADE,
  day      TEXT NOT NULL,
  start    INTEGER NOT NULL,
  end      INTEGER
);

CREATE TABLE IF NOT EXISTS resets (
  token    TEXT PRIMARY KEY,
  staff_id TEXT REFERENCES employees(staff_id) ON DELETE CASCADE,
  email    TEXT,
  exp      INTEGER,
  used     INTEGER DEFAULT 0
);
`;
