# Vittoria HR — Face Recognition & Geofenced Attendance (HRIS)

A mobile-first, installable HR management web app for warehouse operations: 128-D face-verified clock-in/out inside a GPS geofence, with leave workflows, payroll slips, org chart, multi-role access, audit trail, and full white-label tenant branding.

Built with **React 19 + TypeScript + Vite + Tailwind v4**, face-api.js, and Leaflet.

## ✨ Features

### 🔐 Authentication & Roles
- Email + password login with **JWT sessions** (8h access / 7d refresh) and live countdown
- Rate limiting: 5 failures → 30s lockout; 3 failures → security alert to admins
- **Device binding** (anti-fraud): an account locks to the device of its *first* login — Super Admin can release it
- Four roles with distinct surfaces: **Super Admin · Admin HR · Manajer · Karyawan**

| Capability | Karyawan | Manajer | Admin HR | Super Admin |
|---|:---:|:---:|:---:|:---:|
| Clock in/out (face + GPS) | ✅ own | ✅ own | ✅ | ✅ |
| Attendance history | own | own | all | all |
| Leave: request | ✅ | ✅ | ✅ | ✅ |
| Leave: approve (Tahap 1 → 2) | — | ✅ | ✅ | ✅ |
| Payroll: view slips | own | own | issue/withdraw | issue/withdraw |
| Manage users & salaries | — | — | ✅ | ✅ |
| Org chart: edit | view | view | ✅ | ✅ |
| Geofence, shifts, holidays | — | — | ✅ | ✅ |
| Branding, announcements, maintenance, backup | — | — | — | ✅ |
| Audit trail | — | — | view | view |

### ⏱️ Attendance Engine
- **Face**: 128-D descriptors (face-api.js, Δ ≤ 0.50) with offline dHash fallback + **2-frame liveness** check
- **Geofence**: Haversine distance vs configurable radius; **drag the HQ pin and radius handle on a real Leaflet/OSM map** to set the area
- GPS accuracy gate (≤ 60 m), duplicate guard, late/ overtime/ work-duration computation, photo evidence on every record
- Break tracking with live timer; manual supervisor fallback (audited)

### 📅 History & Reports
- Calendar with daily status (hadir/telat/cuti/libur/absen), monthly totals, payroll-ready work slip (printable)
- CSV + Excel export, daily/weekly/monthly report presets

### 🌴 Leave Management
- Four types with quotas (Tahunan 12, Sakit 10, Darurat 3, Melahirkan 90), attachments, **Karyawan → Manajer → HR** workflow, SLA chips, batch approve, notifications

### 💰 Payroll
- Auto-computed from attendance: prorated basic, per-day allowances, overtime from shift overrun, lateness/absence deductions; HR issues printable slips

### 🏛️ Organization
- Interactive org chart: add/edit/delete positions, link to employees (delete promotes children), read-only for staff

### 🎨 Tenant & Platform
- **White-label**: app name, tagline, logo, brand color presets — live everywhere; identity sharing via link/code for new devices
- Global announcement banner, maintenance mode, JSON backup, audit log, PWA install + service worker, WIB timezones, safe-area aware UI

## 🚀 Quick Start

```bash
npm install
npm run dev      # local development
npm run build    # production build → dist/
```

### Demo Accounts

| Role | Email | Password |
|---|---|---|
| Super Admin | `wh.leader.vt@gmail.com` | `super123` |
| Admin HR | `hr@vittoria.co.id` | `admin123` |
| Manajer | `budi.hartono@vittoria.co.id` | `123456` |
| Karyawan | `andi.saputra@vittoria.co.id` | `123456` |

> **Tip:** enable *Simulasi GPS* in **Aturan/Sistem** to test geofencing anywhere; use your real camera for face enrollment and matching.

## 🏗️ Architecture

```
src/
├── App.tsx                  # shell: dock, Fitur sheet, tour, install banner
├── lib/
│   ├── database.ts          # schema, seeds, payroll engine, brand presets, CSV
│   ├── store.tsx            # global store: session, GPS, audit, cross-tab sync
│   ├── faceEngine.ts        # face-api 128-D + dHash fallback + liveness hash
│   ├── geoUtils.ts          # Haversine, destination, bearing
│   ├── jwt.ts               # demo HS256 tokens (swap for real auth server)
│   └── device.ts            # device fingerprint for binding
├── components/              # camera, map, radar, org chart, toast, tour…
└── views/                   # login, home, absen, riwayat, cuti, gaji, org…
```

Python-spec mapping (original Streamlit brief): `app.py → App.tsx`, `database.py → lib/database.ts`, `face_engine.py → lib/faceEngine.ts`, `geo_utils.py → lib/geoUtils.ts`, `st.camera_input → CameraCapture`, `streamlit-js-eval → navigator.geolocation`, `pydeck → GeofenceMap (Leaflet)`.

> This build runs fully client-side with localStorage (demo layer for JWT/storage). For production, swap in an auth server, PostgreSQL + PostGIS per the schema documented in-app (Aturan → Arsitektur), and real push notifications.

## 🛣️ Roadmap

- PPh 21 + BPJS deductions & THR · overtime approval workflow
- Papan pengumuman with read receipts · WhatsApp alert gateway
- Multi-site geofences · understaffing alerts · WebAuthn biometric unlock

## 📄 License

MIT
