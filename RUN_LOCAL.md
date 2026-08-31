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

**Langkah (Netlify, paling sederhana):**
1. Buka https://app.netlify.com → **Add new site → Import an existing project**
2. Pilih repo GitHub Anda
3. Build settings (biasanya terdeteksi otomatis):
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Klik **Deploy** → dapat URL `https://nama-acak.netlify.app` (bisa diganti)
5. Selesai — setiap `git push` ke `main` otomatis deploy ulang

Cloudflare Pages & Vercel: alurnya identik (import repo → framework preset "Vite" → deploy).

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
