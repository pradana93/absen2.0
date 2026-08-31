# Run & Deploy Guide — Vittoria HR

The app is 100% static output + one optional serverless function, so you own it completely: run it from your laptop, deploy straight from GitHub, and the preview sandbox can never lock you out.

---

## 1. Run on your own machine (no preview, no cloud)

```bash
git clone https://github.com/USERNAME/vittoria-hr.git
cd vittoria-hr
npm install
npm run dev
```

Open **http://localhost:5173** — done. Camera & GPS work on `localhost` (it's a trusted origin).

- `npm run build` → production files in `dist/`
- `npm run preview` → serve the production build locally to test exactly what users get

## 2. Deploy to Netlify straight from GitHub (recommended)

The repo ships **`netlify.toml`** with the build command, publish dir, SPA redirects, Node version, and functions path — so Netlify configures itself:

1. Push this repo to GitHub
2. https://app.netlify.com → **Add new site → Import an existing project** → pick the repo
3. Verify it detected `npm run build` / `dist` (it will, from the toml) → **Deploy**
4. Live at `https://<name>.netlify.app` in ~2 minutes; **every `git push` redeploys automatically**

Rename the site under *Site configuration → Change site name* (e.g. `vittoria-hr.netlify.app`).

### If the page is ever blank on Netlify

Almost always the publish directory. Check *Site configuration → Build & deploy*:
- Build command must be `npm run build`
- Publish directory must be **`dist`** (never `/`, `public`, or `build`)
- Then **Clear cache and deploy site**, and hard-refresh (Cmd/Ctrl+Shift+R)

DevTools → Network telling you `main.tsx` 404s = publish dir is wrong (source files got served instead of the build).

## 3. Deploy on GitHub Pages only (no other service)

1. Push to GitHub → repo **Settings → Pages → Source: “GitHub Actions”**
2. The workflow in `.github/workflows/deploy-pages.yml` builds with `--base=./` on every push to `main`
3. Live at `https://USERNAME.github.io/REPO/`

## 4. Gmail SMTP — real password-reset emails

Browsers can't speak SMTP, so sending happens in **`netlify/functions/send-mail.mjs`** (free, deployed with the site).

1. Dedicated Gmail (e.g. `absensi.vittoria@gmail.com`) → enable **2-Step Verification**
2. Google Account → Security → **App passwords** → generate a 16-char password (normal Gmail passwords are rejected since 2022)
3. As Super Admin → **Master Data → Email & SMTP** → fill in → **Kirim Tes** → **Simpan**
4. *(Best practice)* Copy the env vars into Netlify (*Site settings → Environment variables*): `SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_FROM_NAME` — the function prefers env over in-app config, so credentials don't sit in device storage

If the function is unreachable or SMTP is off, the app falls back to the in-app simulated inbox and says so — nobody gets locked out. Local dev note: `npm run dev` doesn't run Netlify Functions; use `netlify login && netlify link && netlify dev` to test email locally.

## 5. The database, backups, moving devices

- Data lives in your browser: **IndexedDB** (a real `vittoria.sqlite` file) + localStorage hot-cache, per origin.
- **Backup:** Super Admin → Master Data → **Ekspor .sqlite** (genuine database file) and/or **Ekspor Semua (JSON)**.
- **Move to another device/browser/URL:** import the JSON via Master Data → Impor on the new origin; attendance history can travel as CSV.
- Open the `.sqlite` in *DB Browser for SQLite* or `sqlite3 vittoria.sqlite` — all 17 tables are there.

## 6. If the sandbox preview wipes again

The sandbox can reset; **your GitHub repo cannot**. Recovery is always:

```bash
git clone … && npm install && npm run dev
```

…and your Netlify URL never went down in the first place. Export a Master Data JSON whenever you make tenant changes you care about.

---

**Production path (Fase 2):** hosted Postgres (Neon/Netlify DB) using `server/schema.postgres.sql` — same tables, data-only migration from the exported `.sqlite`, and the UI switches from local write-through to API calls without a rewrite.
