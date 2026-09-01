# Vittoria HR — Hosting Guide (multi-host)

The app is **host-agnostic**: one codebase, four supported hosts. The browser
never talks to Postgres directly — each host runs a tiny API function
(`netlify/functions/api.mjs`, `functions/api.mjs`, `api/db.mjs`, or
`server/pa_api.py` — same wire protocol) that owns all SQL.

| Host | Free bandwidth | Functions | DB | Email | Best for |
|---|---|---|---|---|---|
| **Cloudflare Pages** ⭐ | **Unlimited** | Pages Functions (included) | Any Postgres (Neon free) | Resend (free 100/day) or fallback | escaping usage limits |
| **Vercel** | 100 GB/mo | Edge/Node (included) | Vercel Postgres / Neon | Gmail SMTP native | easiest switch |
| **Netlify** | 100 GB/mo | Netlify Functions | Netlify DB / Neon | Gmail SMTP native | what you have now |
| **PythonAnywhere** | limited (PA) | Flask web app | needs $5 tier* | Gmail SMTP native (smtplib) | Python-flavored ops |

\* PA **free** tier only allows outbound connections to whitelisted hosts —
Neon/Netlify-DB hostnames are not whitelisted, so the DB bridge needs the
$5/mo tier (or a whitelisted Postgres). SMTP and static serving work on free.

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
2. Environment variables: `DATABASE_URL` (+ optional `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM_NAME` for real Gmail email — works natively on Vercel's Node runtime).
3. Deploy. Routes: `api/db.mjs` → `/api/db`, `api/mail.mjs` → `/api/mail` (the DB route literally re-exports the Netlify handler — same code).
4. Same verification: Master Data → Cloud → **Cek Semua**.

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
| **OFFLINE** with "DATABASE_URL belum ada" | Add the env var in the host's dashboard, then redeploy |
| Cloudflare: 404 on `/api` | Build didn't include `functions/` — confirm the repo root (not a subfolder) is the project source |
| Vercel: function cold-start slow first hit | Normal for edge; subsequent calls are fast |
| Two hosts, different data | They share one DB only if `DATABASE_URL` points to the same database — check both |
| Old host paused but data needed | Data lives in the DB + each browser's cache; deploy a new host and run "Siapkan Skema & Unggah Data" |
