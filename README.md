# Vittoria HR — Face Recognition & Geofenced Attendance (HRIS)

A mobile-first, installable HR management web app for warehouse operations: **128-D face-verified** clock-in/out inside a **GPS geofence**, across **multiple gudang/areas**, with leave workflows, payroll slips, org charts, an announcement board, a live ops control room, a Super-Admin-only **Master Data vault with a real embedded SQLite engine**, and Gmail SMTP password resets.

Built with **React 18 + TypeScript + Vite + Tailwind v4**, face-api.js, Leaflet, and sql.js (SQLite → WASM).

---

## ✨ Feature map

| Area | What's inside |
|---|---|
| **Auth & roles** | Email + password login after choosing a **Gudang/Area**, JWT sessions (8h access / 7d refresh), rate limiting (5 fails → 30s lock), 4 roles: Super Admin · Admin HR · Manajer · Karyawan |
| **Attendance** | Face verification (128-D descriptors, Δ ≤ 0.50, offline dHash fallback), **2-frame liveness** check, Haversine geofence per gudang, GPS accuracy gate, duplicate guard, late/overtime/work-duration math, photo evidence on every record |
| **Sites** | Each Gudang has its own geofence (drag pin + radius handle on a real OSM map), its own org chart, roster, and attendance stream |
| **Device security** | An account binds to the device of its **first login**; foreign devices are refused + audited; Super Admin releases bindings |
| **Leaves** | 4 types with quotas, attachments, **Karyawan → Manajer → HR** approval chain, SLA chips, batch approve, notifications |
| **Payroll** | Auto-computed slips (prorated basic, per-day allowances, OT from shift overrun, lateness deductions), printable, HR-issued |
| **Master Data** (Super Admin only) | Tenant, sites, employee directory, departments, shifts, reference tables — edit, **CSV/JSON export**, JSON import, integrity checksum, **read-only SQL console**, `.sqlite` file export, VACUUM |
| **Pengumuman** | HR posts per-gudang or company-wide; staff acknowledge; HR sees a live read-receipt bar |
| **Ops** | Ruang Kendali (live dark control room: clock, headcounts, roster wall, event feed), dashboard KPIs, MVP leaderboard, 7-day trend, department chart, anomaly flags |
| **Email** | Real password-reset emails via **Gmail SMTP** through a Netlify Function (env-var credentials), with in-app fallback |
| **Platform** | PWA manifest + service worker, WIB timezones, safe-area aware, reduced-motion support, crash guard + error net |

## 🗄️ The database — where does it live?

**Fase 1 (current): embedded SQLite in the browser.**
- Engine: [sql.js](https://github.com/sql-js/sql.js) — SQLite compiled to WebAssembly (~53 KB gz chunk, loaded lazily after first paint).
- Storage: a real `vittoria.sqlite` byte array persisted to **IndexedDB** (`vittoria-sql` → `main.sqlite`) on every commit; localStorage remains the synchronous hot-cache.
- Schema: 17 normalized tables with foreign keys + indexes (`src/lib/sql/schema.ts`); every app mutation writes through parameterized SQL.
- Portability: Super Admin → Master Data → **Ekspor .sqlite** downloads the genuine database file (open it in DB Browser for SQLite, DBeaver, `sqlite3` CLI).
- Scope: per browser/device/origin. Cross-device sync = Fase 2.

**Fase 2 (roadmap): hosted Postgres.** `server/schema.postgres.sql` ships the identical schema for Neon/Netlify DB behind API functions — the migration is data-only (`pgloader` from the exported `.sqlite`), no UI rewrite.

## 🔐 Role matrix

| Capability | Karyawan | Manajer | Admin HR | Super Admin |
|---|:---:|:---:|:---:|:---:|
| Choose gudang + clock in/out (face + GPS) | ✅ | ✅ | ✅ | ✅ |
| Own history / slips / leave requests | ✅ | ✅ | ✅ | ✅ |
| Approve leave (Tahap 1 → 2) | — | ✅ | ✅ | ✅ |
| Manage users, shifts, payroll issue | — | — | ✅ | ✅ |
| Geofence editor, holidays, branding | — | — | ✅ | ✅ |
| **Master Data vault + SQL console + .sqlite export** | — | — | 🔒 | ✅ |
| Device unbind, maintenance mode, SMTP config | — | — | — | ✅ |

## 🚀 Quick start

```bash
npm install
npm run dev      # local development → http://localhost:5173
npm run build    # production build → dist/
```

### Demo accounts

| Role | Gudang | Email | Password |
|---|---|---|---|
| Super Admin | semua area | `wh.leader.vt@gmail.com` | `super123` |
| Admin HR | semua area | `hr@vittoria.co.id` | `admin123` |
| Manajer | Vittoria | `budi.hartono@vittoria.co.id` | `123456` |
| Karyawan | Vittoria / Batu Ceper | `andi.saputra@vittoria.co.id` (dkk.) | `123456` |

New employees take their **base photo at first login** (HR no longer captures it at account creation).

The app is **host-agnostic** — see **`HOSTING.md`** for step-by-step deploys to **Cloudflare Pages** (unlimited bandwidth — recommended), **Vercel**, **Netlify**, or **PythonAnywhere** (Flask port included in `server/`), plus the portable-data migration recipe, per-host SMTP setup, and troubleshooting. **`RUN_LOCAL.md`** covers running on your laptop and the Netlify-specific details.

## 📦 Tech stack

React 18 · TypeScript · Vite 6 · Tailwind CSS v4 · face-api.js (128-D descriptors) · Leaflet + OpenStreetMap · sql.js (SQLite/WASM) · nodemailer (Netlify Function) · xlsx

## 🛣️ Roadmap

- Fase 2: hosted Postgres + API functions (cross-device sync)
- PPh 21 + BPJS deductions, THR generator
- Shift-swap requests · multi-site heatmap · WebAuthn biometric unlock

## 📄 License

MIT
