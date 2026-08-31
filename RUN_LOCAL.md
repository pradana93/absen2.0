# Menjalankan & Hosting Vittoria HR — Tanpa Preview Sandbox

Panduan ini menjawab dua hal: **(1)** menjalankan app dari laptop Anda sendiri, dan **(2)** hosting gratis yang terhubung ke GitHub — jadi kalau sandbox preview ter-wipe, app Anda tetap hidup di URL Anda sendiri.

---

## 1. Jalankan di Laptop Sendiri (selamanya, offline-capable)

### Prasyarat
- **Node.js 18+** → https://nodejs.org (pilih LTS). Cek: `node -v`
- **Git** → https://git-scm.com

### Langkah
```bash
# 1. ambil kode dari GitHub Anda
git clone https://github.com/USERNAME/vittoria-hr.git
cd vittoria-hr

# 2. pasang dependensi (sekali saja)
npm install

# 3. mode development (hot reload)
npm run dev
# → buka http://localhost:5173

# 4. build produksi
npm run build        # hasil di folder dist/
npm run preview      # coba hasil build di http://localhost:4173
```

> **Catatan data:** data tersimpan di `localStorage` browser per origin. `localhost:5173` dan URL hosting adalah "dunia" yang berbeda — pindahkan tenant via **Master Data → Impor/Ekspor JSON**.

---

## 2. Hosting Gratis dari GitHub (PaaS-like, tanpa server)

App ini hasil build-nya **static files** (HTML/JS/CSS), jadi bisa di-host gratis dengan pola *connect repo → auto build → dapat URL*. Persis seperti PythonAnywhere, tapi untuk static app:

### 🥇 Rekomendasi: Netlify / Cloudflare Pages / Vercel

| | Netlify | Cloudflare Pages | Vercel |
|---|---|---|---|
| Gratis | ✅ 100 GB/bulan | ✅ bandwidth unlimited | ✅ 100 GB/bulan |
| Auto-deploy dari GitHub | ✅ | ✅ | ✅ |
| HTTPS otomatis (wajib kamera & GPS!) | ✅ | ✅ | ✅ |
| URL gratis | `nama-app.netlify.app` | `nama-app.pages.dev` | `nama-app.vercel.app` |
| Custom domain gratis | ✅ | ✅ | ✅ |

## 📘 Full Tutorial: Deploy to Netlify from GitHub

> The repo already ships `netlify.toml`, `public/_redirects`, and `.nvmrc` —
> Netlify auto-detects the build command, publish directory, SPA routing, and
> Node version from these files. **You should not have to type any settings.**

### Phase 0 — Prerequisites

- A GitHub account with your repository pushed to it
- A Netlify account (free): sign up at https://app.netlify.com/signup (use "Sign up with GitHub")

### Phase 1 — Put the code on GitHub (skip if done)

```bash
git init
git add -A
git commit -m "Vittoria HR app"
git branch -M main
git remote add origin https://github.com/USERNAME/vittoria-hr.git
git push -u origin main
```

### Phase 2 — Connect Netlify to the repo

1. Open https://app.netlify.com → **Add new site** → **Import an existing project**
2. Choose **GitHub** → authorize if asked → pick your repository
3. On the "Deploy settings" screen you should see (auto-read from `netlify.toml`):
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - If the fields are empty, type exactly those two values. **Never** set the publish directory to `/`, `build`, or `public` — that serves the source files and produces a blank page.
4. Click **Deploy vittoria-hr**
5. Wait ~1–2 minutes. The log must end with `✓ built in ...s` (Vite's success line). If it does, your site is live at `https://<random-name>.netlify.app`

### Phase 3 — Verify it actually works

Open your new URL and check, in order:

- [ ] The login screen renders (logo, WIB clock, Gudang picker) — **not a blank page**
- [ ] Open DevTools (F12) → Console: no red errors; Network tab: `main.tsx` must **not** appear as a 404 (if it does, Phase 2 step 3 was wrong)
- [ ] Log in as Super Admin (`wh.leader.vt@gmail.com` / `super123`)
- [ ] Open the Absen tab and allow camera + location — both require the HTTPS that Netlify provides automatically

### Phase 4 — Bring your company data along

The Netlify URL is a **new origin**, so its `localStorage` starts empty (the app re-seeds demo data). To carry your real setup over:

1. In the old environment (sandbox/preview): log in as Super Admin → **Master Data** → **Ekspor Semua (JSON)**
2. On the Netlify URL: Super Admin → **Master Data → Impor** → pick the JSON file → apply
3. Your tenants, gudangs, employees, shifts, quotas, and salary defaults arrive intact. (Attendance history can be exported/imported as CSV for the records.)

### Phase 5 — Make it yours (optional)

- **Rename the site:** Site configuration → **Change site name** → e.g. `vittoria-hr.netlify.app`
- **Custom domain:** Domain management → **Add a domain** → follow the DNS steps; HTTPS renews automatically
- **Every future deploy is automatic:** `git push` → Netlify rebuilds → live in ~90 s. Watch it in the **Deploys** tab.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **Blank white page** | Publish directory wrong → source `index.html` served, `/src/main.tsx` 404s | Set publish dir to `dist` (Site configuration → Build & deploy), redeploy |
| Blank page, console shows a JS error | Stale browser cache/SW after a redeploy | Hard refresh (Ctrl/Cmd+Shift+R); unregister the service worker in DevTools → Application |
| 404 / blank on refresh | SPA redirect missing | Already fixed by `netlify.toml` + `public/_redirects` in this repo — redeploy |
| Build fails: `vite: not found` or engine errors | Node version too old | Already pinned to Node 20 via `netlify.toml` + `.nvmrc` — redeploy |
| Camera says "not allowed" | Browser permission or non-HTTPS context | Grant camera permission for the site; confirm the URL starts with `https://` |
| GPS stuck on "mencari…" | Location permission denied, or desktop without GPS | Allow location; or enable **Simulasi GPS** in Sistem for demos |
| Deploy log fails at `npm install` | Lockfile conflict | In Netlify: Site configuration → Build → clear cache and redeploy |
| "Powered by Netlify" badge near the dock | Free-plan branding overlay (can't be hidden — Netlify ToS) | Already handled: the dock auto-lifts above it (`--dock-lift` in `src/index.css`). To remove the badge entirely, upgrade to the Pro plan |

Cloudflare Pages & Vercel: alurnya identik (import repo → framework preset "Vite" → deploy; `netlify.toml` diabaikan — set build `npm run build`, output `dist` di UI mereka).

### 🥈 GitHub Pages (jika ingin tetap 100% di GitHub)

GitHub Pages melayani dari *subpath* (`username.github.io/nama-repo/`), jadi asset path harus relatif. Tanpa menyentuh config, pakai override CLI:

```bash
npm run build -- --base=./
```

Lalu deploy folder `dist`:

**Opsi A — repo pengguna (`username.github.io`):** paling gampang, app tampil di root.
```bash
git clone https://github.com/USERNAME/USERNAME.github.io.git
npm run build
cp -r dist/* USERNAME.github.io/
cd USERNAME.github.io && git add -A && git commit -m "deploy" && git push
# → https://USERNAME.github.io
```

**Opsi B — GitHub Actions (sudah termasuk di repo ini):**
Workflow siap pakai sudah ter-commit di `.github/workflows/deploy-pages.yml` — tidak perlu membuat apa pun. Cukup:

1. Aktifkan sekali di GitHub UI: **Settings → Pages → Build and deployment → Source: "GitHub Actions"**
2. Push ke `main` → tab **Actions** memperlihatkan build berjalan → selesai

URL live: `https://USERNAME.github.io/NAMA-REPO/` — dan setiap push berikutnya otomatis deploy ulang.

---

## 3. Checklist Sebelum Go-Live ke Tim Gudang

- [ ] **HTTPS aktif** (otomatis di semua platform di atas) — kamera & GPS menolak jalan di `http://`
- [ ] Buka URL di HP karyawan → izinkan **kamera** & **lokasi**
- [ ] HP Android: buka URL → menu browser → **"Tambahkan ke layar utama"** (app terpasang seperti aplikasi asli)
- [ ] Login sebagai Super Admin → **Master Data** → ekspor JSON sebagai cadangan pertama
- [ ] Atur radius geofence per gudang via peta (Aturan)
- [ ] Buat akun karyawan via Pengguna → serahkan email + kata sandi awal → karyawan ambil foto tanda tangan saat login pertama

## 4. Kalau Preview Sandbox Ter-Wipe Lagi

Tenang — yang ter-wipe hanya *sandbox*, bukan repo GitHub Anda:
1. `git clone` ulang → `npm install` → `npm run dev` (app kembali utuh)
2. Data tenant: impor ulang JSON dari **Master Data** (atau dari URL hosting yang tetap hidup)

Selama kode sudah di-push ke GitHub dan (opsional) di-deploy ke Netlify/Cloudflare/Vercel, app ini milik Anda sepenuhnya — tidak bergantung pada preview mana pun.
