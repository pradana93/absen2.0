/**
 * Master Data — Super Admin vault: tenant branding, sites, directory,
 * departments, shifts, reference tables, SMTP, and the LIVE SQL ENGINE
 * (real SQLite: stats, table counts, read-only console, .sqlite export).
 */
import { useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store";
import { apiUrl, getApiOverride, isDeployedHost, setApiOverride } from "../lib/sql/cloud";
import {
  applyBrand, BRAND_PRESETS, DATA_VERSION, downloadBlob, downloadTextFile, encodeIdentity,
  LEAVE_TYPES, LeaveType, MasterPayload, readCrashLog, ROLE_LABEL, Role, SalaryStructure, Shift,
  Site, SITE_STYLE, SiteColor, smtpEnvBlock,
} from "../lib/database";
import { uid } from "../lib/format";
import GeofenceMap, { GeoDraft } from "../components/GeofenceMap";
import { useToast } from "../components/Toast";
import { Banner, Chip, Modal, SectionLabel, Toggle } from "../components/bits";
import {
  IconArrowRight, IconBriefcase, IconBuilding, IconCheck, IconClock, IconCpu, IconDatabase, IconDownload,
  IconEdit, IconEye, IconEyeOff, IconLock, IconMail, IconPin, IconPlus, IconRefresh, IconShield, IconSignal, IconTrash, IconUsers, IconWallet, IconX,
} from "../components/icons";

type Domain = "tenant" | "sites" | "employees" | "departments" | "shifts" | "reference" | "email" | "sql" | "cloud";
const SHIFT_COLORS: SiteColor[] = ["sun", "sky", "teal", "grape", "coral"];
const ROLE_KEYS: Role[] = ["employee", "manager", "companyadmin", "superadmin"];

export function LockedVault() {
  return (
    <div className="app-bg grid min-h-dvh place-items-center px-6">
      <div className="anim-pop w-full max-w-sm rounded-[28px] border border-ink-100 bg-white p-8 text-center shadow-[0_30px_80px_rgba(23,42,89,0.18)]">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-ink-100 text-ink-500"><IconLock size={34} /></span>
        <h1 className="mt-5 font-display text-[24px] leading-tight font-extrabold text-ink-900">Area Terbatas</h1>
        <p className="mt-2 text-[13px] leading-relaxed font-semibold text-ink-400">Master Data hanya dapat diakses oleh <b className="text-ink-700">Super Admin</b>.</p>
      </div>
    </div>
  );
}

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return "\uFEFF" + [headers, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
}

export default function MasterDataView() {
  const app = useApp();
  const {
    session, company, sites, employees, departments, shifts, logs, org, activeSite,
    leaveQuotas, salaryDefaults, sql,
    updateCompany, addSite, updateSite, removeSite,
    updateEmployee, unbindDevice,
    addDepartment, renameDepartment, removeDepartment,
    updateLeaveQuota, updateSalaryDefault, addShift, updateShift, removeShift,
    importMasterData, audit, smtp, updateSmtp, sendTestEmail,
    refreshSql, runSql, exportSqlFile, vacuumSql,
    cloud, cloudInitNow, cloudPullNow, cloudPing,
  } = app;
  const toast = useToast();
  const me = session!;

  if (me.role !== "superadmin") return <LockedVault />;

  const [open, setOpen] = useState<Domain | null>("sql");
  const [cloudBusy, setCloudBusy] = useState<"" | "init" | "pull">("");
  const [ping, setPing] = useState<import("../lib/sql/cloud").PingResult | null>(null);
  const [pingBusy, setPingBusy] = useState(false);
  const [apiOverride, setApiOv] = useState(getApiOverride() ?? "");
  const [multiDevDone, setMultiDevDone] = useState(() => {
    try { return localStorage.getItem("vittoria:multidev-ok") === "1"; } catch { return false; }
  });

  /* site modal */
  const [siteModal, setSiteModal] = useState<{ mode: "add" | "edit"; site?: Site } | null>(null);
  const [sBase, setSBase] = useState<GeoDraft>({ lat: -6.1754, lon: 106.8272, radiusM: 100 });
  const [sName, setSName] = useState(""); const [sShort, setSShort] = useState(""); const [sAddr, setSAddr] = useState(""); const [sColor, setSColor] = useState<SiteColor>("sun");

  /* branding */
  const [appName, setAppName] = useState(company.appName);
  const [appTagline, setAppTagline] = useState(company.appTagline);
  const [bName, setBName] = useState(company.name);
  const [bAddress, setBAddress] = useState(company.address);
  const logoRef = useRef<HTMLInputElement>(null);

  /* sql console */
  const [sqlQ, setSqlQ] = useState("SELECT name, role, site_id, status FROM employees ORDER BY staff_id;");
  const [sqlOut, setSqlOut] = useState<{ columns: string[]; rows: unknown[][] } | null>(null);
  const [sqlErr, setSqlErr] = useState("");
  const [sqlMs, setSqlMs] = useState<number | null>(null);

  /* smtp */
  const [smtpPassVisible, setSmtpPassVisible] = useState(false);
  const [smtpTestTo, setSmtpTestTo] = useState("");
  const [smtpTestBusy, setSmtpTestBusy] = useState(false);

  /* import */
  const importRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<MasterPayload | null>(null);

  const integrity = useMemo(() => {
    const snapshot = JSON.stringify({ company, sites, departments, shifts, employees, leaveQuotas, salaryDefaults });
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < snapshot.length; i++) {
      h1 = Math.imul(h1 ^ snapshot.charCodeAt(i), 16777619) >>> 0;
      h2 = Math.imul(h2 + snapshot.charCodeAt(i), 2246822519) >>> 0;
    }
    let bytes = 0;
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith("vittoria:")) bytes += k.length + (localStorage.getItem(k)?.length ?? 0); } } catch { /* noop */ }
    return { sum: `${h1.toString(16)}${h2.toString(16)}`, kb: Math.round((bytes * 2) / 1024) };
  }, [company, sites, departments, shifts, employees, leaveQuotas, salaryDefaults]);

  const domains: Array<{ id: Domain; icon: React.ReactNode; title: string; desc: string; count: number; tint: string }> = [
    { id: "sql", icon: <IconDatabase size={18} />, title: "Mesin SQL", desc: "SQLite live · konsol & ekspor", count: sql.rows, tint: "bg-ink-900 text-sun-300" },
    { id: "cloud", icon: <IconDatabase size={18} />, title: "Cloud (Netlify DB)", desc: cloud.status === "on" ? "Postgres · sinkron tim" : "Postgres · belum aktif", count: cloud.rows, tint: "bg-sky-100 text-sky-600" },
    { id: "tenant", icon: <IconBuilding size={18} />, title: "Tenant & Branding", desc: "Nama, logo, warna, identitas", count: 1, tint: "bg-sun-100 text-sun-600" },
    { id: "sites", icon: <IconShield size={18} />, title: "Gudang / Area", desc: "Geofence tiap lokasi", count: sites.length, tint: "bg-sky-100 text-sky-600" },
    { id: "employees", icon: <IconUsers size={18} />, title: "Direktori Karyawan", desc: "User master + perangkat", count: employees.length, tint: "bg-grape-100 text-grape-600" },
    { id: "departments", icon: <IconBriefcase size={18} />, title: "Departemen", desc: "Unit kerja", count: departments.length, tint: "bg-coral-100 text-coral-600" },
    { id: "shifts", icon: <IconClock size={18} />, title: "Definisi Shift", desc: "Jam kerja & grace period", count: shifts.length, tint: "bg-teal-100 text-teal-600" },
    { id: "reference", icon: <IconWallet size={18} />, title: "Tabel Referensi", desc: "Kuota cuti & gaji default", count: LEAVE_TYPES.length + ROLE_KEYS.length, tint: "bg-warn-100 text-warn-600" },
    { id: "email", icon: <IconMail size={18} />, title: "Email & SMTP", desc: "Reset sandi via Gmail", count: smtp.enabled ? 1 : 0, tint: "bg-danger-100 text-danger-600" },
  ];

  const execSql = () => {
    const t0 = performance.now();
    const res = runSql(sqlQ);
    setSqlMs(Math.round((performance.now() - t0) * 10) / 10);
    if (res.ok) { setSqlOut(res.result); setSqlErr(""); audit("SQL_QUERY", "console", sqlQ.slice(0, 120)); refreshSql(); }
    else { setSqlErr(res.error); setSqlOut(null); }
  };

  const onImportFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const p = JSON.parse(String(reader.result)) as MasterPayload;
        if (!p || typeof p !== "object") throw new Error("bukan objek");
        setImportPreview(p);
      } catch { toast.push("danger", "File tidak valid", "Bukan JSON Master Data yang dikenali."); }
    };
    reader.readAsText(f);
  };

  const exportAll = () => {
    const payload: MasterPayload & { _exportedAt: string } = { company, sites, employees, shifts, departments, leaveQuotas, salaryDefaults, _exportedAt: new Date().toISOString() };
    downloadTextFile(`masterdata-vittoria-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json");
    audit("MASTER_EXPORT", "tenant", "Ekspor JSON master data lengkap");
    toast.push("ok", "Master data diekspor", "JSON lengkap (tenant, gudang, karyawan, shift, referensi).");
  };

  const onLogo = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 200_000) return toast.push("warn", "Logo maksimal 200 KB");
    const reader = new FileReader();
    reader.onload = () => { updateCompany({ logo: String(reader.result) }); audit("BRAND_UPDATE", "logo", "Logo tenant diperbarui"); toast.push("ok", "Logo disimpan"); };
    reader.readAsDataURL(f);
  };

  const copyIdentity = async () => {
    const code = encodeIdentity(company);
    try { await navigator.clipboard.writeText(code); } catch { /* noop */ }
    toast.push("ok", "Kode identitas disalin", "Tempel di login perangkat baru.");
  };

  return (
    <div className="space-y-4 pb-2">
      {/* vault header */}
      <div className="anim-fade-up relative overflow-hidden rounded-[24px] bg-ink-950 p-5 text-white shadow-[0_24px_60px_rgba(16,24,38,0.4)]">
        <div className="pointer-events-none absolute -top-16 -right-10 h-52 w-52 rounded-full bg-sun-500/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 1.2px)", backgroundSize: "18px 18px" }} />
        <div className="relative flex items-center gap-3.5">
          <span className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sun-400 to-sun-600 p-3 text-white shadow-[0_10px_26px_rgba(240,115,0,0.45)]"><IconDatabase size={24} /></span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.2em] text-sun-300 uppercase"><IconLock size={11} /> Super Admin Only</p>
            <h1 className="font-display text-[24px] leading-tight font-extrabold">Master Data</h1>
            <p className="text-[11.5px] font-semibold text-white/55">Data induk tenant — sumber kebenaran absensi, cuti & struktur · tersimpan di SQLite.</p>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap items-center gap-1.5">
          <Chip tone={sql.status === "ready" ? "ok" : sql.status === "fallback" ? "warn" : "ink"}>
            <IconDatabase size={10} /> {sql.status === "ready" ? `SQLite v${sql.version} · ${sql.sizeKB} KB` : sql.status === "fallback" ? "FALLBACK CACHE" : "MEMUAT…"}
          </Chip>
          <Chip tone="ink" className="border-white/15 bg-white/10 text-white/75">{sql.tables} tabel · {sql.rows} baris</Chip>
          <Chip tone="ink" className="border-white/15 bg-white/10 text-white/75">skema v{DATA_VERSION}</Chip>
          <span className="ml-auto flex gap-1.5">
            <button className="btn-ghost !border-white/15 !bg-white/5 !px-3 !py-2 !text-[11px] !text-white hover:!bg-white/10" onClick={exportAll}><IconDownload size={12} /> JSON</button>
            <button className="btn-ghost !border-white/15 !bg-white/5 !px-3 !py-2 !text-[11px] !text-white hover:!bg-white/10" onClick={() => importRef.current?.click()}><IconPlus size={12} /> Impor</button>
            <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={(e) => onImportFile(e.target.files?.[0])} />
          </span>
        </div>
      </div>

      {/* import preview */}
      {importPreview && (
        <Modal open onClose={() => setImportPreview(null)} title="Pratinjau Impor">
          <div className="space-y-3">
            <p className="text-[12.5px] leading-relaxed font-semibold text-ink-500">Koleksi yang akan diterapkan (menggantikan data saat ini; karyawan di-upsert per Staff ID):</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Tenant", importPreview.company ? "tersedia" : "—"],
                ["Gudang", importPreview.sites ? String(importPreview.sites.length) : "—"],
                ["Karyawan", importPreview.employees ? String(importPreview.employees.length) : "—"],
                ["Shift", importPreview.shifts ? String(importPreview.shifts.length) : "—"],
                ["Departemen", importPreview.departments ? String(importPreview.departments.length) : "—"],
                ["Kuota & gaji", importPreview.leaveQuotas || importPreview.salaryDefaults ? "tersedia" : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2">
                  <span className="text-[12px] font-extrabold text-ink-600">{k}</span>
                  <span className="font-mono text-[11px] font-bold text-sun-700">{v}</span>
                </div>
              ))}
            </div>
            <button className="btn-sun w-full" onClick={() => {
              const applied = importMasterData(importPreview);
              toast.push("ok", "Impor selesai", applied.join(", ") || "tidak ada perubahan");
              setImportPreview(null);
            }}><IconCheck size={16} /> Terapkan Impor</button>
          </div>
        </Modal>
      )}

      {/* domain grid */}
      <div className="grid grid-cols-2 gap-2.5 min-[480px]:grid-cols-4">
        {domains.map((d, i) => (
          <button key={d.id} onClick={() => setOpen(open === d.id ? null : d.id)}
            className={`tile-pop card card-press flex flex-col items-start gap-2 p-3.5 text-left transition-all ${open === d.id ? "border-sun-400 shadow-[0_14px_36px_rgba(240,115,0,0.16)]" : ""}`}
            style={{ animationDelay: `${i * 50}ms` }}>
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${d.tint}`}>{d.icon}</span>
            <span>
              <span className="block font-display text-[13.5px] leading-tight font-extrabold text-ink-900">{d.title}</span>
              <span className="block text-[10px] font-bold text-ink-400">{d.desc}</span>
            </span>
            <span className="mt-auto chip-ink !px-2 !py-0.5 !text-[9.5px]">{d.count} record</span>
          </button>
        ))}
      </div>

      {/* ================================ SQL ================================ */}
      {open === "sql" && (
        <section className="card anim-fade-up space-y-4 p-4">
          <SectionLabel
            right={
              <div className="flex items-center gap-1.5">
                <button className="btn-ghost !rounded-lg !px-2.5 !py-1.5 !text-[11px]" onClick={() => { vacuumSql(); toast.push("ok", "VACUUM selesai", "Database dipadatkan."); }}><IconRefresh size={12} /> VACUUM</button>
                <button className="btn-sun !rounded-lg !px-2.5 !py-1.5 !text-[11px]" onClick={() => { exportSqlFile(); audit("SQL_EXPORT", "sqlite", "File .sqlite diunduh"); toast.push("ok", "Database diunduh", "File .sqlite asli — buka di DB Browser for SQLite."); }}>
                  <IconDownload size={12} /> Unduh .sqlite
                </button>
              </div>
            }
          >
            <span className="inline-flex items-center gap-1.5"><IconDatabase size={16} /> Mesin SQL (SQLite)</span>
          </SectionLabel>

          <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
            {[
              ["Versi SQLite", sql.status === "ready" ? `v${sql.version}` : "—"],
              ["Ukuran file", `${sql.sizeKB} KB`],
              ["Tabel", String(sql.tables)],
              ["Total baris", String(sql.rows)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-ink-50 px-3 py-2.5">
                <p className="text-[9px] font-extrabold tracking-wide text-ink-400 uppercase">{k}</p>
                <p className="font-mono text-[15px] font-extrabold text-ink-900">{v}</p>
              </div>
            ))}
          </div>

          {/* live table counts */}
          <div>
            <p className="mb-1.5 text-[10.5px] font-extrabold tracking-[0.14em] text-ink-400 uppercase">Isi tabel (live)</p>
            <div className="grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-3">
              {[
                ["employees", "Karyawan"], ["attendance_logs", "Log absensi"], ["leaves", "Cuti"], ["sites", "Gudang"],
                ["org_nodes", "Struktur"], ["shifts", "Shift"], ["board_posts", "Pengumuman"], ["audit_logs", "Audit"],
                ["notifications", "Notifikasi"], ["breaks", "Istirahat"], ["departments", "Departemen"], ["resets", "Token reset"],
              ].map(([t, label]) => {
                const c = runSql(`SELECT COUNT(*) AS c FROM ${t}`);
                const n = c.ok ? (c.result.rows[0]?.[0] as number) : 0;
                return (
                  <button key={t} onClick={() => { setSqlQ(`SELECT * FROM ${t} LIMIT 25;`); execSqlDirect(`SELECT * FROM ${t} LIMIT 25;`); }}
                    className="flex cursor-pointer items-center justify-between rounded-lg border border-ink-100 bg-white px-2.5 py-1.5 transition hover:border-sun-400">
                    <span className="text-[10.5px] font-extrabold text-ink-600">{label}</span>
                    <span className="font-mono text-[11px] font-extrabold text-sun-700">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* console */}
          <div>
            <p className="mb-1.5 flex items-center justify-between text-[10.5px] font-extrabold tracking-[0.14em] text-ink-400 uppercase">
              Konsol SQL <span className="font-mono normal-case">read-only · SELECT/PRAGMA/WITH/EXPLAIN</span>
            </p>
            <textarea className="input !py-2.5 font-mono !text-[12px]" rows={3} value={sqlQ} onChange={(e) => setSqlQ(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") execSql(); }} />
            <div className="mt-2 flex gap-2">
              <button className="btn-sun flex-1 !py-2.5 !text-[13px]" onClick={execSql} disabled={sql.status !== "ready"}>
                {sql.status === "ready" ? "Jalankan (Ctrl+Enter)" : "Mesin memuat…"}
              </button>
              <button className="btn-ghost !py-2.5 !text-[12px]" onClick={refreshSql}><IconRefresh size={13} /> Segarkan</button>
            </div>
            {sqlErr && <p className="mt-2 rounded-xl bg-danger-100 px-3.5 py-2.5 font-mono text-[11px] font-bold text-danger-600">{sqlErr}</p>}
            {sqlOut && (
              <div className="anim-fade-up mt-3 overflow-hidden rounded-xl border border-ink-100">
                <div className="flex items-center justify-between bg-ink-950 px-3 py-1.5">
                  <span className="font-mono text-[10px] font-bold text-ok-500">OK · {sqlOut.rows.length} baris{sqlMs !== null ? ` · ${sqlMs} ms` : ""}</span>
                  <span className="font-mono text-[9px] text-white/40">maks 100 baris</span>
                </div>
                <div className="max-h-64 overflow-auto">
                  <table className="w-full text-left font-mono text-[10.5px]">
                    <thead className="sticky top-0 bg-ink-50">
                      <tr>{sqlOut.columns.map((c) => <th key={c} className="px-2.5 py-1.5 font-extrabold text-ink-500 uppercase">{c}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100/70">
                      {sqlOut.rows.map((r, i) => (
                        <tr key={i} className="odd:bg-white even:bg-ink-50/50">
                          {r.map((v, j) => <td key={j} className="max-w-[220px] truncate px-2.5 py-1.5 font-semibold text-ink-700">{v === null ? <span className="text-ink-300">NULL</span> : String(v)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <p className="rounded-xl bg-ink-50 px-3 py-2 text-[10.5px] leading-relaxed font-semibold text-ink-400">
            <b className="text-ink-600">Fase 1:</b> SQLite berjalan di browser (WASM), file database dipersist ke IndexedDB dan bisa diunduh sebagai .sqlite asli.
            <b className="text-ink-600"> Fase 2:</b> skema identik pindah ke Postgres cloud (server/schema.postgres.sql) agar data tersinkron antar perangkat.
          </p>
        </section>
      )}

      {/* =============================== TENANT ============================== */}
      {open === "tenant" && (
        <section className="card anim-fade-up space-y-4 p-4">
          <SectionLabel right={<Chip tone="sun"><IconBuilding size={11} /> {company.appName}</Chip>}>Tenant & Branding</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nama Aplikasi</label>
              <input className="input !py-2.5 text-sm" value={appName} onChange={(e) => setAppName(e.target.value)} onBlur={() => { if (appName.trim()) { updateCompany({ appName: appName.trim() }); audit("BRAND_UPDATE", "appName", `→ "${appName.trim()}"`); } }} />
            </div>
            <div>
              <label className="label">Tagline</label>
              <input className="input !py-2.5 text-sm" value={appTagline} onChange={(e) => setAppTagline(e.target.value)} onBlur={() => { updateCompany({ appTagline: appTagline.trim() }); audit("BRAND_UPDATE", "tagline", `→ "${appTagline.trim()}"`); }} />
            </div>
            <div>
              <label className="label">Nama Perusahaan</label>
              <input className="input !py-2.5 text-sm" value={bName} onChange={(e) => setBName(e.target.value)} onBlur={() => { if (bName.trim()) updateCompany({ name: bName.trim() }); }} />
            </div>
            <div>
              <label className="label">Alamat</label>
              <input className="input !py-2.5 text-sm" value={bAddress} onChange={(e) => setBAddress(e.target.value)} onBlur={() => updateCompany({ address: bAddress })} />
            </div>
          </div>

          <div>
            <label className="label">Logo</label>
            <div className="flex items-center gap-3">
              {company.logo ? <img src={company.logo} alt="Logo" className="h-14 w-14 rounded-2xl object-cover ring-2 ring-sun-300" />
                : <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sun-400 to-sun-600 text-white"><IconBuilding size={22} /></span>}
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
              <button className="btn-soft !py-2 !text-[12px]" onClick={() => logoRef.current?.click()}>Unggah (maks 200 KB)</button>
              {company.logo && <button className="btn-danger !py-2 !text-[12px]" onClick={() => { updateCompany({ logo: null }); toast.push("info", "Logo dihapus", "Kembali ke lambang bawaan."); }}>Hapus</button>}
            </div>
          </div>

          <div>
            <label className="label">Warna Merek</label>
            <div className="grid grid-cols-3 gap-2 min-[480px]:grid-cols-6">
              {BRAND_PRESETS.map((p) => (
                <button key={p.id} onClick={() => { applyBrand(p.id); updateCompany({ brand: p.id }); audit("BRAND_UPDATE", "brand", `→ ${p.name}`); toast.push("ok", `Warna: ${p.name}`, "Berlaku di seluruh aplikasi."); }}
                  className={`card card-press flex flex-col items-center gap-1.5 p-2.5 ${company.brand === p.id ? "border-sun-400" : ""}`}>
                  <span className="h-7 w-7 rounded-full shadow-inner" style={{ background: p.swatch }} />
                  <span className="text-[9px] font-extrabold text-ink-500">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-ink-100 px-3.5 py-3">
            <div>
              <p className="text-[13px] font-extrabold text-ink-900">Mode Pemeliharaan</p>
              <p className="text-[10.5px] font-semibold text-ink-400">Kunci staff & manajer; admin tetap masuk.</p>
            </div>
            <Toggle checked={company.maintenance} onChange={(v) => { updateCompany({ maintenance: v }); audit("MAINTENANCE", "tenant", v ? "Mode pemeliharaan AKTIF" : "Mode pemeliharaan selesai"); toast.push("warn", v ? "Mode pemeliharaan aktif" : "Pemeliharaan selesai"); }} />
          </div>

          <div className="rounded-2xl bg-ink-50 p-3.5">
            <p className="text-[11px] font-extrabold text-ink-600">Identitas Antar-Perangkat</p>
            <p className="mt-0.5 text-[10.5px] font-semibold text-ink-400">Salin kode — tempel di login perangkat baru agar branding & nama tenant ikut.</p>
            <button className="btn-soft mt-2 w-full !py-2 !text-[12px]" onClick={() => void copyIdentity()}><IconDownload size={12} /> Salin Kode Identitas</button>
          </div>
        </section>
      )}

      {/* ================================ SITES =============================== */}
      {open === "sites" && (
        <section className="card anim-fade-up space-y-3 p-4">
          <SectionLabel right={<button className="btn-sun !rounded-xl !px-3 !py-2 !text-[12px]" onClick={() => { setSiteModal({ mode: "add" }); setSName(""); setSShort(""); setSAddr(""); setSColor("sun"); setSBase({ lat: activeSite.hqLat + 0.01, lon: activeSite.hqLon + 0.01, radiusM: 100 }); }}><IconPlus size={13} /> Gudang</button>}>
            Gudang / Area (Master)
          </SectionLabel>
          <div className="space-y-2.5">
            {sites.map((s) => {
              const used = employees.filter((e) => e.siteId === s.id).length;
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${SITE_STYLE[(s.color as SiteColor) ?? "sun"].grad} text-white`}><IconPin size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-extrabold text-ink-900">{s.name} <span className="font-mono text-[10px] font-bold text-ink-300">({used} staff)</span></p>
                    <p className="truncate font-mono text-[10.5px] font-semibold text-ink-400">{s.hqLat.toFixed(5)}, {s.hqLon.toFixed(5)} · radius {s.radiusM} m</p>
                  </div>
                  <button className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-sky-100 text-sky-600 transition hover:bg-sky-500 hover:text-white active:scale-90"
                    onClick={() => { setSiteModal({ mode: "edit", site: s }); setSName(s.name); setSShort(s.shortName); setSAddr(s.address); setSColor((s.color as SiteColor) ?? "sun"); setSBase({ lat: s.hqLat, lon: s.hqLon, radiusM: s.radiusM }); }}
                    aria-label={`Edit ${s.name}`} title="Edit"><IconEdit size={14} /></button>
                  <button className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-danger-100 text-danger-600 transition hover:bg-danger-500 hover:text-white active:scale-90 disabled:opacity-40"
                    disabled={used > 0} onClick={() => { if (removeSite(s.id)) toast.push("info", "Gudang dihapus", s.name); else toast.push("warn", "Masih ada staff", "Pindahkan staff dulu."); }}
                    title={used ? "Masih ada staff terikat" : "Hapus"} aria-label={`Hapus ${s.name}`}><IconTrash size={14} /></button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ============================== EMPLOYEES ============================= */}
      {open === "employees" && (
        <section className="card anim-fade-up space-y-3 p-4">
          <SectionLabel right={<Chip tone="ink">{employees.length} akun</Chip>}>Direktori Karyawan (snapshot)</SectionLabel>
          <p className="rounded-xl bg-ink-50 px-3 py-2 text-[10.5px] leading-relaxed font-semibold text-ink-400">
            Edit harian dilakukan di menu <b className="text-ink-600">Pengguna</b>. Di sini: snapshot master + unduh CSV + lepas perangkat.
          </p>
          <button className="btn-soft w-full !py-2.5 !text-[12px]" onClick={() => {
            downloadTextFile(`master-employees-${new Date().toISOString().slice(0, 10)}.csv`,
              toCsv(["staff_id", "nik", "name", "email", "role", "department", "position", "shift_id", "site_id", "status", "device_id", "created_at"],
                employees.map((e) => [e.staffId, e.nik, e.name, e.email, e.role, e.department, e.position, e.shiftId, e.siteId ?? "", e.status, e.deviceId ?? "", new Date(e.createdAt).toISOString()])),
              "text/csv;charset=utf-8");
            toast.push("ok", "CSV karyawan diunduh");
          }}><IconDownload size={13} /> Unduh CSV</button>
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {employees.map((e) => (
              <div key={e.staffId} className="flex items-center gap-2.5 rounded-lg border border-ink-100 bg-white px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-extrabold text-ink-900">{e.name} <span className="font-mono text-[9.5px] font-bold text-ink-300">{e.staffId}</span></p>
                  <p className="truncate font-mono text-[9.5px] font-semibold text-ink-400">{e.email} · {ROLE_LABEL[e.role]} · {e.department}</p>
                </div>
                {e.deviceId && (
                  <button className="shrink-0 cursor-pointer rounded-md bg-teal-100 px-2 py-1 text-[9px] font-extrabold text-teal-600 transition hover:bg-teal-500 hover:text-white"
                    onClick={() => { unbindDevice(e.staffId); toast.push("info", "Perangkat dilepas", e.name); }}>LEPAS HP</button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============================= DEPARTMENTS ============================ */}
      {open === "departments" && (
        <section className="card anim-fade-up space-y-3 p-4">
          <SectionLabel right={<Chip tone="ink">{departments.length} unit</Chip>}>Departemen</SectionLabel>
          <DepartmentEditor departments={departments} employees={employees} addDepartment={addDepartment} renameDepartment={renameDepartment} removeDepartment={removeDepartment} toast={toast} audit={audit} />
        </section>
      )}

      {/* ================================ SHIFTS ============================== */}
      {open === "shifts" && (
        <section className="card anim-fade-up space-y-3 p-4">
          <SectionLabel right={<Chip tone="ink">{shifts.length} shift</Chip>}>Definisi Shift (master)</SectionLabel>
          <ShiftEditor shifts={shifts} employees={employees} addShift={addShift} updateShift={updateShift} removeShift={removeShift} toast={toast} audit={audit} />
        </section>
      )}

      {/* ============================== REFERENCE ============================= */}
      {open === "reference" && (
        <section className="card anim-fade-up space-y-4 p-4">
          <SectionLabel>Tabel Referensi</SectionLabel>
          <div>
            <p className="mb-1.5 text-[10.5px] font-extrabold tracking-[0.14em] text-ink-400 uppercase">Kuota Cuti (hari/tahun)</p>
            <div className="grid grid-cols-2 gap-2">
              {LEAVE_TYPES.map((t) => (
                <div key={t} className="flex items-center justify-between rounded-xl border border-ink-100 bg-white px-3 py-2">
                  <span className="text-[12px] font-extrabold text-ink-700">{t}</span>
                  <input type="number" min={0} className="input !w-20 !py-1.5 font-mono !text-[12px]" value={leaveQuotas[t]}
                    onChange={(e) => updateLeaveQuota(t as LeaveType, Math.max(0, Number(e.target.value)))} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[10.5px] font-extrabold tracking-[0.14em] text-ink-400 uppercase">Struktur Gaji Default (Rp)</p>
            <div className="space-y-2">
              {ROLE_KEYS.map((r) => {
                const sd = salaryDefaults[r];
                return (
                  <div key={r} className="rounded-xl border border-ink-100 bg-white p-2.5">
                    <p className="mb-1.5 text-[11px] font-extrabold text-ink-600">{ROLE_LABEL[r]}</p>
                    <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
                      {([["basic", "Pokok"], ["transport", "Transport"], ["meal", "Makan"], ["otPerHour", "Lembur/jam"]] as const).map(([k, lbl]) => (
                        <div key={k}>
                          <label className="label !text-[8.5px]">{lbl}</label>
                          <input type="number" step={1000} className="input !py-1.5 font-mono !text-[11.5px]" value={sd?.[k] ?? 0}
                            onChange={(e) => updateSalaryDefault(r, { [k]: Math.max(0, Number(e.target.value)) } as Partial<SalaryStructure>)} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ================================ EMAIL =============================== */}
      {open === "email" && (
        <section className="card anim-fade-up space-y-4 p-4">
          <SectionLabel
            right={
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${smtp.enabled && smtp.user && smtp.pass ? "bg-ok-100 text-ok-600" : "bg-warn-100 text-warn-600"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${smtp.enabled && smtp.user && smtp.pass ? "anim-blink bg-ok-500" : "bg-warn-500"}`} />
                  {smtp.enabled && smtp.user && smtp.pass ? "SIAP KIRIM" : "BELUM LENGKAP"}
                </span>
                <Toggle checked={smtp.enabled} onChange={(v) => { updateSmtp({ enabled: v }); audit("SMTP_TOGGLE", "smtp", v ? "SMTP diaktifkan" : "SMTP dinonaktifkan"); toast.push("info", `SMTP ${v ? "aktif" : "nonaktif"}`); }} />
              </div>
            }
          >
            <span className="inline-flex items-center gap-1.5"><IconMail size={16} /> Email & SMTP (Gmail)</span>
          </SectionLabel>

          <p className="rounded-xl bg-sky-100/70 px-3 py-2.5 text-[11.5px] leading-relaxed font-semibold text-sky-600">
            Pengiriman dilakukan oleh <b>Netlify Function</b> di server — kredensial tidak dijalankan di browser karyawan. Jika fungsi belum ter-deploy, aplikasi otomatis kembali ke inbox simulasi.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Server SMTP · Port</label>
              <div className="grid grid-cols-[1fr_86px] gap-2">
                <input className="input !py-2.5 font-mono text-sm" value={smtp.host} onChange={(e) => updateSmtp({ host: e.target.value })} placeholder="smtp.gmail.com" />
                <input type="number" className="input !py-2.5 font-mono text-sm" value={smtp.port} onChange={(e) => updateSmtp({ port: Math.max(1, Number(e.target.value)) })} />
              </div>
            </div>
            <div>
              <label className="label">Keamanan</label>
              <select className="input !py-2.5 text-sm" value={smtp.secure ? "ssl" : "tls"} onChange={(e) => updateSmtp({ secure: e.target.value === "ssl", port: e.target.value === "ssl" ? 465 : 587 })}>
                <option value="ssl">SSL · 465</option>
                <option value="tls">STARTTLS · 587</option>
              </select>
            </div>
            <div>
              <label className="label">Nama Pengirim</label>
              <input className="input !py-2.5 text-sm" value={smtp.fromName} onChange={(e) => updateSmtp({ fromName: e.target.value })} placeholder="Vittoria HR" />
            </div>
            <div className="col-span-2">
              <label className="label">Akun Gmail (username)</label>
              <input className="input !py-2.5 font-mono text-sm" value={smtp.user} onChange={(e) => updateSmtp({ user: e.target.value })} placeholder="absensi.vittoria@gmail.com" autoComplete="off" />
            </div>
            <div className="col-span-2">
              <label className="label">App Password Gmail (16 karakter)</label>
              <div className="relative">
                <input type={smtpPassVisible ? "text" : "password"} className="input !py-2.5 pr-11 font-mono text-sm tracking-widest" value={smtp.pass}
                  onChange={(e) => updateSmtp({ pass: e.target.value.replace(/\s/g, "") })} placeholder="xxxx xxxx xxxx xxxx" autoComplete="off" />
                <button className="field-eye" onClick={() => setSmtpPassVisible((s) => !s)} aria-label="Tampilkan sandi">{smtpPassVisible ? <IconEyeOff size={15} /> : <IconEye size={15} />}</button>
              </div>
            </div>
          </div>

          <details className="rounded-xl border border-warn-200 bg-warn-100/50 px-3 py-2.5">
            <summary className="cursor-pointer text-[12px] font-extrabold text-warn-600 select-none">📌 Cara membuat Gmail App Password</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed font-semibold text-warn-600/90">
              <li>Aktifkan <b>2-Step Verification</b> di Google Account → Security.</li>
              <li>Buka <b>App passwords</b> → app “Mail”, device “Other (Vittoria HR)”.</li>
              <li>Tempel sandi 16 karakter di atas (spasi otomatis dibersihkan).</li>
              <li>Sandi Gmail biasa <b>ditolak</b> server — hanya App Password yang bekerja.</li>
            </ol>
          </details>

          <div className="space-y-2.5 rounded-2xl bg-ink-50 p-3.5">
            <label className="label !mb-1">Uji koneksi — kirim email tes</label>
            <div className="flex gap-2">
              <input type="email" className="input !py-2.5 text-sm" value={smtpTestTo} onChange={(e) => setSmtpTestTo(e.target.value)} placeholder={smtp.user || "tujuan@tes.com"} />
              <button className="btn-sun shrink-0 !rounded-xl !px-4 !py-2.5 !text-[12.5px]" disabled={smtpTestBusy || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(smtpTestTo)}
                onClick={async () => {
                  setSmtpTestBusy(true);
                  const res = await sendTestEmail(smtpTestTo.trim());
                  setSmtpTestBusy(false);
                  if (res.ok) toast.push("ok", "Email tes terkirim 🎉", `Cek ${smtpTestTo.trim()}.`);
                  else toast.push("danger", "Email tes gagal", res.error);
                }}>
                {smtpTestBusy ? <IconRefresh size={14} className="animate-spin" /> : <IconMail size={14} />} {smtpTestBusy ? "Mengirim…" : "Kirim Tes"}
              </button>
            </div>
            <div className="flex items-start justify-between gap-3">
              <p className="text-[10px] leading-relaxed font-bold text-ink-400"><b className="text-ink-600">Praktik terbaik:</b> pindahkan kredensial ke env vars Netlify agar tidak tersimpan di perangkat.</p>
              <button className="btn-ghost shrink-0 !rounded-xl !px-3 !py-2 !text-[11px]" onClick={() => { navigator.clipboard?.writeText(smtpEnvBlock(smtp)).catch(() => undefined); toast.push("ok", "Env vars disalin", "Tempel di Netlify → Environment variables."); }}>
                <IconDownload size={12} /> Salin Env
              </button>
            </div>
          </div>

          <button className="btn-sun w-full" onClick={() => { audit("SMTP_UPDATE", "smtp", `Konfigurasi SMTP disimpan (${smtp.host}:${smtp.port} · ${smtp.user || "tanpa user"})`); toast.push("ok", "Konfigurasi SMTP disimpan", smtp.enabled ? "Reset kata sandi kini dikirim via email." : "SMTP masih nonaktif."); }}>
            <IconCheck size={16} /> Simpan Konfigurasi
          </button>
        </section>
      )}

      {/* ----------------------------- CLOUD / NETLIFY DB --------------------- */}
      {open === "cloud" && (
        <section className="card anim-fade-up space-y-4 p-4">
          <SectionLabel
            right={
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                cloud.status === "on" ? "bg-ok-100 text-ok-600" : cloud.status === "error" ? "bg-danger-100 text-danger-600" : "bg-warn-100 text-warn-600"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${cloud.status === "on" ? "anim-blink bg-ok-500" : cloud.status === "error" ? "bg-danger-500" : "bg-warn-500"}`} />
                {cloud.status === "on" ? "ONLINE" : cloud.status === "connecting" ? "MENYAMBUNG…" : "OFFLINE"}
              </span>
            }
          >
            <span className="inline-flex items-center gap-1.5"><IconDatabase size={16} /> Cloud — Netlify DB (Postgres)</span>
          </SectionLabel>

          <p className="rounded-xl bg-sky-100/70 px-3 py-2.5 text-[11.5px] leading-relaxed font-semibold text-sky-600">
            Seluruh tim berbagi satu database: absensi, cuti, karyawan, dan struktur organisasi tersinkron antar perangkat.
            <b> Semuanya otomatis</b> — perangkat pertama men-seed database saat kosong, perangkat lain (bahkan sebelum login)
            langsung menarik data terbaru. Mesin SQLite lokal tetap menjadi cache instan & mode offline.
          </p>

          {/* status grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-ink-50 px-3 py-2.5 text-center">
              <p className="font-display text-[20px] leading-none font-extrabold text-ink-900 tabular-nums">{cloud.rows}</p>
              <p className="mt-1 text-[9px] font-extrabold tracking-wide text-ink-400 uppercase">Baris Cloud</p>
            </div>
            <div className="rounded-xl bg-ink-50 px-3 py-2.5 text-center">
              <p className="font-display text-[20px] leading-none font-extrabold text-ink-900 tabular-nums">{sql.rows}</p>
              <p className="mt-1 text-[9px] font-extrabold tracking-wide text-ink-400 uppercase">Baris Lokal</p>
            </div>
            <div className="rounded-xl bg-ink-50 px-3 py-2.5 text-center">
              <p className="font-display text-[13px] leading-[20px] font-extrabold text-ink-900">{cloud.lastSync ? new Date(cloud.lastSync).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}</p>
              <p className="mt-1 text-[9px] font-extrabold tracking-wide text-ink-400 uppercase">Sinkron Terakhir</p>
            </div>
          </div>

          {/* per-table counts */}
          {cloud.status === "on" && Object.keys(cloud.counts).length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-4">
              {Object.entries(cloud.counts).map(([k, n]) => (
                <div key={k} className="flex items-center justify-between rounded-lg border border-ink-100 bg-white px-2.5 py-1.5">
                  <span className="font-mono text-[10px] font-bold text-ink-500">{k}</span>
                  <span className="font-mono text-[11px] font-extrabold text-ink-900 tabular-nums">{n}</span>
                </div>
              ))}
            </div>
          )}

          {/* endpoint override — untuk host non-standar (PA, custom domain, server sendiri) */}
          <div className="space-y-2 rounded-2xl border border-ink-100 bg-white p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-extrabold text-ink-800">Endpoint API (lanjutan)</p>
                <p className="truncate text-[10px] font-semibold text-ink-400">
                  {getApiOverride() ? <span className="font-mono text-ok-600">{getApiOverride()}</span> : "Otomatis sesuai host — Netlify / Cloudflare / Vercel / PythonAnywhere terdeteksi sendiri."}
                </p>
              </div>
              {getApiOverride() && (
                <button
                  className="btn-ghost shrink-0 !rounded-xl !px-3 !py-2 !text-[11px]"
                  onClick={() => { setApiOverride(null); setApiOv(""); toast.push("info", "Endpoint direset", "Kembali ke deteksi host otomatis — muat ulang halaman."); }}
                >
                  Reset
                </button>
              )}
            </div>
            {!getApiOverride() && (
              <div className="flex gap-2">
                <input
                  className="input !py-2.5 font-mono !text-[12px]"
                  placeholder="https://situs-anda.com/api/ops"
                  value={apiOverride}
                  onChange={(e) => setApiOv(e.target.value)}
                />
                <button
                  className="btn-soft shrink-0 !rounded-xl !px-4 !py-2.5 !text-[12px]"
                  onClick={() => {
                    const v = apiOverride.trim();
                    if (!/^https?:\/\/.+/i.test(v)) return toast.push("warn", "URL tidak valid", "Harus diawali http(s)://");
                    setApiOverride(v);
                    toast.push("ok", "Endpoint disimpan", "Muat ulang halaman agar berlaku, lalu Cek Semua.");
                  }}
                >
                  Simpan
                </button>
              </div>
            )}
          </div>

          {/* go-live checklist */}
          <div className="space-y-3 rounded-2xl bg-ink-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-[15px] font-extrabold text-ink-900">Checklist Go-Live Multi-Perangkat</p>
                <p className="text-[10.5px] font-semibold text-ink-400">Akun yang dibuat di sini bisa login di HP karyawan — bila semua hijau</p>
                <p className="mt-0.5 truncate font-mono text-[9.5px] font-bold text-ink-300" title={apiUrl()}>
                  endpoint aktif: {apiUrl()}
                </p>
              </div>
              <button
                className="btn-sun shrink-0 !rounded-xl !px-4 !py-2.5 !text-[12.5px]"
                disabled={pingBusy}
                onClick={async () => {
                  setPingBusy(true);
                  const res = await cloudPing();
                  setPing(res);
                  setPingBusy(false);
                  if (res.ok) audit("CLOUD_PING", "netlify-db", `OK · ${res.tables}/15 tabel · ${res.rows} baris · ${res.clientMs} ms`);
                  else audit("CLOUD_PING_FAIL", "netlify-db", String(res.error ?? "").slice(0, 120));
                }}
              >
                <IconSignal size={14} /> {pingBusy ? "Memeriksa…" : "Cek Semua"}
              </button>
            </div>

            {(() => {
              const onDeployedUrl = isDeployedHost();
              const tried = ping !== null;
              const steps: Array<{ ok: boolean | null; title: string; desc: string; fix?: string }> = [
                {
                  ok: onDeployedUrl,
                  title: "Dibuka dari URL publik",
                  desc: "URL hasil deploy — Netlify / Cloudflare / Vercel / PythonAnywhere / domain sendiri.",
                  fix: "Localhost & preview tidak memiliki fungsi server. Buka URL publik hasil deploy, atau set Endpoint API kustom di bawah. Pastikan juga deploy Anda memakai kode terbaru (push ulang lalu redeploy).",
                },
                {
                  ok: tried ? ping!.ok : null,
                  title: "Fungsi `api` merespons",
                  desc: "Jembatan browser → server → Postgres aktif.",
                  fix: "Redeploy situs sekali dari host Anda (Netlify Deploys / Cloudflare Deployments / Vercel Deployments), atau cek Endpoint API.",
                },
                {
                  ok: tried ? Boolean(ping!.ok && ping!.serverVersion) : null,
                  title: "Postgres menjawab",
                  desc: ping?.ok ? `${String(ping.serverVersion).replace("PostgreSQL ", "").split(" ")[0]} · ${ping.serverMs} ms di server` : "Connection string terbaca oleh fungsi (DATABASE_URL atau POSTGRES_URL).",
                  fix: "Supabase: salin string Transaction pooler (port 6543), ganti [YOUR-PASSWORD], pasang sebagai env DATABASE_URL. Atau Vercel Postgres (POSTGRES_URL otomatis) / Netlify DB. Lalu redeploy.",
                },
                {
                  ok: tried ? Boolean(ping!.ok && ping!.schemaReady) : null,
                  title: "Skema 15 tabel siap",
                  desc: ping?.ok && !ping.schemaReady && ping.missing?.length ? `Kurang: ${ping.missing.join(", ")}…` : "Tabel absensi, karyawan, cuti, dll. sudah ada.",
                  fix: "Aplikasi membuatnya otomatis saat pertama kali terhubung — atau tekan \"Siapkan Skema & Unggah Data\" (aman berulang).",
                },
                {
                  ok: tried ? Boolean(ping!.ok && (ping!.rows ?? 0) > 0) : null,
                  title: "Data sudah di cloud",
                  desc: ping?.ok ? `${(ping.rows ?? 0).toLocaleString("id-ID")} baris tersimpan di Postgres.` : "Seluruh data lokal terunggah sekali.",
                  fix: "Otomatis: perangkat pertama men-seed DB saat kosong; perangkat lain langsung menariknya — bahkan sebelum login.",
                },
                {
                  ok: multiDevDone,
                  title: "Login dari perangkat kedua",
                  desc: "Di HP lain: buka URL yang sama → pilih gudang → login dengan akun dari menu Pengguna.",
                },
              ];
              const done = steps.filter((s) => s.ok === true).length;
              const allDone = done === steps.length;
              return (
                <>
                  <div className="flex items-center gap-2.5">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                      <div className="bar-grow-x h-full rounded-full bg-gradient-to-r from-sun-400 to-ok-500" style={{ width: `${(done / steps.length) * 100}%` }} />
                    </div>
                    <span className="font-display text-[13px] font-extrabold text-ink-700 tabular-nums">{done}/{steps.length}</span>
                  </div>

                  {allDone && (
                    <p className="anim-pop rounded-xl bg-ok-100 px-3 py-2.5 text-[11.5px] leading-relaxed font-bold text-ok-600">
                      🎉 Multi-perangkat live! Setiap akun baru yang dibuat di menu Pengguna otomatis tersedia di semua perangkat dalam ±1 detik.
                    </p>
                  )}

                  <ol className="pt-1">
                    {steps.map((s, i) => (
                      <li key={s.title} className="tile-pop relative flex gap-3 pb-4 last:pb-0" style={{ animationDelay: `${i * 70}ms` }}>
                        {i < steps.length - 1 && <span className="absolute top-7 left-[13px] h-[calc(100%-22px)] w-px bg-ink-200" aria-hidden />}
                        <span className={`z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${
                          s.ok === true ? "anim-pop border-ok-500 bg-ok-500 text-white" :
                          s.ok === false ? "border-danger-500 bg-danger-100 text-danger-600" :
                          "border-ink-200 bg-white text-ink-300"
                        }`}>
                          {s.ok === true ? <IconCheck size={13} /> : s.ok === false ? <IconX size={13} /> : <span className="anim-blink h-1.5 w-1.5 rounded-full bg-ink-300" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-[13px] leading-tight font-extrabold ${s.ok === true ? "text-ink-900" : s.ok === false ? "text-danger-600" : "text-ink-400"}`}>
                            {i + 1}. {s.title}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-snug font-semibold text-ink-400">{s.ok === false && s.fix ? s.fix : s.desc}</p>
                          {i === steps.length - 1 && !multiDevDone && (
                            <button
                              className="btn-ghost mt-1.5 !rounded-lg !px-3 !py-1.5 !text-[11px]"
                              onClick={() => {
                                setMultiDevDone(true);
                                try { localStorage.setItem("vittoria:multidev-ok", "1"); } catch { /* noop */ }
                                audit("CLOUD_MULTIDEV_OK", "netlify-db", "Uji login perangkat kedua dikonfirmasi");
                                toast.push("ok", "Selamat! 🎉", "Aplikasi Anda kini live untuk seluruh tim.");
                              }}
                            >
                              <IconCheck size={12} /> Sudah saya coba & berhasil
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>

                  {ping && ping.ok && (
                    <div className="flex flex-wrap gap-1.5 border-t border-ink-100 pt-2.5">
                      <Chip tone="ok"><IconSignal size={10} /> {ping.clientMs} ms round-trip</Chip>
                      <Chip tone="ink">PG {String(ping.serverVersion).replace("PostgreSQL ", "").split(" ")[0]}</Chip>
                      <Chip tone={ping.schemaReady ? "ok" : "warn"}>{ping.tables}/15 tabel</Chip>
                      <Chip tone={ping.rows ? "ok" : "warn"}>{(ping.rows ?? 0).toLocaleString("id-ID")} baris</Chip>
                    </div>
                  )}
                  {ping && !ping.ok && (
                    <div className="space-y-2">
                      <p className="rounded-lg bg-danger-100 px-3 py-2 text-[10.5px] leading-relaxed font-bold text-danger-600">
                        ✕ Gagal setelah {ping.clientMs} ms — {ping.error}. Lihat petunjuk merah pada langkah 2–3 di atas.
                      </p>
                      {(() => {
                        const m = window.location.hostname.match(/^([^.]+)\.netlify\.app$/);
                        if (!m) return null;
                        return (
                          <a
                            href={`https://app.netlify.com/sites/${m[1]}/configuration/environment-variables`}
                            target="_blank" rel="noreferrer"
                            className="btn-sun w-full !py-2.5 !text-[12.5px]"
                          >
                            <IconArrowRight size={14} /> Buka Environment Variables di Netlify ↗
                          </a>
                        );
                      })()}
                      {/DATABASE_URL/i.test(String(ping.error ?? "")) && (
                        <div className="rounded-lg border border-sky-300 bg-sky-100 px-3 py-2.5 text-[10.5px] leading-relaxed font-semibold text-sky-600">
                          <b>Cara menambahkannya (60 detik):</b> di halaman yang terbuka, klik <b>Add variable</b> →
                          Key: <code className="rounded bg-white px-1 font-mono">DATABASE_URL</code> ·
                          Value: tempel <i>Read & Write connection string</i> Anda (diawali <code className="font-mono">postgresql://</code>) ·
                          scopes: <b>All scopes</b> → Save. Lalu kembali ke Netlify tab <b>Deploys → Trigger deploy</b>,
                          tunggu selesai, dan ulangi <b>Cek Semua</b>.
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}

          </div>

          {/* actions */}
          <div className="space-y-2.5">
            {(!cloud.ready || cloud.status !== "on") && (
              <button
                className="btn-sun w-full"
                disabled={cloudBusy !== ""}
                onClick={async () => {
                  setCloudBusy("init");
                  const res = await cloudInitNow();
                  setCloudBusy("");
                  if (res.ok) { audit("CLOUD_INIT", "netlify-db", "Skema Postgres disiapkan & data lokal diunggah"); toast.push("ok", "Cloud siap 🎉", "Skema dibuat. Perubahan kini tersinkron ke Netlify DB."); }
                  else toast.push("danger", "Gagal menyiapkan cloud", res.error);
                }}
              >
                <IconDatabase size={16} /> {cloudBusy === "init" ? "Menyiapkan skema…" : "Siapkan Skema & Unggah Data"}
              </button>
            )}
            <button
              className="btn-ghost w-full"
              disabled={cloudBusy !== "" || cloud.status !== "on"}
              onClick={async () => {
                setCloudBusy("pull");
                const ok = await cloudPullNow();
                setCloudBusy("");
                if (ok) { audit("CLOUD_PULL", "netlify-db", "Data cloud ditarik ke perangkat"); toast.push("ok", "Data cloud dimuat", "Cache lokal diperbarui dari Postgres."); }
                else toast.push("danger", "Gagal menarik data", "Periksa koneksi & Netlify DB.");
              }}
            >
              <IconArrowRight size={15} className="rotate-180" /> {cloudBusy === "pull" ? "Menarik data…" : "Tarik dari Cloud Sekarang"}
            </button>
          </div>

          {cloud.status !== "on" && (
            <div className="rounded-xl bg-warn-100/70 px-3 py-2.5 text-[11px] leading-relaxed font-semibold text-warn-600">
              <b>Belum terhubung?</b> Pastikan: (1) env <code className="font-mono">DATABASE_URL</code> terpasang — untuk <b>Supabase</b> pakai string
              <i> Transaction pooler</i> (port 6543, username <code className="font-mono">postgres.&lt;ref&gt;</code>) dengan password asli;
              (2) site sudah di-deploy ulang agar function <code className="font-mono">api</code> aktif, dan (3) Anda membuka URL hasil deploy
              (bukan localhost/preview). Lihat <b>HOSTING.md</b> untuk panduan lengkap.
            </div>
          )}

          <p className="text-[10px] leading-relaxed font-semibold text-ink-300">
            Arsitektur: browser → server function (SQL berparameter, origin terbatasi) → Postgres. Kredensial DB tidak pernah menyentuh browser.
            Slip gaji masih lokal di Fase 2; autentikasi JWT tervalidasi server = Fase 3.
          </p>
        </section>
      )}

      {/* integrity footer */}
      <section className="card p-4">
        <SectionLabel right={<Chip tone="ok"><IconCheck size={10} /> SEHAT</Chip>}>Integritas Data</SectionLabel>
        <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
          {[
            ["Versi skema", `v${DATA_VERSION}`],
            ["Checksum", integrity.sum.slice(0, 12) + "…"],
            ["Cache", `${integrity.kb} KB`],
            ["SQL", sql.status === "ready" ? `${sql.rows} baris` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-ink-50 px-3 py-2.5">
              <p className="text-[9px] font-extrabold tracking-wide text-ink-400 uppercase">{k}</p>
              <p className="truncate font-mono text-[12.5px] font-extrabold text-ink-900">{v}</p>
            </div>
          ))}
        </div>
        {(() => {
          const crash = readCrashLog();
          if (!crash) return null;
          return <p className="mt-2 rounded-xl bg-warn-100 px-3 py-2 text-[10.5px] leading-relaxed font-bold text-warn-600">Crash terakhir: {new Date(crash.ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} — “{crash.msg}”</p>;
        })()}
      </section>

      {/* site modal with map */}
      <Modal open={!!siteModal} onClose={() => setSiteModal(null)} title={siteModal?.mode === "add" ? "Gudang / Area Baru" : "Edit Gudang / Area"} wide>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nama</label>
              <input className="input !py-2.5 text-sm" value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Gudang Timur" />
            </div>
            <div>
              <label className="label">Nama pendek</label>
              <input className="input !py-2.5 text-sm" value={sShort} onChange={(e) => setSShort(e.target.value)} placeholder="Timur" />
            </div>
          </div>
          <div>
            <label className="label">Alamat</label>
            <input className="input !py-2.5 text-sm" value={sAddr} onChange={(e) => setSAddr(e.target.value)} />
          </div>
          <GeofenceMap hq={{ lat: sBase.lat, lon: sBase.lon }} radiusM={sBase.radiusM} editable onDraft={setSBase} heightClass="h-56" fitPoints={false} />
          <p className="rounded-xl bg-ink-50 px-3 py-2 font-mono text-[11px] font-bold text-ink-600">{sBase.lat.toFixed(5)}, {sBase.lon.toFixed(5)} · radius {sBase.radiusM} m</p>
          <div>
            <label className="label">Warna</label>
            <div className="flex gap-2">
              {SHIFT_COLORS.map((c) => (
                <button key={c} onClick={() => setSColor(c)} className={`h-8 w-8 cursor-pointer rounded-full transition ${SITE_STYLE[c].dot} ${sColor === c ? "ring-4 ring-sun-300" : ""}`} aria-label={c} />
              ))}
            </div>
          </div>
          <button className="btn-sun w-full" onClick={() => {
            if (sName.trim().length < 3) return toast.push("warn", "Nama minimal 3 karakter");
            if (siteModal?.mode === "add") {
              const s: Site = { id: `site-${uid("s").slice(-6)}`, name: sName.trim(), shortName: sShort.trim() || (sName.trim().split(" ").pop() ?? "Baru"), address: sAddr, hqLat: sBase.lat, hqLon: sBase.lon, radiusM: sBase.radiusM, color: sColor };
              addSite(s);
              audit("MASTER_SITE_CREATE", s.id, `Gudang "${s.name}" ditambahkan (${s.hqLat.toFixed(4)}, ${s.hqLon.toFixed(4)} · ${s.radiusM} m)`);
              toast.push("ok", "Gudang ditambahkan", s.name);
            } else if (siteModal?.site) {
              updateSite(siteModal.site.id, { name: sName.trim(), shortName: sShort.trim(), address: sAddr, hqLat: sBase.lat, hqLon: sBase.lon, radiusM: sBase.radiusM, color: sColor });
              audit("MASTER_SITE_UPDATE", siteModal.site.id, `Gudang "${sName.trim()}" diperbarui`);
              toast.push("ok", "Gudang diperbarui", sName.trim());
            }
            setSiteModal(null);
          }}><IconCheck size={16} /> Simpan Gudang</button>
        </div>
      </Modal>
    </div>
  );

  /* local exec for table chips (bypasses textarea state) */
  function execSqlDirect(q: string) {
    const t0 = performance.now();
    const res = runSql(q);
    setSqlMs(Math.round((performance.now() - t0) * 10) / 10);
    if (res.ok) { setSqlOut(res.result); setSqlErr(""); }
    else { setSqlErr(res.error); setSqlOut(null); }
  }
}

/* department editor sub-component */
function DepartmentEditor({ departments, employees, addDepartment, renameDepartment, removeDepartment, toast, audit }: {
  departments: string[]; employees: { department: string; name: string }[];
  addDepartment: (n: string) => void; renameDepartment: (f: string, t: string) => void; removeDepartment: (n: string) => boolean;
  toast: ReturnType<typeof useToast>; audit: (a: string, t: string, d: string) => void;
}) {
  const [nName, setNName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <input className="input !py-2.5 text-sm" placeholder="Departemen baru (cth. Retur)" value={nName} onChange={(e) => setNName(e.target.value)} />
        <button className="btn-sun shrink-0 !rounded-xl !px-4 !text-[13px]" onClick={() => {
          const n = nName.trim();
          if (n.length < 3) return toast.push("warn", "Nama minimal 3 karakter");
          if (departments.includes(n)) return toast.push("warn", "Sudah ada");
          addDepartment(n); audit("DEPT_CREATE", n, `Departemen "${n}" ditambahkan`); toast.push("ok", "Departemen ditambahkan", n); setNName("");
        }}><IconPlus size={14} /></button>
      </div>
      {departments.map((d) => {
        const used = employees.filter((e) => e.department === d).length;
        return (
          <div key={d} className="flex items-center gap-2.5 rounded-xl border border-ink-100 bg-white px-3 py-2">
            {editing === d ? (
              <>
                <input className="input !py-1.5 text-sm" value={eName} onChange={(e) => setEName(e.target.value)} autoFocus />
                <button className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg bg-ok-100 text-ok-600 hover:bg-ok-500 hover:text-white" onClick={() => {
                  const n = eName.trim();
                  if (n.length < 3) return toast.push("warn", "Nama minimal 3 karakter");
                  renameDepartment(d, n); audit("DEPT_RENAME", d, `"${d}" → "${n}"`); toast.push("ok", "Departemen diganti", n); setEditing(null);
                }} aria-label="Simpan"><IconCheck size={14} /></button>
                <button className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg bg-ink-100 text-ink-500" onClick={() => setEditing(null)} aria-label="Batal"><IconX size={14} /></button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-extrabold text-ink-900">{d}</p>
                  <p className="font-mono text-[10px] font-semibold text-ink-400">{used} staff</p>
                </div>
                <button className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-sky-100 text-sky-600 hover:bg-sky-500 hover:text-white" onClick={() => { setEditing(d); setEName(d); }} aria-label={`Edit ${d}`}><IconEdit size={14} /></button>
                <button className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-danger-100 text-danger-600 hover:bg-danger-500 hover:text-white disabled:opacity-40" disabled={used > 0}
                  onClick={() => { if (removeDepartment(d)) { audit("DEPT_DELETE", d, `Departemen "${d}" dihapus`); toast.push("info", "Departemen dihapus", d); } }}
                  title={used ? "Masih dipakai" : "Hapus"} aria-label={`Hapus ${d}`}><IconTrash size={14} /></button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* shift editor sub-component */
function ShiftEditor({ shifts, employees, addShift, updateShift, removeShift, toast, audit }: {
  shifts: Shift[]; employees: { shiftId: string }[];
  addShift: (s: Shift) => void; updateShift: (id: string, p: Partial<Shift>) => void; removeShift: (id: string) => void;
  toast: ReturnType<typeof useToast>; audit: (a: string, t: string, d: string) => void;
}) {
  const [nName, setNName] = useState("");
  const [nStart, setNStart] = useState("08:00");
  const [nEnd, setNEnd] = useState("16:00");
  const [nGrace, setNGrace] = useState(15);
  return (
    <div className="space-y-2.5">
      <div className="rounded-2xl border border-ink-100 bg-ink-50/60 p-3">
        <div className="grid grid-cols-2 gap-2">
          <input className="input !py-2 text-sm" placeholder="Nama shift" value={nName} onChange={(e) => setNName(e.target.value)} />
          <input type="number" min={0} className="input !py-2 font-mono text-sm" value={nGrace} onChange={(e) => setNGrace(Math.max(0, Number(e.target.value)))} title="Grace period (menit)" />
          <input type="time" className="input !py-2 font-mono text-sm" value={nStart} onChange={(e) => setNStart(e.target.value)} />
          <input type="time" className="input !py-2 font-mono text-sm" value={nEnd} onChange={(e) => setNEnd(e.target.value)} />
        </div>
        <button className="btn-sun mt-2 w-full !py-2 !text-[12.5px]" onClick={() => {
          if (nName.trim().length < 3) return toast.push("warn", "Nama minimal 3 karakter");
          const s: Shift = { id: `sh-${uid("s").slice(-6)}`, name: nName.trim(), start: nStart, end: nEnd, graceMin: nGrace, color: SHIFT_COLORS[shifts.length % SHIFT_COLORS.length] };
          addShift(s); audit("SHIFT_CREATE", s.id, `Shift "${s.name}" ${s.start}–${s.end}`); toast.push("ok", "Shift ditambahkan", s.name); setNName("");
        }}><IconPlus size={13} /> Tambah Shift</button>
      </div>
      {shifts.map((s) => {
        const used = employees.filter((e) => e.shiftId === s.id).length;
        return (
          <div key={s.id} className="flex items-center gap-2.5 rounded-xl border border-ink-100 bg-white px-3 py-2">
            <span className={`h-3 w-3 shrink-0 rounded-full ${SITE_STYLE[(s.color as SiteColor) ?? "sun"].dot}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-extrabold text-ink-900">{s.name}</p>
              <p className="font-mono text-[10px] font-semibold text-ink-400">{s.start}–{s.end} · grace {s.graceMin} mnt · {used} staff</p>
            </div>
            <input type="number" min={0} className="input !w-16 !py-1 font-mono !text-[11px]" value={s.graceMin} title="Grace (menit)"
              onChange={(e) => updateShift(s.id, { graceMin: Math.max(0, Number(e.target.value)) })} />
            <button className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg bg-danger-100 text-danger-600 hover:bg-danger-500 hover:text-white disabled:opacity-40"
              disabled={used > 0} onClick={() => { removeShift(s.id); audit("SHIFT_DELETE", s.id, `Shift "${s.name}" dihapus`); toast.push("info", "Shift dihapus", s.name); }}
              title={used ? "Masih dipakai" : "Hapus"} aria-label={`Hapus ${s.name}`}><IconTrash size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}
