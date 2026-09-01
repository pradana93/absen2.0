# Security Policy

Vittoria HR handles attendance biometrics (face encodings), GPS traces, and
employee PII — treat deployments accordingly.

## Secrets: never commit them

The following must live **only** in host environment variables (Vercel /
Netlify / Cloudflare) or the git-ignored `server/pa_config.py` — never in the
repository:

| Secret | Where it belongs |
|---|---|
| Postgres connection string (`DATABASE_URL` / `POSTGRES_URL`) | host env vars |
| Gmail App Password (`SMTP_PASS`) | host env vars or in-app Super Admin config |
| Resend API key (`RESEND_API_KEY`) | host env vars |
| Any `pa_config.py` | git-ignored by default |

If a secret ever lands in a commit, **rotate it immediately** (reset the DB
role password / Gmail App Password / API key), then purge it from history.

## How the app defends itself

- **Parameterized SQL everywhere** — identifiers whitelisted, values always
  bound; the read-only SQL console rejects anything but `SELECT/PRAGMA/WITH/EXPLAIN`
- **No credentials in the browser** — the DB is reached only through
  serverless functions; the connection string never ships to clients
- **Supabase schema isolation** — all tables are created in a dedicated
  `vittoria` schema, never `public`, so Supabase's auto-generated REST API
  (anon key) can't see employee/attendance data
- **Origin allowlist + session header** on every API call
- **Device binding** — accounts lock to their first-login device; foreign
  devices are refused and audited
- **JWT sessions** (8h access / 7d refresh) with login rate limiting
  (5 failures → 30s lock, admins alerted at 3)
- **Face data** — 128-D encodings and evidence thumbnails are stored in
  *your* database; no third-party face service is called at runtime

## Demo credentials

The seeded accounts (`su@vittoria.example` / `super123`, etc.) exist **only
for fresh local installs**. The first thing to do on any real deployment:
change the Super Admin password and issue real accounts from *Pengguna*.

## Reporting a vulnerability

Please do **not** open a public issue. Email details to the repository owner
(or use GitHub's private security advisory feature) — we aim to respond
within 48 hours.
