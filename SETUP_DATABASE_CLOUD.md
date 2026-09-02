# 🗄️ Setup Database Cloud - Vittoria HR

Panduan lengkap untuk menghubungkan aplikasi Vittoria HR ke database Supabase PostgreSQL agar dapat diakses secara live oleh banyak pengguna dari berbagai device.

## 🎯 Manfaat Setup Cloud

Setelah setup selesai, aplikasi Anda akan:
- ✅ **Multi-user access**: Semua staff bisa login dari device masing-masing
- ✅ **Live sync**: Perubahan data langsung terlihat di semua device
- ✅ **Data persistent**: Data tidak hilang saat ganti device/browser
- ✅ **Backup otomatis**: Data tersimpan aman di cloud Supabase
- ✅ **Real-time presence**: Lihat siapa yang sedang aktif di dashboard

## 📋 Prasyarat

Sebelum memulai, pastikan Anda sudah memiliki:

1. **Akun Supabase** (gratis) di [supabase.com](https://supabase.com)
2. **Project Supabase** sudah dibuat
3. **Connection string** Transaction Pooler (port 6543) sudah tersedia

## 🔑 Cara Mendapatkan Connection String

Ikuti langkah-langkah berikut untuk mendapatkan connection string dari Supabase:

### Langkah 1: Login ke Dashboard Supabase
1. Buka [supabase.com](https://supabase.com)
2. Login dengan akun Anda
3. Pilih project yang ingin digunakan

### Langkah 2: Buka Settings → Database
1. Di sidebar kiri, klik **Settings** (ikon gear)
2. Pilih **Database**
3. Scroll ke bagian **"Connection string"**

### Langkah 3: Pilih Transaction Pooler
1. Klik tab **"Connection pooler"** (BUKAN "Direct connect")
2. Pastikan port-nya **6543** (bukan 5432)
3. Copy connection string yang ditampilkan

Format connection string:
```
postgresql://postgres.[project-ref]:[password]@aws-[region].pooler.supabase.co:6543/postgres?pgbouncer=true
```

**⚠️ PENTING:**
- Gunakan **Transaction Pooler** (port 6543), bukan Direct Connection (port 5432)
- Transaction pooler lebih efisien untuk serverless functions
- Mencegah kehabisan koneksi saat traffic tinggi

## 🚀 Setup Wizard - Langkah demi Langkah

### Step 1: Buka Setup Wizard
1. Login ke aplikasi Vittoria HR sebagai **Super Admin**
2. Buka menu **Master Data**
3. Di section **"Cloud"**, klik tombol **"🗄️ Setup Database Cloud (Wizard)"**

### Step 2: Input Connection String
1. Paste connection string yang sudah dicopy dari Supabase
2. Pastikan format benar dan mengandung `:6543`
3. Klik **"Simpan & Test Koneksi"**

### Step 3: Test Koneksi
Aplikasi akan otomatis:
- ✅ Test koneksi ke server Supabase
- ✅ Inisialisasi schema `vittoria` (jika belum ada)
- ✅ Membuat semua tabel yang diperlukan
- ✅ Verifikasi koneksi berhasil

Jika sukses, Anda akan melihat:
- Server version
- Schema ready: Ya
- Tables created: 17 tabel
- Response time

### Step 4: Migrasi Data
Aplikasi akan menarik data dari cloud:
- Jika cloud kosong: data lokal akan di-upload
- Jika cloud sudah ada data: data akan di-download ke lokal

Status yang ditampilkan:
- Total rows di cloud
- Tables populated
- Data version

### Step 5: Aktivasi Live Sync
Klik **"Aktivasi Live Sync"** untuk:
- Mengaktifkan sinkronisasi otomatis
- Mengaktifkan presence tracking
- Menyiapkan background sync

## ✅ Setup Selesai!

Setelah wizard selesai:
1. **Share URL aplikasi** ke staff Anda
2. Staff bisa **login dari device masing-masing**
3. Semua data akan **tersinkronisasi otomatis**
4. Perubahan akan **langsung terlihat** di semua device

## 🔧 Troubleshooting

### ❌ "Connection failed"
**Penyebab:**
- Connection string salah
- Password salah
- Firewall memblokir koneksi

**Solusi:**
1. Cek ulang connection string dari Supabase
2. Pastikan menggunakan Transaction Pooler (port 6543)
3. Reset password di Supabase jika perlu
4. Coba copy-paste ulang (jangan ketik manual)

### ❌ "Schema initialization failed"
**Penyebab:**
- User tidak punya permission CREATE SCHEMA
- Database penuh

**Solusi:**
1. Pastikan menggunakan user `postgres` atau user dengan privilege cukup
2. Cek quota database di dashboard Supabase
3. Upgrade plan jika perlu

### ❌ "Migration failed"
**Penyebab:**
- Koneksi terputus saat migrasi
- Data lokal corrupt

**Solusi:**
1. Test koneksi ulang di Step 3
2. Refresh halaman dan ulangi migrasi
3. Jika masih gagal, reset database lokal (backup dulu)

### ❌ "Live sync tidak aktif"
**Penyebab:**
- Connection string belum disimpan
- API endpoint tidak terjangkau

**Solusi:**
1. Pastikan sudah klik "Aktivasi Live Sync" di Step 5
2. Cek console browser untuk error
3. Pastikan hosting (Vercel/Netlify) sudah deploy latest code

## 🔒 Keamanan

Connection string disimpan:
- ✅ **Terenkripsi** di localStorage browser
- ✅ **Tidak dikirim** ke server kecuali saat request API
- ✅ **Hanya bisa diakses** oleh Super Admin
- ✅ **HTTPS only** saat transmisi

Best practices:
- Jangan share connection string secara publik
- Rotate password secara berkala
- Gunakan Row Level Security (RLS) di Supabase untuk proteksi tambahan

## 📊 Monitoring

Cek status cloud di Master Data View:
- **Status**: on/off/connecting/error
- **Rows**: jumlah total baris di cloud
- **Tables**: jumlah tabel yang terisi
- **Last Sync**: waktu sinkronisasi terakhir
- **Presence**: jumlah device yang sedang aktif

## 🔄 Update Connection String

Untuk mengganti connection string:
1. Buka Master Data → Cloud
2. Klik "Setup Database Cloud (Wizard)"
3. Ulangi dari Step 2 dengan connection string baru
4. Data akan disinkronisasi ulang

## 🆘 Butuh Bantuan?

Jika mengalami masalah:
1. Cek console browser (F12) untuk error detail
2. Screenshot error message
3. Hubungi support dengan info:
   - Hosting yang digunakan (Vercel/Netlify/etc)
   - Browser & versi
   - Error message lengkap
   - Screenshot wizard step yang bermasalah

---

**Dibuat untuk Vittoria HR v2.0+**
**Dokumentasi terakhir update:** September 2025
