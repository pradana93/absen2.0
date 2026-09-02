# 🗄️ Setup Database Cloud - Vittoria HR

Panduan lengkap untuk menghubungkan aplikasi Vittoria HR ke database Supabase agar dapat diakses secara live oleh banyak pengguna di berbagai perangkat.

## 🎯 Mengapa Perlu Setup Database Cloud?

Tanpa database cloud, data Vittoria HR hanya tersimpan di **localStorage browser** perangkat Anda. Ini berarti:
- ❌ Data tidak bisa diakses dari device lain
- ❌ Data hilang jika cache browser dibersihkan
- ❌ Tidak ada multi-user access
- ❌ Tidak ada backup otomatis

**Dengan database cloud (Supabase):**
- ✅ Data tersimpan di cloud, bisa diakses dari device manapun
- ✅ Multi-user: semua staff bisa login dari HP masing-masing
- ✅ Live sync: perubahan langsung terlihat di semua device (< 1 detik)
- ✅ Backup & recovery lebih mudah
- ✅ Offline-first tetap berfungsi (SQLite lokal jadi cache)

---

## 📋 Prasyarat

Sebelum mulai, pastikan Anda sudah memiliki:

1. **Akun Supabase** (gratis) - Daftar di [supabase.com](https://supabase.com)
2. **Project Supabase** sudah dibuat (pilih region terdekat, misal `ap-southeast-1` untuk Indonesia)
3. **Connection String Transaction Pooler** (port 6543) sudah tersedia

> ⚠️ **PENTING**: Gunakan **Transaction Pooler** (port 6543), BUKAN Direct Connection (port 5432). Serverless functions (Vercel/Netlify) memerlukan pooling untuk menghindari kehabisan koneksi.

---

## 🔧 Langkah-langkah Setup

### Langkah 1: Dapatkan Connection String dari Supabase

1. Buka dashboard Supabase → Pilih project Anda
2. Masuk ke **Settings** (ikon gear di sidebar kiri bawah)
3. Pilih **Database** → Scroll ke bagian **"Connection string"**
4. Klik tab **"Connection pooler"** (BUKAN "Direct connect")
5. Copy connection string yang berbentuk seperti ini:
   ```
   postgresql://postgres.[ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
   ```
6. Ganti `[password]` dengan password database Anda (yang Anda set saat buat project)

**Contoh connection string yang benar:**
```
postgresql://postgres.abc123xyz:MySecurePass123@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

> ⚠️ Pastikan:
> - Port adalah **6543** (bukan 5432)
> - Username berbentuk `postgres.xxxxx` (bukan hanya `postgres`)
> - Password sudah diganti dengan yang benar

---

### Langkah 2: Setup Melalui Wizard (Recommended)

Cara termudah adalah menggunakan **Setup Wizard** yang sudah tersedia di aplikasi:

1. **Login sebagai Super Admin** di Vittoria HR
2. Buka menu **Master Data** (hanya Super Admin yang bisa akses)
3. Di bagian **"Cloud — Netlify DB (Postgres)"**, klik tombol:
   ```
   🗄️ Setup Database Cloud (Wizard)
   ```
4. Ikuti 5 langkah wizard:
   - **Step 1**: Baca penjelasan & prasyarat
   - **Step 2**: Paste connection string yang sudah dicopy
   - **Step 3**: Test koneksi & inisialisasi schema otomatis
   - **Step 4**: Tarik/migrasi data ke cloud
   - **Step 5**: Aktivasi live sync

5. Setelah selesai, status cloud akan berubah menjadi **ONLINE** (indikator hijau)

---

### Langkah 3: Verifikasi Koneksi

Setelah setup, verifikasi bahwa semuanya berjalan:

1. **Cek Status Cloud** di Master Data View:
   - Indikator harus hijau bertuliskan **"ONLINE"**
   - Jumlah baris cloud (`cloud rows`) harus sama dengan lokal
   - Timestamp sinkron terakhir harus baru

2. **Test Ping** dengan klik tombol **"Cek Semua"**:
   - Semua checklist harus hijau (✓)
   - Server version harus muncul
   - Schema ready: Ya
   - 15 tabel harus siap

3. **Test Multi-Device**:
   - Buka aplikasi di device/browser lain (HP atau incognito mode)
   - Buka URL yang sama (hasil deploy Vercel)
   - Login dengan akun yang sudah dibuat
   - Data harus langsung muncul tanpa perlu input ulang

---

## 🔐 Keamanan & Privacy

### Bagaimana Connection String Disimpan?

- Connection string disimpan **terenkripsi di localStorage** browser Super Admin
- **Tidak dikirim ke server** kecuali saat request API ke fungsi serverless
- Hanya digunakan untuk koneksi ke database Supabase Anda sendiri
- Supabase tidak bisa membaca data Anda tanpa connection string ini

### Siapa yang Bisa Akses Data?

- Hanya user yang **login dengan akun valid** dari database
- Session token diperlukan untuk setiap request API
- Device binding opsional bisa diaktifkan untuk keamanan ekstra

---

## 🛠️ Troubleshooting

### ❌ "Koneksi gagal" atau "NO_DB_URL"

**Penyebab:**
- Connection string salah format
- Password belum diganti di connection string
- Port bukan 6542 (harus 6543)

**Solusi:**
1. Ulangi Step 1, pastikan copy dari tab **"Connection pooler"**
2. Cek apakah password sudah diganti (bukan `[password]` literal)
3. Pastikan port `:6543` ada di connection string

---

### ❌ "Schema belum dibuat" atau "Tabel tidak ditemukan"

**Penyebab:**
- Database masih kosong (belum pernah di-init)

**Solusi:**
1. Di Master Data View, klik **"Siapkan Skema & Unggah Data (Manual)"**
2. Atau ulangi wizard dari Step 3
3. Schema akan dibuat otomatis (aman diulang berkali-kali)

---

### ❌ "Timeout" atau "ECONNREFUSED"

**Penyebab:**
- Menggunakan Direct Connection (port 5432) bukannya Pooler
- Firewall/network blocking koneksi ke Supabase

**Solusi:**
1. Pastikan pakai **Transaction Pooler** (port 6543)
2. Coba dari network lain (WiFi vs mobile data)
3. Redeploy aplikasi di Vercel

---

### ❌ "Origin tidak diizinkan"

**Penyebab:**
- CORS policy memblokir request dari domain yang tidak dikenal

**Solusi:**
- Normal terjadi di localhost/preview
- Deploy ke Vercel dan buka URL production
- Atau tambahkan domain custom di environment variables

---

## 📊 Monitoring & Maintenance

### Cek Status Database

Di Master Data View, Anda bisa melihat:
- **Rows di cloud**: Total baris data tersimpan
- **Per-table counts**: Jumlah baris per tabel (employees, logs, leaves, dll)
- **Last sync**: Waktu sinkronisasi terakhir
- **Presence active**: User/device yang sedang online

### Backup & Restore

**Backup Manual:**
1. Di Master Data View → bagian "SQL Engine"
2. Klik **"Download .sqlite"** untuk export full database
3. Simpan file `.sqlite` sebagai backup

**Restore dari Backup:**
1. Upload file `.sqlite` via fitur import
2. Atau gunakan `pg_restore` jika punya backup Postgres

### Update Schema

Jika ada update schema di masa depan:
1. Wizard akan mendeteksi versi schema
2. Otomatis migrate ke versi terbaru
3. Data existing tetap aman (backward compatible)

---

## 🚀 Go-Live Checklist

Sebelum mengumumkan ke semua staff, pastikan:

- [ ] Connection string sudah terpasang & tested
- [ ] Status cloud **ONLINE** (hijau)
- [ ] Semua 15 tabel siap (schema ready)
- [ ] Data sudah ter-upload ke cloud
- [ ] Test login dari device kedua berhasil
- [ ] Test absensi (check-in/check-out) tersinkron
- [ ] Test cuti & approval berfungsi
- [ ] Backup manual sudah dilakukan

---

## 📞 Support

Jika masih mengalami kendala:

1. **Dokumentasi Lengkap**: Lihat `HOSTING.md` dan `README.md`
2. **Supabase Docs**: [supabase.com/docs](https://supabase.com/docs)
3. **Vercel Deployment**: Pastikan env vars sudah benar di Vercel dashboard
4. **Logs**: Cek browser console (F12) untuk error detail

---

## 💡 Tips Best Practices

1. **Simpan connection string di tempat aman** (password manager)
2. **Enable Row Level Security (RLS)** di Supabase untuk extra security (Fase 3)
3. **Monitor usage** di Supabase dashboard (free tier cukup untuk SME)
4. **Regular backup** download .sqlite bulanan
5. **Test disaster recovery**: coba restore dari backup di staging

---

**Happy syncing! 🎉**

Setelah setup ini, Vittoria HR Anda sekarang adalah aplikasi **multi-user, real-time, cloud-connected** yang siap dipakai satu perusahaan!
