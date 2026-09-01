# Vittoria HR — Face Recognition & Geofenced Attendance

[![License: MIT](https://img.shields.io/badge/License-MIT-f07300.svg)](./LICENSE)
[![React 18](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6.svg)](https://www.typescriptlang.org)
[![DB](https://img.shields.io/badge/DB-SQLite%20%2B%20Postgres-159a6d.svg)](#-architecture--the-database-story)
[![PWA](https://img.shields.io/badge/PWA-installable-7a4fc0.svg)](#-platform)

A mobile-first, installable HRIS for warehouse operations. Employees pick
their **Gudang (warehouse)**, then clock in with their face inside a GPS
geofence — every record carries photo evidence, lands in a real SQL engine,
and syncs live to the team's shared Postgres database.

```
                    ┌─ 128-D face encoding (face-api.js)
   selfie ──────────┤
                    └─ liveness: 2 frames, 650 ms apart ─▶ match Δ ≤ 0.50
                                                                │
   GPS fix ──▶ haversine vs. gudang radius ◀────────────────────┘
                     │
              inside radius?
                ├─ yes ─▶ record {photo, Δ, distance, lat/lon} ─▶ audit ─▶ cloud sync
                └─ no  ─▶ reject + reason + anomaly flag                 (≤ 20 s poll)
```

---

## ✨ Feature map

| Area | What's inside |
|---|---|
| **Auth & roles** | Email + password after choosing a Gudang, JWT sessions (8h/7d), rate limiting (5 fails → 30s lock), 4 roles: Super Admin · Admin HR · Manajer · Karyawan |
| **Attendance** | 128-D descriptors (Δ ≤ 0.50) with offline dHash fallback, 2-frame liveness, per-gudang Haversine geofence, GPS accuracy gate, duplicate guard, late/OT/work-duration math, photo evidence per record |
| **Live cloud DB** | Netlify-DB / Vercel-Postgres / Neon bridge via serverless functions, per-table revision stamps, 20s targeted pulls, offline retry queue, device presence ("Online Sekarang"), ONLINE/OFFLINE status pill |
| **Sites** | Each Gudang owns its geofence (drag pin + radius handle on OpenStreetMap), org chart, roster, and attendance stream |
| **Device security** | Accounts bind to the device of their *first login*; foreign devices refused + audited; Super Admin releases bindings |
| **Leaves** | 4 types w/ quotas, attachments, Karyawan → Manajer → HR chain, SLA chips, batch approve, notifications |
| **Payroll** | Auto-computed slips (prorated basic, per-day allowances, OT from shift overrun, lateness deductions), printable, HR-issued |
| **Master Data vault** *(Super Admin only)* | Tenant, sites, directory, departments, shifts, reference tables — edit, CSV/JSON export, JSON import, checksum, read-only SQL console, `.sqlite` export, VACUUM, **Go-Live checklist** |
| **Pengumuman** | Per-gudang or company-wide posts; staff acknowledge; HR sees a live read-receipt bar |
| **Ops** | Ruang Kendali (live control room: clock, headcounts, roster wall, event feed), KPIs, MVP leaderboard, trends, anomaly flags |
| **Email** | Real password resets via Gmail SMTP (Netlify/Vercel/PythonAnywhere) or Resend (Cloudflare), with in-app fallback |

## 🗄️ Architecture — the database story

Two engines, one schema, both real SQL:

**① Embedded SQLite (in-browser, always on).** [sql.js](https://github.com/sql-js/sql.js) —
SQLite compiled to WASM, persisted as a genuine `vittoria.sqlite` in IndexedDB.
17 normalized tables, parameterized writes, lazy-loaded after first paint.
Works fully offline; Super Admins can download the actual database file and
open it in DB Browser, DBeaver, or the `sqlite3` CLI.

**② Hosted Postgres (shared team database, live).** A serverless bridge
(`netlify/functions/api.mjs` — also reused verbatim by Vercel, ported for
Cloudflare & PythonAnywhere) fronts Postgres with parameterized SQL only.
Writes bump per-table revision stamps; every device polls and pulls only what
changed. Reads `DATABASE_URL` **or** `POSTGRES_URL` (Vercel Postgres).

**Host-agnostic.** Same repo deploys to **Vercel**, **Cloudflare Pages**,
**Netlify**, or **PythonAnywhere** — the client auto-detects the host and
calls the right endpoints (with a manual endpoint override for anything else).
See [`HOSTING.md`](./HOSTING.md) for step-by-step guides and the portable-data
migration recipe.

## 🔐 Role matrix

| Capability | Karyawan | Manajer | Admin HR | Super Admin |
|---|:---:|:---:|:---:|:---:|
| Choose gudang + clock in/out (face + GPS) | ✅ | ✅ | ✅ | ✅ |
| Own history / slips / leave requests | ✅ | ✅ | ✅ | ✅ |
| Approve leave (Tahap 1 → 2) | — | ✅ | ✅ | ✅ |
| Manage users, shifts, issue payroll | — | — | ✅ | ✅ |
| Geofence editor, holidays, branding | — | — | ✅ | ✅ |
| Master Data vault + SQL console + `.sqlite` export | — | — | 🔒 | ✅ |
| Device unbind, maintenance mode, SMTP config | — | — | — | ✅ |

## 🚀 Quick start

```bash
npm install
npm run dev      # local development
npm run build    # production build → dist/
```

**Demo accounts** (fresh local installs only — change everything on a real deployment):

| Role | Email | Password |
|---|---|---|
| Super Admin | `su@vittoria.example` | `super123` |
| Admin HR | `hr@vittoria.co.id` | `admin123` |
| Manajer | `budi.hartono@vittoria.co.id` | `123456` |
| Karyawan | `andi.saputra@vittoria.co.id` (+ others) | `123456` |

New employees take their **base photo at first login** — HR never handles it.

Deploy in minutes on any of the four supported hosts — [`HOSTING.md`](./HOSTING.md).
Currently running in production on **Vercel** with Vercel Postgres.

## 🔒 Security

- Parameterized SQL everywhere; the browser never touches the DB directly
- Secrets live in host env vars only — see [`SECURITY.md`](./SECURITY.md)
- Device binding + JWT + rate limiting + full audit trail
- Face encodings & GPS traces stay in **your** database; no third-party face API at runtime
- Found something? Please report privately — details in [`SECURITY.md`](./SECURITY.md)

## 📦 Tech stack

React 18 · TypeScript · Vite 6 · Tailwind CSS v4 · face-api.js · Leaflet +
OpenStreetMap · sql.js (SQLite/WASM) · @neondatabase/serverless · nodemailer · xlsx

## 🛣️ Roadmap

- ~~Fase 2: hosted Postgres + live cross-device sync~~ ✅ shipped
- Fase 3: server-side JWT verification, WebAuthn biometric unlock
- PPh 21 + BPJS deductions, THR generator, shift-swap requests, multi-site heatmap

## 🤝 Contributing

Issues and PRs welcome. Keep the two rules that make this project safe to run
in public: no secrets in commits (`SECURITY.md`), and every app mutation goes
through the parameterized SQL layer.

## 📄 License

MIT — see [`LICENSE`](./LICENSE).
