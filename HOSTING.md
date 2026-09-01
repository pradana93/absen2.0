# Vittoria HR — Hosting Guide (multi-host)

The app is **host-agnostic**: one codebase, four supported hosts. The browser
never talks to Postgres directly — each host runs a tiny API function
(`netlify/functions/api.mjs`, `functions/api.mjs`, `api/db.mjs`, or
`server/pa_api.py` — same wire protocol) that owns all SQL.

| Host | Free bandwidth | Functions | DB | Email | Best for |
|---|---|---|---|---|---|
| **Vercel** ⭐ | 100 GB/mo | Node (included) | **Supabase** / Vercel Postgres / any Postgres | Gmail SMTP native | current production |
| **Netlify** | 100 GB/mo | Netlify Functions | **Supabase** / Netlify DB / any Postgres | Gmail SMTP native | alternative |
| **PythonAnywhere** | limited (PA) | Flask web app | **Supabase** — needs $5 tier* | Gmail SMTP native (smtplib) | Python-flavored ops |
| **Cloudflare Pages** | **Unlimited** | Pages Functions (included) | Neon-family only** | Resend (free 100/day) or fallback | escaping usage limits |

\* PA **free** tier only allows outbound connections to whitelisted hosts —
`supabase.co` poolers are not whitelisted, so the DB bridge needs the $5/mo
tier (SMTP and static serving still work on free).

\*\* Cloudflare Workers can't open TCP sockets; that function uses Neon's
HTTP driver, which only speaks to Neon-hosted databases. **Supabase users:
host on Vercel, Netlify, or PythonAnywhere.**

---

## Your data is portable — migration recipe

Wherever you host next, the migration is the same three moves:

1. **Database** — use your existing connection string (Netlify DB stays valid
   while the account lives), or create a free DB at [neon.tech](https://neon.tech)
   and use its *pooled* connection string. Paste it into the new host's
   environment variable `DATABASE_URL`.
2. **Deploy** the repo to the new host (steps below).
3. **Re-upload if the DB is empty** — open the new URL as Super Admin →
   Master Data → Cloud → **"Siapkan Skema & Unggah Data"**. The app detects an
   empty database and uploads everything from the browser's local cache
   (which still holds your full dataset — Netlify pausing the site never
   touched your data).

---

## 🐘 Using Supabase as your database (recommended)

The API function speaks plain Postgres, so a free **Supabase** project works
as the shared team database on Vercel, Netlify, or PythonAnywhere.

1. Supabase dashboard → your project → **Project Settings → Database**.
2. Under **Connection string**, switch the selector to **Transaction pooler**
   (NOT "Direct" — the pooler is built for serverless functions; the direct
   connection has a small connection cap that functions can exhaust). It
   looks like:
   ```
   postgresql://postgres.abc123xyz:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require
   ```
3. Replace `[YOUR-PASSWORD]` with your database password (shown just above;
   reset it there if you've lost it).
4. Paste the full string as **`DATABASE_URL`** in your host's environment
   variables (Vercel: Project → Settings → Environment Variables) → **redeploy**.
5. Open the app → the header flips 🟢 **ONLINE** and, on first connect, the
   app creates its own schema/tables and seeds them automatically.

**Two things worth knowing:**

- **Your tables are private by design.** The app creates everything in a
  dedicated `vittoria` schema, *not* `public` — so Supabase's auto-generated
  REST API never exposes your employee/attendance data to the anon key.
- **Switching databases re-seeds safely.** Point `DATABASE_URL` at a new/empty
  database and the first device to connect uploads the full dataset from its
  local cache — nothing is lost when you move hosts.

## Option A — Cloudflare Pages (recommended: unlimited bandwidth)

1. Push the repo to GitHub (if not already).
2. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
3. Build settings: framework **Vite** · build command `npm run build` · output `dist`.
4. **Settings → Environment variables** (production): add `DATABASE_URL` = your Postgres string.
5. **Save & deploy** (~2 min). `functions/api.mjs` becomes `https://<project>.pages.dev/api` automatically.
6. Open the URL as Super Admin → Master Data → Cloud → **Cek Semua** → all green → **Siapkan Skema & Unggah Data**.
7. *(Optional email)* add env `RESEND_API_KEY` from [resend.com](https://resend.com) (free: 100 emails/day) and redeploy — otherwise password resets use the in-app simulated inbox.

Custom domain: Pages → Custom domains — HTTPS automatic. Your URL keeps working on the old host too; both read the same DB.

## Option B — Vercel (easiest)

1. [vercel.com/new](https://vercel.com/new) → import the GitHub repo (framework preset **Vite** auto-detected).
2. **Database — two choices:**
   - **Vercel's own Postgres** (yes, Vercel has one — free tier on Hobby):
     dashboard → **Storage** tab → **Create → Postgres** → connect it to the
     project. Vercel auto-injects `POSTGRES_URL` (pooled) — the API reads it
     directly, no manual env needed. Free limits (~256 MB storage, 3 GB
     transfer/mo) are far beyond attendance-scale data; check current numbers
     under Storage → your DB → Usage.
    - **Supabase** (see the 🐘 section above): paste the *Transaction pooler*
      string as `DATABASE_URL` under Project → Settings → Environment Variables.
    - **Any other external Postgres** (a free [neon.tech](https://neon.tech) DB,
      etc.): also add it manually as `DATABASE_URL`.
    All work — the function reads `DATABASE_URL` first, then `POSTGRES_URL`.3. (+ optional `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM_NAME` for real Gmail email — works natively on Vercel's Node runtime; the in-app SMTP config in Master Data also works.)
4. Deploy. Routes: `api/db.mjs` → `/api/db`, `api/mail.mjs` → `/api/mail` (the DB route literally re-exports the Netlify handler — same code).
5. Same verification: Master Data → Cloud → **Cek Semua**.

> **Custom domain on Vercel?** Step 1 of the checklist accepts it — the ping in
> step 2 is the real health check. The checklist header shows the exact
> endpoint the app is calling, so nothing is guesswork.

## Option C — Netlify (your current setup)

Already configured (`netlify.toml` + `netlify/functions/`). If the account was
paused for bandwidth, it resumes next billing cycle — or move to A/B and keep
Netlify as a mirror; both hosts can run against the same database simultaneously.

## Option D — PythonAnywhere

1. PA dashboard → **Files** → upload the repo (or `git clone` from a Bash console).
2. `pip3.10 install --user -r server/requirements.txt` (or via a virtualenv).
3. Build the frontend somewhere with Node (`npm install && npm run build`) and
   upload `dist/` next to `server/`.
4. Copy `server/pa_config.example.py` → `server/pa_config.py`, fill in
   `DATABASE_URL` (+ SMTP creds — Gmail works natively from Python).
5. **Web → Add web app → Manual configuration → Python 3.10**, then edit the
   WSGI file to:
   ```python
   import sys, os
   project_home = "/home/yourusername/vittoria-hr"
   sys.path.insert(0, project_home)
   os.chdir(project_home)
   from server.pa_api import app as application
   ```
6. Reload the web app → your app is live at `https://yourusername.pythonanywhere.com`
   (Flask serves the built frontend and both API routes from that one app).
7. The client auto-detects `*.pythonanywhere.com` and calls `/api/ops` + `/api/mail`.
   For any other host, set the URL manually: Master Data → Cloud → **Endpoint API**.

> Remember: PA **free** can't reach external Postgres hosts — the DB bridge
> needs the $5 tier (or run Postgres whitelisted/local). SMTP + static app work on free.

---

## SMTP per host (password-reset emails)

| Host | Mechanism | Setup |
|---|---|---|
| Netlify / Vercel | nodemailer → Gmail SMTP | App Password in env vars or Master Data → Email & SMTP |
| Cloudflare | Resend HTTP API (Workers can't do TCP) | env `RESEND_API_KEY`; fallback = simulated inbox |
| PythonAnywhere | Python `smtplib` → Gmail SMTP | `pa_config.py` — works natively |

## Custom / other hosts

Any server that implements `POST /api/ops` + `POST /api/mail` with the same
protocol works: point the app at it via **Master Data → Cloud → Endpoint API**
(saved per-browser). The protocol is documented at the top of
`netlify/functions/api.mjs`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Pill stuck on **SQL LOKAL** on a deployed URL | The host serves cached bundles — hard-refresh (Ctrl/Cmd+Shift+R); the service worker auto-updates open tabs on new deploys |
| **OFFLINE** with "Belum ada connection string" | Add `DATABASE_URL` (any host) or connect Vercel Postgres (`POSTGRES_URL` auto-injects), then redeploy |
| Checklist stuck on **Step 1** on a deployed URL | The deploy is running an older bundle — push the latest code and redeploy; the checklist now accepts custom domains and shows the active endpoint |
| Cloudflare: 404 on `/api` | Build didn't include `functions/` — confirm the repo root (not a subfolder) is the project source |
| Vercel: function cold-start slow first hit | Normal for edge; subsequent calls are fast |
| Two hosts, different data | They share one DB only if `DATABASE_URL` points to the same database — check both |
| Old host paused but data needed | Data lives in the DB + each browser's cache; deploy a new host and run "Siapkan Skema & Unggah Data" |
