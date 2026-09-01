# Vittoria HR — Run & Deploy Guide (Netlify only)

This project deploys to **Netlify** and nothing else. The GitHub Pages
workflow was **removed from the repo** — if you were getting "run failed"
emails from GitHub Actions, they stop as soon as you push this version
(the workflow file `.github/workflows/deploy-pages.yml` no longer exists).

> Tip: to silence any leftover notifications, also check
> GitHub → repo → **Settings → Pages** and make sure nothing is enabled there.

---

## 1. Run on your laptop

```bash
git clone https://github.com/USERNAME/vittoria-hr.git
cd vittoria-hr
npm install
npm run dev      # → http://localhost:3000
```

Build for production:

```bash
npm run build    # → dist/  (this exact folder is what Netlify serves)
npm run preview  # test the production build locally
```

## 2. Deploy to Netlify (one time)

The repo ships `netlify.toml`, so **every setting is auto-detected** — you
should never have to type build configuration:

1. https://app.netlify.com → **Add new site → Import an existing project**
2. Choose **GitHub** → pick the repository
3. Confirm the auto-filled settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
   - Node version: 20 (pinned via `.nvmrc` + `netlify.toml`)
4. **Deploy** — live at `https://<name>.netlify.app` in ~2 minutes
5. Every future `git push` redeploys automatically (watch the **Deploys** tab)

Optional polish: Site configuration → **Change site name** (e.g.
`vittoria-hr.netlify.app`) or add a custom domain — HTTPS renews automatically.

## 3. Shared team database — Netlify DB (Postgres)

This is what turns the app from "one device" into "the whole warehouse shares
one database". The browser never touches Postgres directly — a bundled Netlify
Function (`netlify/functions/api.mjs`) runs parameterized SQL on its behalf.

> ⚠️ **Credential hygiene — read first**
> The connection string (`postgresql://netlifydb_owner:…@…db.netlify.com/…`)
> is the **master key** to your data:
> - Put it **only** in Netlify environment variables (steps below). Never in
>   the repo, never in client code — `.env*` is git-ignored as a second guard.
> - If it was ever pasted into a chat, ticket, or log, **rotate it**:
>   dashboard → your DB → *Roles / Connection string* → reset password, then
>   update the env var.
> - The string in this repo's history (if any) must be purged — treat any
>   leaked string as burned and rotate.

1. **Create the DB** (you already did): Netlify dashboard → your site →
   *Storage / Databases* → add a **Netlify DB (Postgres)**.
2. **Make the connection string available to the function.** Either:
   - **Linked DB (recommended):** when the DB is attached to the site, Netlify
     injects `DATABASE_URL` automatically — nothing to type; or
   - **Manual env var:** site → *Site configuration → Environment variables →
     Add variable* → key `DATABASE_URL`, value = the full
     `postgresql://…?sslmode=require` string, applies to *All scopes*.
3. **Push & redeploy** — the `api` function goes live with the deploy.
4. In the app: **Super Admin → Master Data → "Cloud (Netlify DB)"** →
   click **"Siapkan Skema & Unggah Data"**. The function creates all tables
   (idempotent — safe to re-run) and uploads your current local data.
5. From then on, every change (clock-in, leave, new employee…) is written
locally *and* pushed to Postgres (~0.8 s debounce), and every device
hydrates from Postgres on load. The header strip shows a green
**ONLINE** when connected to the server DB, red **OFFLINE** when a
deployed site can't reach it, and neutral **SQL LOKAL** only on
preview/localhost (where cloud functions can't run).
Useful operations in that same panel: **Tarik dari Cloud Sekarang**
(force re-pull), per-table row counts, last-sync time, and a status badge.

Local development against the real DB: `netlify login && netlify link &&
netlify dev` — this runs the function locally with `DATABASE_URL` injected.
Plain `npm run dev` has no function, so the app simply stays in local mode.

Honest scope notes (Fase 2): payroll slips remain device-local, sync is
last-write-wins per collection (fine for one warehouse team), and the API
guard is origin + session-presence — cryptographic JWT verification
server-side is the Fase 3 upgrade. The full schema reference lives in
`server/schema.postgres.sql` (matches the function's DDL exactly).

## 4. Real password-reset emails (Gmail SMTP)

Handled by the bundled Netlify Function (`netlify/functions/send-mail.mjs`) —
it activates automatically with the deploy; no extra setup.

1. Dedicated Gmail (e.g. `absensi.vittoria@gmail.com`) → enable **2-Step Verification**
2. Create an **App Password** (Security → App passwords → Mail) — regular Gmail
   passwords are rejected by Google since 2022
3. In the app: **Super Admin → Master Data → Email & SMTP** → fill host
   `smtp.gmail.com`, port `465`, account + App Password → **Kirim Tes** → **Simpan**
4. *(Best practice)* **Salin Env Vars** → paste into Netlify →
   *Site settings → Environment variables* → redeploy. The function prefers
   env vars, so credentials never live in the browser.

If SMTP is off or the function is unreachable, the app gracefully falls back
to the in-app simulated inbox — nobody is ever locked out.

## 5. Your data: backup & moving devices

With **Netlify DB connected** (section 3), all devices share one Postgres
database automatically — nothing to move.

Without it, data lives in each browser's storage (localStorage hot-cache + a
real SQLite file in IndexedDB). To move a company between devices/URLs:

1. Old environment: **Super Admin → Master Data → Ekspor** (JSON or `.sqlite`)
2. New environment: **Master Data → Impor** → pick the file

Attendance history exports as CSV/Excel from the **Riwayat** view.

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| Blank page after deploy | Site configuration → Build & deploy → verify publish dir is `dist`, then **Clear cache and deploy site**; hard-refresh (Ctrl/Cmd+Shift+R) |
| "GitHub Actions run failed" emails | Already fixed — the Pages workflow is deleted in this version; push once to confirm |
| Camera/GPS refused | Browsers require HTTPS — Netlify provides it automatically; grant camera + location permissions for the site |
| GPS stuck on "mencari…" | Desktops often have no GPS — enable **Simulasi GPS** in Aturan/Sistem for demos |
| Stale UI after a deploy | The service worker caches assets; hard-refresh once, or unregister it in DevTools → Application |
| Email test fails | Check the App Password (not your Gmail password); Gmail may log the attempt — approve it in Google Account security alerts |
| Cloud stays "OFFLINE / LOKAL" | DB must be *linked to the site* (so `DATABASE_URL` is injected) and the site *redeployed* (so the `api` function exists); open the Netlify URL, not localhost |
| "Siapkan Skema" errors | Open Netlify → Functions → `api` → logs; the most common cause is a missing `DATABASE_URL` env var (link the DB) |
| Data differs between two devices | On each device: Master Data → Cloud → **Tarik dari Cloud Sekarang**; sync is last-write-wins per collection |

---

That's the whole pipeline: `git push` → Netlify builds → live. No other
services, no other accounts, nothing to babysit.
