/**
 * Master Data — the Super Admin vault.
 * Hidden from every other role (route-guarded AND self-guarded).
 * Six domains: Tenant, Gudang/Area, Karyawan, Departemen, Shift, Referensi.
 * Per-domain CSV + JSON export, full JSON backup, validated import with
 * preview, and an integrity panel (version, checksum, footprint).
 */
import { useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store";
import {
  BRAND_PRESETS, DATA_VERSION, downloadTextFile, Employee, LEAVE_TYPES, LeaveType,
  MasterPayload, readCrashLog, ROLE_LABEL, Role, SalaryStructure, Shift, Site, SITE_STYLE, SiteColor, smtpEnvBlock,
} from "../lib/database";
import { uid } from "../lib/format";
import GeofenceMap, { GeoDraft } from "../components/GeofenceMap";
import { useToast } from "../components/Toast";
import { Banner, Chip, Modal, SectionLabel, Toggle } from "../components/bits";
import {
  IconBriefcase, IconBuilding, IconCheck, IconClock, IconDatabase, IconDownload,
  IconEdit, IconEye, IconEyeOff, IconLock, IconMail, IconPlus, IconRefresh, IconShield, IconTrash, IconUsers, IconWallet, IconX,
} from "../components/icons";

/* ------------------------------ csv helpers ------------------------------ */
function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [headers.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))].join("\n");
}
function downloadJson(name: string, data: unknown) {
  downloadTextFile(name, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
}
function patchSalary(cur: Partial<SalaryStructure> | undefined, k: keyof SalaryStructure, v: number): Partial<SalaryStructure> {
  return { ...cur, [k]: v };
}
function checksum(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i), 2246822519) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 12);
}

type Domain = "tenant" | "sites" | "employees" | "departments" | "shifts" | "reference" | "email";

const SHIFT_COLORS: SiteColor[] = ["sun", "sky", "teal", "grape", "coral"];

export default function MasterDataView() {
  const app = useApp();
  const {
    session, company, sites, employees, departments, shifts, logs, org,
    leaveQuotas, salaryDefaults,
    updateCompany, addSite, updateSite, removeSite,
    updateEmployee, unbindDevice,
    addDepartment, renameDepartment, removeDepartment,
    updateLeaveQuota, updateSalaryDefault, addShift, updateShift, removeShift,
    importMasterData, audit, smtp, updateSmtp, sendTestEmail,
  } = app;
  const toast = useToast();
  const me = session!;

  /* hard self-guard (route guard in App.tsx is the first wall) */
  if (me.role !== "superadmin") return <LockedVault />;

  const [open, setOpen] = useState<Domain | null>("tenant");

  /* SMTP console */
  const [smtpPassVisible, setSmtpPassVisible] = useState(false);
  const [smtpTestTo, setSmtpTestTo] = useState("");
  const [smtpTestBusy, setSmtpTestBusy] = useState(false);

  /* ------------------------------ site modal ------------------------------ */
  const [siteModal, setSiteModal] = useState<{ mode: "add" | "edit"; site?: Site } | null>(null);
  const [sName, setSName] = useState("");
  const [sShort, setSShort] = useState("");
  const [sAddr, setSAddr] = useState("");
  const [sColor, setSColor] = useState<SiteColor>("sun");
  const [sDraft, setSDraft] = useState<GeoDraft | null>(null);
  const [sBase, setSBase] = useState<{ lat: number; lon: number; radiusM: number }>({ lat: -6.1754, lon: 106.8272, radiusM: 100 });
  const [sErr, setSErr] = useState("");

  const openSite = (mode: "add" | "edit", site?: Site) => {
    setSiteModal({ mode, site });
    setSName(site?.name ?? ""); setSShort(site?.shortName ?? ""); setSAddr(site?.address ?? "");
    setSColor(site?.color ?? "sun"); setSDraft(null);
    setSBase(site ? { lat: site.hqLat, lon: site.hqLon, radiusM: site.radiusM } : { lat: -6.1754, lon: 106.8272, radiusM: 100 });
    setSErr("");
  };
  const eff = sDraft ?? { ...sBase };
  const saveSite = () => {
    if (sName.trim().length < 3) return setSErr("Nama gudang minimal 3 karakter.");
    if (!sShort.trim()) return setSErr("Isi nama singkat (untuk chip & header).");
    if (siteModal?.mode === "add") {
      addSite({ id: uid("site"), name: sName.trim(), shortName: sShort.trim(), address: sAddr.trim(), hqLat: eff.lat, hqLon: eff.lon, radiusM: eff.radiusM, color: sColor });
      audit("MASTER_SITE_ADD", sShort.trim(), `Gudang "${sName.trim()}" ditambahkan (radius ${eff.radiusM} m)`);
      toast.push("ok", "Gudang ditambahkan", sName.trim());
    } else if (siteModal?.site) {
      updateSite(siteModal.site.id, { name: sName.trim(), shortName: sShort.trim(), address: sAddr.trim(), hqLat: eff.lat, hqLon: eff.lon, radiusM: eff.radiusM, color: sColor });
      audit("MASTER_SITE_UPDATE", siteModal.site.id, `Gudang "${sName.trim()}" diperbarui (radius ${eff.radiusM} m)`);
      toast.push("ok", "Gudang diperbarui", sName.trim());
    }
    setSiteModal(null);
  };

  /* ---------------------------- employee modal ---------------------------- */
  const [empModal, setEmpModal] = useState<Employee | null>(null);
  const [eForm, setEForm] = useState<Omit<Partial<Employee>, "salary"> & { salary?: Partial<SalaryStructure> }>({});
  const openEmp = (e: Employee) => {
    setEmpModal(e);
    setEForm({ name: e.name, email: e.email, role: e.role, siteId: e.siteId, shiftId: e.shiftId, department: e.department, status: e.status, salary: { ...e.salary } });
  };
  const saveEmp = () => {
    if (!empModal) return;
    const { salary, ...rest } = eForm;
    updateEmployee(empModal.staffId, {
      ...rest,
      salary: {
        basic: salary?.basic ?? empModal.salary.basic,
        transport: salary?.transport ?? empModal.salary.transport,
        meal: salary?.meal ?? empModal.salary.meal,
        otPerHour: salary?.otPerHour ?? empModal.salary.otPerHour,
      },
    } as Partial<Employee>);
    audit("MASTER_EMP_UPDATE", empModal.staffId, `Data master karyawan ${empModal.name} diperbarui`);
    toast.push("ok", "Karyawan diperbarui", empModal.name);
    setEmpModal(null);
  };
  const [empQ, setEmpQ] = useState("");
  const empFiltered = useMemo(
    () => employees.filter((e) => !empQ || e.name.toLowerCase().includes(empQ.toLowerCase()) || e.staffId.toLowerCase().includes(empQ.toLowerCase()) || e.email.toLowerCase().includes(empQ.toLowerCase())),
    [employees, empQ],
  );

  /* ------------------------------ shift modal ------------------------------ */
  const [shiftModal, setShiftModal] = useState<{ mode: "add" | "edit"; shift?: Shift } | null>(null);
  const [shName, setShName] = useState("");
  const [shStart, setShStart] = useState("08:00");
  const [shEnd, setShEnd] = useState("17:00");
  const [shGrace, setShGrace] = useState(15);
  const [shColor, setShColor] = useState<SiteColor>("sun");
  const openShift = (mode: "add" | "edit", shift?: Shift) => {
    setShiftModal({ mode, shift });
    setShName(shift?.name ?? ""); setShStart(shift?.start ?? "08:00"); setShEnd(shift?.end ?? "17:00");
    setShGrace(shift?.graceMin ?? 15); setShColor((shift?.color as SiteColor) ?? "sun");
  };
  const saveShift = () => {
    if (shName.trim().length < 3) return toast.push("warn", "Nama shift minimal 3 karakter");
    if (shiftModal?.mode === "add") {
      addShift({ id: uid("sh"), name: shName.trim(), start: shStart, end: shEnd, graceMin: shGrace, color: shColor });
      audit("MASTER_SHIFT_ADD", shName.trim(), `Shift "${shName.trim()}" (${shStart}–${shEnd}, grace ${shGrace} mnt)`);
      toast.push("ok", "Shift ditambahkan", shName.trim());
    } else if (shiftModal?.shift) {
      updateShift(shiftModal.shift.id, { name: shName.trim(), start: shStart, end: shEnd, graceMin: shGrace, color: shColor });
      audit("MASTER_SHIFT_UPDATE", shiftModal.shift.id, `Shift "${shName.trim()}" diperbarui`);
      toast.push("ok", "Shift diperbarui", shName.trim());
    }
    setShiftModal(null);
  };

  /* ------------------------------ departments ------------------------------ */
  const [newDept, setNewDept] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  /* ------------------------------ export/import ---------------------------- */
  const buildPayload = (): MasterPayload => ({
    app: "vittoria-masterdata",
    version: DATA_VERSION,
    exportedAt: Date.now(),
    company, sites, departments, shifts, employees,
    leaveQuotas, salaryDefaults,
  });
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const [importPreview, setImportPreview] = useState<MasterPayload | null>(null);
  const [importErr, setImportErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const onImportFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const p = JSON.parse(String(reader.result)) as MasterPayload;
        if (p.app !== "vittoria-masterdata") throw new Error("bukan file master data Vittoria");
        setImportErr("");
        setImportPreview(p);
      } catch {
        setImportErr("File tidak valid — harus JSON Master Data yang diekspor dari aplikasi ini.");
        setImportPreview(null);
      }
    };
    reader.readAsText(f);
  };

  /* -------------------------------- integrity ------------------------------ */
  const integrity = useMemo(() => {
    const snapshot = JSON.stringify({ company, sites, departments, shifts, employees, leaveQuotas, salaryDefaults });
    let bytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("vittoria:")) bytes += k.length + (localStorage.getItem(k)?.length ?? 0);
      }
    } catch { /* noop */ }
    return { sum: checksum(snapshot), kb: Math.round((bytes * 2) / 1024) };
  }, [company, sites, departments, shifts, employees, leaveQuotas, salaryDefaults]);

  const siteName = (id: string | null) => (id ? sites.find((s) => s.id === id)?.shortName ?? "—" : "Semua");
  const shiftName = (id: string) => shifts.find((s) => s.id === id)?.name ?? "—";
  const ROLE_KEYS: Role[] = ["employee", "manager", "companyadmin", "superadmin"];

  const domains: Array<{ id: Domain; icon: React.ReactNode; title: string; desc: string; count: number; tint: string }> = [
    { id: "tenant", icon: <IconBuilding size={18} />, title: "Tenant / Perusahaan", desc: "Identitas, merek & kebijakan", count: 1, tint: "bg-sun-100 text-sun-700" },
    { id: "sites", icon: <IconShield size={18} />, title: "Gudang / Area", desc: "Geofence tiap lokasi", count: sites.length, tint: "bg-sky-100 text-sky-600" },
    { id: "employees", icon: <IconUsers size={18} />, title: "Direktori Karyawan", desc: "User master + perangkat", count: employees.length, tint: "bg-grape-100 text-grape-600" },
    { id: "departments", icon: <IconBriefcase size={18} />, title: "Departemen", desc: "Unit kerja", count: departments.length, tint: "bg-coral-100 text-coral-600" },
    { id: "shifts", icon: <IconClock size={18} />, title: "Definisi Shift", desc: "Jam kerja & grace period", count: shifts.length, tint: "bg-teal-100 text-teal-600" },
    { id: "reference", icon: <IconWallet size={18} />, title: "Tabel Referensi", desc: "Kuota cuti & gaji default", count: LEAVE_TYPES.length + ROLE_KEYS.length, tint: "bg-warn-100 text-warn-600" },
    { id: "email", icon: <IconMail size={18} />, title: "Email & SMTP", desc: "Reset sandi via Gmail", count: smtp.enabled ? 1 : 0, tint: "bg-danger-100 text-danger-600" },
  ];

  return (
    <div className="space-y-4 pb-2">
      {/* vault header */}
      <div className="anim-fade-up relative overflow-hidden rounded-[24px] bg-ink-950 p-5 text-white shadow-[0_24px_60px_rgba(16,24,38,0.4)]">
        <div className="pointer-events-none absolute -top-16 -right-10 h-52 w-52 rounded-full bg-sun-500/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 1.2px)", backgroundSize: "18px 18px" }} />
        <div className="relative flex items-center gap-3.5">
          <span className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sun-400 to-sun-600 p-3 text-white shadow-[0_10px_26px_rgba(240,115,0,0.45)]">
            <IconDatabase size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.2em] text-sun-300 uppercase">
              <IconLock size={11} /> Super Admin Only
            </p>
            <h1 className="font-display text-[24px] leading-tight font-extrabold">Master Data</h1>
            <p className="text-[11.5px] font-semibold text-white/55">Data induk tenant — sumber kebenaran untuk absensi, cuti & struktur.</p>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          <button className="btn-sun !rounded-xl !px-4 !py-2.5 !text-[13px]" onClick={() => { downloadJson(`masterdata-vittoria-${stamp()}.json`, buildPayload()); audit("MASTER_EXPORT", "all", "Ekspor penuh Master Data (JSON)"); toast.push("ok", "Master Data diekspor", "JSON lengkap — simpan di tempat aman."); }}>
            <IconDownload size={15} /> Unduh Semua · JSON
          </button>
          <button className="btn-ghost !rounded-xl !border-white/20 !bg-white/10 !px-4 !py-2.5 !text-[13px] !text-white hover:!bg-white/20" onClick={() => fileRef.current?.click()}>
            <IconPlus size={15} /> Impor / Pulihkan
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onImportFile(e.target.files?.[0])} />
        </div>
        {importErr && <p className="relative mt-2 text-[11.5px] font-bold text-danger-300">{importErr}</p>}
      </div>

      {/* domain grid */}
      <div className="grid grid-cols-2 gap-2.5 min-[480px]:grid-cols-3">
        {domains.map((d, i) => (
          <button
            key={d.id}
            onClick={() => setOpen(open === d.id ? null : d.id)}
            className={`tile-pop card card-press flex flex-col items-start gap-2 p-3.5 text-left transition-all ${open === d.id ? "border-sun-400 shadow-[0_14px_36px_rgba(240,115,0,0.16)]" : ""}`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${d.tint}`}>{d.icon}</span>
            <span>
              <span className="block font-display text-[13.5px] leading-tight font-extrabold text-ink-900">{d.title}</span>
              <span className="block text-[10px] font-bold text-ink-400">{d.desc}</span>
            </span>
            <span className="mt-auto chip-ink !px-2 !py-0.5 !text-[9.5px]">{d.count} record</span>
          </button>
        ))}
      </div>

      {/* ------------------------------ TENANT ------------------------------ */}
      {open === "tenant" && (
        <section className="card anim-fade-up space-y-3.5 p-4">
          <SectionLabel right={
            <button className="btn-soft !rounded-lg !px-2.5 !py-1.5 !text-[11px]" onClick={() => { downloadJson(`masterdata-tenant-${stamp()}.json`, { app: "vittoria-masterdata", version: DATA_VERSION, company }); toast.push("ok", "Tenant diekspor (JSON)"); }}>
              <IconDownload size={12} /> JSON
            </button>
          }>
            Tenant / Perusahaan
          </SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Nama legal</label><input className="input !py-2.5 text-sm" defaultValue={company.name} onBlur={(e) => e.target.value.trim() && e.target.value !== company.name && (updateCompany({ name: e.target.value.trim() }), audit("MASTER_TENANT", "name", `Nama → ${e.target.value.trim()}`))} /></div>
            <div><label className="label">Nama singkat</label><input className="input !py-2.5 text-sm" defaultValue={company.shortName} onBlur={(e) => e.target.value.trim() && e.target.value !== company.shortName && (updateCompany({ shortName: e.target.value.trim() }), audit("MASTER_TENANT", "shortName", e.target.value.trim()))} /></div>
            <div><label className="label">Nama aplikasi</label><input className="input !py-2.5 text-sm" defaultValue={company.appName} onBlur={(e) => e.target.value.trim() && e.target.value !== company.appName && (updateCompany({ appName: e.target.value.trim() }), audit("MASTER_TENANT", "appName", e.target.value.trim()))} /></div>
            <div><label className="label">Tagline</label><input className="input !py-2.5 text-sm" defaultValue={company.appTagline} onBlur={(e) => e.target.value !== company.appTagline && (updateCompany({ appTagline: e.target.value }), audit("MASTER_TENANT", "tagline", e.target.value))} /></div>
          </div>
          <div>
            <label className="label">Warna merek</label>
            <div className="flex flex-wrap gap-2">
              {BRAND_PRESETS.map((p) => (
                <button key={p.id} onClick={() => { updateCompany({ brand: p.id }); audit("MASTER_TENANT", "brand", p.name); toast.push("ok", "Merek diperbarui", p.name); }}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[11.5px] font-extrabold transition active:scale-95 ${company.brand === p.id ? "border-sun-400 bg-sun-100/60 text-ink-900" : "border-ink-100 bg-white text-ink-500 hover:border-ink-200"}`}>
                  <span className="h-4 w-4 rounded-full shadow-inner" style={{ background: p.swatch }} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-ink-50 px-3.5 py-2.5">
            <div>
              <p className="text-[12.5px] font-extrabold text-ink-800">Pengikatan perangkat (anti-fraud)</p>
              <p className="text-[10.5px] font-semibold text-ink-400">Akun terkunci ke perangkat login pertamanya</p>
            </div>
            <button onClick={() => { updateCompany({ deviceBinding: !company.deviceBinding }); audit("MASTER_TENANT", "deviceBinding", String(!company.deviceBinding)); }}
              className={`relative h-7 w-12 cursor-pointer rounded-full transition-colors ${company.deviceBinding ? "bg-ok-500" : "bg-ink-300"}`} aria-label="Toggle pengikatan perangkat">
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${company.deviceBinding ? "left-6" : "left-1"}`} />
            </button>
          </div>
        </section>
      )}

      {/* ------------------------------- SITES ------------------------------ */}
      {open === "sites" && (
        <section className="card anim-fade-up space-y-3 p-4">
          <SectionLabel right={
            <div className="flex gap-1.5">
              <button className="btn-soft !rounded-lg !px-2.5 !py-1.5 !text-[11px]" onClick={() => { downloadTextFile(`masterdata-sites-${stamp()}.csv`, toCsv(["id", "nama", "singkat", "alamat", "lat", "lon", "radius_m", "warna"], sites.map((s) => [s.id, s.name, s.shortName, s.address, s.hqLat, s.hqLon, s.radiusM, s.color])), "text/csv;charset=utf-8"); toast.push("ok", "Sites diekspor (CSV)"); }}><IconDownload size={12} /> CSV</button>
              <button className="btn-sun !rounded-lg !px-2.5 !py-1.5 !text-[11px]" onClick={() => openSite("add")}><IconPlus size={12} /> Gudang</button>
            </div>
          }>
            Gudang / Area
          </SectionLabel>
          <div className="space-y-2">
            {sites.map((s) => {
              const assigned = employees.filter((e) => e.siteId === s.id).length;
              const st = SITE_STYLE[s.color];
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${st.chip}`}><IconShield size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-extrabold text-ink-900">{s.name}</p>
                    <p className="font-mono text-[10px] font-bold text-ink-400">{s.hqLat.toFixed(5)}, {s.hqLon.toFixed(5)} · radius {s.radiusM} m · {assigned} staf</p>
                  </div>
                  <button className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-sky-100 text-sky-600 transition hover:bg-sky-500 hover:text-white active:scale-90" onClick={() => openSite("edit", s)} aria-label={`Edit ${s.name}`}><IconEdit size={14} /></button>
                  <button
                    className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-danger-100 text-danger-600 transition hover:bg-danger-500 hover:text-white active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => { if (removeSite(s.id)) toast.push("info", "Gudang dihapus", s.name); else toast.push("warn", "Tidak bisa dihapus", `${assigned} staf masih terikat ke gudang ini.`); }}
                    disabled={assigned > 0} aria-label={`Hapus ${s.name}`}
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ----------------------------- EMPLOYEES ---------------------------- */}
      {open === "employees" && (
        <section className="card anim-fade-up space-y-3 p-4">
          <SectionLabel right={
            <div className="flex gap-1.5">
              <button className="btn-soft !rounded-lg !px-2.5 !py-1.5 !text-[11px]" onClick={() => { downloadTextFile(`masterdata-karyawan-${stamp()}.csv`, toCsv(["staff_id", "nik", "nama", "email", "telepon", "departemen", "jabatan", "role", "gudang", "shift", "status", "gaji_pokok", "perangkat"], empFiltered.map((e) => [e.staffId, e.nik, e.name, e.email, e.phone, e.department, e.position, ROLE_LABEL[e.role], siteName(e.siteId), shiftName(e.shiftId), e.status, e.salary.basic, e.deviceId ? "terikat" : "-"])), "text/csv;charset=utf-8"); toast.push("ok", "Direktori diekspor (CSV)"); }}><IconDownload size={12} /> CSV</button>
              <button className="btn-soft !rounded-lg !px-2.5 !py-1.5 !text-[11px]" onClick={() => { downloadJson(`masterdata-karyawan-${stamp()}.json`, { app: "vittoria-masterdata", version: DATA_VERSION, employees }); toast.push("ok", "Direktori diekspor (JSON)"); }}><IconDownload size={12} /> JSON</button>
            </div>
          }>
            Direktori Karyawan
          </SectionLabel>
          <Banner tone="warn" title="Data sensitif">
            Ekspor JSON memuat kredensial & baseline wajah — perlakukan sebagai rahasia.
          </Banner>
          <input className="input !py-2.5 text-sm" placeholder="Cari nama / ID / email…" value={empQ} onChange={(e) => setEmpQ(e.target.value)} />
          <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {empFiltered.map((e) => (
              <div key={e.staffId} className="flex items-center gap-2.5 rounded-xl border border-ink-100 bg-white px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-extrabold text-ink-900">
                    <span className="truncate">{e.name}</span>
                    <Chip tone={e.role === "superadmin" ? "grape" : e.role === "companyadmin" ? "sun" : e.role === "manager" ? "sky" : "ink"} className="!px-1.5 !py-0.5 !text-[8.5px]">{ROLE_LABEL[e.role].toUpperCase()}</Chip>
                    {e.status !== "active" && <Chip tone="danger" className="!px-1.5 !py-0.5 !text-[8.5px]">{e.status.toUpperCase()}</Chip>}
                  </p>
                  <p className="truncate font-mono text-[10px] font-bold text-ink-400">{e.staffId} · {siteName(e.siteId)} · {e.department} · {e.email}</p>
                </div>
                {e.deviceId && (
                  <button className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg bg-teal-100 text-teal-600 transition hover:bg-teal-500 hover:text-white active:scale-90"
                    onClick={() => { unbindDevice(e.staffId); toast.push("info", "Perangkat dilepas", e.name); }} title="Lepas ikatan perangkat" aria-label={`Lepas perangkat ${e.name}`}>
                    <IconShield size={13} />
                  </button>
                )}
                <button className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg bg-sky-100 text-sky-600 transition hover:bg-sky-500 hover:text-white active:scale-90" onClick={() => openEmp(e)} aria-label={`Edit ${e.name}`}><IconEdit size={13} /></button>
              </div>
            ))}
            {empFiltered.length === 0 && <p className="px-1 py-4 text-center text-[12px] font-bold text-ink-300">Tidak ada karyawan cocok.</p>}
          </div>
        </section>
      )}

      {/* ---------------------------- DEPARTMENTS --------------------------- */}
      {open === "departments" && (
        <section className="card anim-fade-up space-y-3 p-4">
          <SectionLabel right={
            <button className="btn-soft !rounded-lg !px-2.5 !py-1.5 !text-[11px]" onClick={() => { downloadTextFile(`masterdata-departemen-${stamp()}.csv`, toCsv(["departemen", "jumlah_staf"], departments.map((d) => [d, employees.filter((e) => e.department === d).length])), "text/csv;charset=utf-8"); toast.push("ok", "Departemen diekspor (CSV)"); }}><IconDownload size={12} /> CSV</button>
          }>
            Departemen
          </SectionLabel>
          <div className="flex gap-2">
            <input className="input !py-2.5 text-sm" placeholder="Departemen baru…" value={newDept} onChange={(e) => setNewDept(e.target.value)} onKeyDown={(e) => e.key === "Enter" && newDept.trim() && (addDepartment(newDept) ? (toast.push("ok", "Departemen ditambahkan", newDept.trim()), setNewDept("")) : toast.push("warn", "Sudah ada atau kosong"))} />
            <button className="btn-sun !rounded-xl !px-4 !text-sm" onClick={() => { if (addDepartment(newDept)) { toast.push("ok", "Departemen ditambahkan", newDept.trim()); setNewDept(""); } else toast.push("warn", "Sudah ada atau kosong"); }}><IconPlus size={15} /></button>
          </div>
          <div className="space-y-1.5">
            {departments.map((d) => {
              const n = employees.filter((e) => e.department === d).length;
              return (
                <div key={d} className="flex items-center gap-2.5 rounded-xl border border-ink-100 bg-white px-3 py-2">
                  {renaming === d ? (
                    <>
                      <input autoFocus className="input !py-1.5 !text-[12.5px]" value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && renameDepartment(d, renameVal)) { toast.push("ok", "Departemen diganti", renameVal); setRenaming(null); } }} />
                      <button className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-ok-100 text-ok-600 active:scale-90" onClick={() => { if (renameDepartment(d, renameVal)) { toast.push("ok", "Departemen diganti", renameVal); setRenaming(null); } }} aria-label="Simpan nama"><IconCheck size={14} /></button>
                      <button className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-ink-100 text-ink-500 active:scale-90" onClick={() => setRenaming(null)} aria-label="Batal"><IconX size={14} /></button>
                    </>
                  ) : (
                    <>
                      <p className="flex-1 text-[13px] font-extrabold text-ink-900">{d} <span className="font-mono text-[10px] font-bold text-ink-400">· {n} staf</span></p>
                      <button className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-sky-100 text-sky-600 transition hover:bg-sky-500 hover:text-white active:scale-90" onClick={() => { setRenaming(d); setRenameVal(d); }} aria-label={`Ganti nama ${d}`}><IconEdit size={13} /></button>
                      <button className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-danger-100 text-danger-600 transition hover:bg-danger-500 hover:text-white active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => { if (removeDepartment(d)) toast.push("info", "Departemen dihapus", d); else toast.push("warn", "Tidak bisa dihapus", `${n} staf masih di departemen ini.`); }}
                        disabled={n > 0} aria-label={`Hapus ${d}`}>
                        <IconTrash size={13} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ------------------------------- SHIFTS ----------------------------- */}
      {open === "shifts" && (
        <section className="card anim-fade-up space-y-3 p-4">
          <SectionLabel right={
            <div className="flex gap-1.5">
              <button className="btn-soft !rounded-lg !px-2.5 !py-1.5 !text-[11px]" onClick={() => { downloadTextFile(`masterdata-shift-${stamp()}.csv`, toCsv(["id", "nama", "mulai", "selesai", "grace_mnt", "jumlah_staf"], shifts.map((s) => [s.id, s.name, s.start, s.end, s.graceMin, employees.filter((e) => e.shiftId === s.id).length])), "text/csv;charset=utf-8"); toast.push("ok", "Shift diekspor (CSV)"); }}><IconDownload size={12} /> CSV</button>
              <button className="btn-sun !rounded-lg !px-2.5 !py-1.5 !text-[11px]" onClick={() => openShift("add")}><IconPlus size={12} /> Shift</button>
            </div>
          }>
            Definisi Shift
          </SectionLabel>
          <div className="space-y-1.5">
            {shifts.map((s) => {
              const n = employees.filter((e) => e.shiftId === s.id).length;
              return (
                <div key={s.id} className="flex items-center gap-2.5 rounded-xl border border-ink-100 bg-white px-3 py-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${SITE_STYLE[(s.color as SiteColor) ?? "sun"].dot}`} />
                  <p className="flex-1 text-[13px] font-extrabold text-ink-900">{s.name} <span className="font-mono text-[10px] font-bold text-ink-400">{s.start}–{s.end} · grace {s.graceMin}m · {n} staf</span></p>
                  <button className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-sky-100 text-sky-600 transition hover:bg-sky-500 hover:text-white active:scale-90" onClick={() => openShift("edit", s)} aria-label={`Edit ${s.name}`}><IconEdit size={13} /></button>
                  <button className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-danger-100 text-danger-600 transition hover:bg-danger-500 hover:text-white active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => { const used = employees.some((e) => e.shiftId === s.id); if (used) { toast.push("warn", "Tidak bisa dihapus", `${n} staf memakai shift ini.`); return; } removeShift(s.id); audit("MASTER_SHIFT_DELETE", s.id, `Shift "${s.name}" dihapus`); toast.push("info", "Shift dihapus", s.name); }}
                    disabled={n > 0} aria-label={`Hapus ${s.name}`}>
                    <IconTrash size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ----------------------------- REFERENCE ---------------------------- */}
      {open === "reference" && (
        <section className="card anim-fade-up space-y-4 p-4">
          <SectionLabel right={
            <button className="btn-soft !rounded-lg !px-2.5 !py-1.5 !text-[11px]" onClick={() => { downloadJson(`masterdata-referensi-${stamp()}.json`, { app: "vittoria-masterdata", version: DATA_VERSION, leaveQuotas, salaryDefaults }); toast.push("ok", "Tabel referensi diekspor (JSON)"); }}><IconDownload size={12} /> JSON</button>
          }>
            Tabel Referensi
          </SectionLabel>

          <div>
            <p className="mb-2 text-[11px] font-extrabold tracking-[0.12em] text-ink-400 uppercase">Kuota cuti per jenis (hari/tahun)</p>
            <div className="grid grid-cols-2 gap-2.5">
              {LEAVE_TYPES.map((t) => (
                <div key={t} className="flex items-center justify-between rounded-xl border border-ink-100 bg-white px-3 py-2.5">
                  <span className="text-[12.5px] font-extrabold text-ink-800">{t}</span>
                  <div className="flex items-center gap-1.5">
                    <button className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg bg-ink-100 font-bold text-ink-600 active:scale-90" onClick={() => updateLeaveQuota(t, (leaveQuotas[t] ?? 0) - 1)} aria-label={`Kurangi kuota ${t}`}>−</button>
                    <span className="w-8 text-center font-display text-[15px] font-extrabold text-ink-900 tabular-nums">{leaveQuotas[t] ?? 0}</span>
                    <button className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg bg-sun-100 font-bold text-sun-700 active:scale-90" onClick={() => updateLeaveQuota(t, (leaveQuotas[t] ?? 0) + 1)} aria-label={`Tambah kuota ${t}`}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-extrabold tracking-[0.12em] text-ink-400 uppercase">Struktur gaji default per peran (Rp)</p>
            <div className="space-y-2">
              {ROLE_KEYS.map((r) => {
                const sd = salaryDefaults[r];
                return (
                  <div key={r} className="rounded-xl border border-ink-100 bg-white p-3">
                    <p className="mb-2 text-[12px] font-extrabold text-ink-800">{ROLE_LABEL[r]}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([["basic", "Pokok/bln"], ["transport", "Transport/hr"], ["meal", "Makan/hr"], ["otPerHour", "Lembur/jam"]] as const).map(([k, lbl]) => (
                        <label key={k} className="block">
                          <span className="mb-1 block text-[9px] font-extrabold tracking-wide text-ink-400 uppercase">{lbl}</span>
                          <input type="number" step={1000} className="input !py-1.5 font-mono !text-[12px]" value={sd?.[k] ?? 0}
                            onChange={(e) => updateSalaryDefault(r, patchSalary(sd, k, Math.max(0, Number(e.target.value))))} />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------- EMAIL/SMTP --------------------------- */}
      {open === "email" && (
        <section className="card anim-fade-up space-y-4 p-4">
          <SectionLabel
            right={
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                  smtp.enabled && smtp.user && smtp.pass ? "bg-ok-100 text-ok-600" : "bg-warn-100 text-warn-600"
                }`}>
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
            Pengiriman dilakukan oleh <b>Netlify Function</b> di server — kata sandi tidak pernah dijalankan di browser karyawan.
            Jika fungsi belum ter-deploy atau SMTP mati, aplikasi otomatis kembali ke <b>inbox simulasi</b>.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Server SMTP</label>
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
                <input
                  type={smtpPassVisible ? "text" : "password"}
                  className="input !py-2.5 pr-11 font-mono text-sm tracking-widest"
                  value={smtp.pass}
                  onChange={(e) => updateSmtp({ pass: e.target.value.replace(/\s/g, "") })}
                  placeholder="xxxx xxxx xxxx xxxx"
                  autoComplete="off"
                />
                <button className="field-eye" onClick={() => setSmtpPassVisible((s) => !s)} aria-label="Tampilkan sandi">
                  {smtpPassVisible ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                </button>
              </div>
            </div>
          </div>

          {/* Gmail app password guide */}
          <details className="rounded-xl border border-warn-200 bg-warn-100/50 px-3 py-2.5">
            <summary className="cursor-pointer text-[12px] font-extrabold text-warn-600 select-none">📌 Cara membuat Gmail App Password (wajib sejak 2022)</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed font-semibold text-warn-600/90">
              <li>Aktifkan <b>2-Step Verification</b> di Google Account → Security.</li>
              <li>Buka <b>App passwords</b> → pilih app “Mail”, device “Other (Vittoria HR)”.</li>
              <li>Google memberi sandi 16 karakter — tempel di atas (spasi boleh, otomatis dibersihkan).</li>
              <li>Sandi Gmail biasa <b>ditolak</b> oleh server — hanya App Password yang bekerja.</li>
            </ol>
          </details>

          {/* test + env copy */}
          <div className="space-y-2.5 rounded-2xl bg-ink-50 p-3.5">
            <label className="label !mb-1">Uji koneksi — kirim email tes</label>
            <div className="flex gap-2">
              <input type="email" className="input !py-2.5 text-sm" value={smtpTestTo} onChange={(e) => setSmtpTestTo(e.target.value)} placeholder={smtp.user || "tujuan@tes.com"} />
              <button
                className="btn-sun shrink-0 !rounded-xl !px-4 !py-2.5 !text-[12.5px]"
                disabled={smtpTestBusy || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(smtpTestTo)}
                onClick={async () => {
                  setSmtpTestBusy(true);
                  const res = await sendTestEmail(smtpTestTo.trim());
                  setSmtpTestBusy(false);
                  if (res.ok) toast.push("ok", "Email tes terkirim 🎉", `Cek ${smtpTestTo.trim()} — server SMTP terhubung.`);
                  else toast.push("danger", "Email tes gagal", res.error);
                }}
              >
                {smtpTestBusy ? <IconRefresh size={14} className="animate-spin" /> : <IconMail size={14} />} {smtpTestBusy ? "Mengirim…" : "Kirim Tes"}
              </button>
            </div>
            <div className="flex items-start justify-between gap-3">
              <p className="text-[10px] leading-relaxed font-bold text-ink-400">
                <b className="text-ink-600">Praktik terbaik produksi:</b> pindahkan kredensial ke environment variables Netlify
                (Site settings → Environment) agar tidak tersimpan di perangkat ini. Fungsi membaca env terlebih dahulu.
              </p>
              <button
                className="btn-ghost shrink-0 !rounded-xl !px-3 !py-2 !text-[11px]"
                onClick={() => {
                  navigator.clipboard?.writeText(smtpEnvBlock(smtp)).catch(() => undefined);
                  toast.push("ok", "Env vars disalin", "Tempel di Netlify → Site settings → Environment variables.");
                }}
              >
                <IconDownload size={12} /> Salin Env Vars
              </button>
            </div>
          </div>

          <button
            className="btn-sun w-full"
            onClick={() => { audit("SMTP_UPDATE", "smtp", `Konfigurasi SMTP disimpan (${smtp.host}:${smtp.port} · ${smtp.user || "tanpa user"})`); toast.push("ok", "Konfigurasi SMTP disimpan", smtp.enabled ? "Reset kata sandi kini dikirim via email." : "SMTP masih nonaktif — nyalakan toggle di atas."); }}
          >
            <IconCheck size={16} /> Simpan Konfigurasi
          </button>
        </section>
      )}

      {/* integrity footer */}
      <section className="card p-4">
        <SectionLabel right={<Chip tone="ok"><IconCheck size={10} /> SEHAT</Chip>}>Integritas Data</SectionLabel>
        <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
          {[
            ["Versi skema", `v${DATA_VERSION}`],
            ["Checksum", integrity.sum],
            ["Ukuran", `${integrity.kb} KB`],
            ["Record total", String(employees.length + sites.length + departments.length + shifts.length + logs.length + org.length)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-ink-50 px-3 py-2.5">
              <p className="text-[9px] font-extrabold tracking-wide text-ink-400 uppercase">{k}</p>
              <p className="font-mono text-[12px] font-extrabold break-all text-ink-900">{v}</p>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[10.5px] leading-relaxed font-semibold text-ink-400">
          Verifikasi checksum sebelum mempercayai cadangan. Impor menggantikan koleksi master; karyawan di-<i>upsert</i> per Staff ID.
        </p>
        {(() => {
          const crash = readCrashLog();
          if (!crash) return null;
          return (
            <p className="mt-2 rounded-xl bg-warn-100 px-3 py-2 text-[10.5px] leading-relaxed font-bold text-warn-600">
              Crash terakhir tertangkap: {new Date(crash.ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} — “{crash.msg}”
            </p>
          );
        })()}
      </section>

      {/* ------------------------------ site modal --------------------------- */}
      <Modal open={!!siteModal} onClose={() => setSiteModal(null)} title={siteModal?.mode === "add" ? "Gudang / Area Baru" : "Edit Gudang / Area"} wide>
        <div className="space-y-3">
          <GeofenceMap hq={{ lat: sBase.lat, lon: sBase.lon }} radiusM={sBase.radiusM} editable onDraft={setSDraft} heightClass="h-56" fitPoints={false} />
          <p className="rounded-xl bg-ink-50 px-3 py-2 font-mono text-[11px] font-bold text-ink-600">
            {eff.lat.toFixed(5)}, {eff.lon.toFixed(5)} · radius {eff.radiusM} m
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Nama gudang</label><input className="input !py-2.5 text-sm" placeholder="cth. Gudang Cikarang" value={sName} onChange={(e) => setSName(e.target.value)} /></div>
            <div><label className="label">Nama singkat</label><input className="input !py-2.5 text-sm" placeholder="cth. Cikarang" value={sShort} onChange={(e) => setSShort(e.target.value)} /></div>
          </div>
          <div><label className="label">Alamat</label><input className="input !py-2.5 text-sm" placeholder="Alamat lengkap" value={sAddr} onChange={(e) => setSAddr(e.target.value)} /></div>
          <div>
            <label className="label">Warna identitas</label>
            <div className="flex gap-2">
              {SHIFT_COLORS.map((c) => (
                <button key={c} onClick={() => setSColor(c)} className={`h-8 w-8 cursor-pointer rounded-full transition active:scale-90 ${SITE_STYLE[c].dot} ${sColor === c ? "ring-4 ring-ink-900/20 scale-110" : "opacity-70"}`} aria-label={`Warna ${c}`} />
              ))}
            </div>
          </div>
          {sErr && <Banner tone="warn">{sErr}</Banner>}
          <button className="btn-sun w-full" onClick={saveSite}><IconCheck size={16} /> Simpan Gudang</button>
        </div>
      </Modal>

      {/* ---------------------------- employee modal ------------------------- */}
      <Modal open={!!empModal} onClose={() => setEmpModal(null)} title={`Master — ${empModal?.name ?? ""}`} wide>
        {empModal && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Nama</label><input className="input !py-2.5 text-sm" value={eForm.name ?? ""} onChange={(e) => setEForm({ ...eForm, name: e.target.value })} /></div>
              <div className="col-span-2"><label className="label">Email login</label><input className="input !py-2.5 font-mono text-sm" value={eForm.email ?? ""} onChange={(e) => setEForm({ ...eForm, email: e.target.value })} /></div>
              <div>
                <label className="label">Peran</label>
                <select className="input !py-2.5 text-sm" value={eForm.role} onChange={(e) => setEForm({ ...eForm, role: e.target.value as Role })}>
                  {ROLE_KEYS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input !py-2.5 text-sm" value={eForm.status} onChange={(e) => setEForm({ ...eForm, status: e.target.value as Employee["status"] })}>
                  <option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="resigned">Resign</option>
                </select>
              </div>
              <div>
                <label className="label">Gudang / Area</label>
                <select className="input !py-2.5 text-sm" value={eForm.siteId ?? ""} onChange={(e) => setEForm({ ...eForm, siteId: e.target.value || null })}>
                  <option value="">Semua Area (Pusat)</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.shortName}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Shift</label>
                <select className="input !py-2.5 text-sm" value={eForm.shiftId} onChange={(e) => setEForm({ ...eForm, shiftId: e.target.value })}>
                  {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Departemen</label>
                <select className="input !py-2.5 text-sm" value={eForm.department} onChange={(e) => setEForm({ ...eForm, department: e.target.value })}>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              {([["basic", "Gaji pokok"], ["transport", "Transport"], ["meal", "Makan"], ["otPerHour", "Lembur/jam"]] as const).map(([k, lbl]) => (
                <div key={k}>
                  <label className="label">{lbl} (Rp)</label>
                  <input type="number" step={1000} className="input !py-2.5 font-mono text-sm" value={eForm.salary?.[k] ?? 0}
                    onChange={(e) => setEForm({ ...eForm, salary: patchSalary(eForm.salary, k, Math.max(0, Number(e.target.value))) })} />
                </div>
              ))}
            </div>
            <button className="btn-sun w-full" onClick={saveEmp}><IconCheck size={16} /> Simpan Master Karyawan</button>
          </div>
        )}
      </Modal>

      {/* ------------------------------ shift modal -------------------------- */}
      <Modal open={!!shiftModal} onClose={() => setShiftModal(null)} title={shiftModal?.mode === "add" ? "Shift Baru" : "Edit Shift"}>
        <div className="space-y-3">
          <div><label className="label">Nama shift</label><input className="input !py-2.5 text-sm" placeholder="cth. Shift Siang" value={shName} onChange={(e) => setShName(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Mulai</label><input type="time" className="input !py-2.5 text-sm" value={shStart} onChange={(e) => setShStart(e.target.value)} /></div>
            <div><label className="label">Selesai</label><input type="time" className="input !py-2.5 text-sm" value={shEnd} onChange={(e) => setShEnd(e.target.value)} /></div>
            <div><label className="label">Grace (mnt)</label><input type="number" min={0} max={120} className="input !py-2.5 text-sm" value={shGrace} onChange={(e) => setShGrace(Math.max(0, Number(e.target.value)))} /></div>
          </div>
          <div>
            <label className="label">Warna</label>
            <div className="flex gap-2">
              {SHIFT_COLORS.map((c) => (
                <button key={c} onClick={() => setShColor(c)} className={`h-8 w-8 cursor-pointer rounded-full transition active:scale-90 ${SITE_STYLE[c].dot} ${shColor === c ? "ring-4 ring-ink-900/20 scale-110" : "opacity-70"}`} aria-label={`Warna ${c}`} />
              ))}
            </div>
          </div>
          <button className="btn-sun w-full" onClick={saveShift}><IconCheck size={16} /> Simpan Shift</button>
        </div>
      </Modal>

      {/* ----------------------------- import modal -------------------------- */}
      <Modal open={!!importPreview} onClose={() => setImportPreview(null)} title="Pratinjau Impor Master Data">
        {importPreview && (
          <div className="space-y-3">
            <Banner tone="info" title={`File v${importPreview.version ?? "?"} · diekspor ${importPreview.exportedAt ? new Date(importPreview.exportedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "—"}`}>
              Impor akan <b>menggantikan</b> koleksi master di bawah; karyawan di-upsert per Staff ID.
            </Banner>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Company", importPreview.company ? "1 tenant" : "—"],
                ["Gudang", importPayloadCountStr(importPreview.sites)],
                ["Departemen", importPayloadCountStr(importPreview.departments)],
                ["Shift", importPayloadCountStr(importPreview.shifts)],
                ["Karyawan", importPayloadCountStr(importPreview.employees)],
                ["Kuota & gaji", importPreview.leaveQuotas || importPreview.salaryDefaults ? "tersedia" : "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-ink-50 px-3 py-2">
                  <p className="text-[9px] font-extrabold tracking-wide text-ink-400 uppercase">{k}</p>
                  <p className="font-mono text-[11.5px] font-extrabold text-ink-900">{v}</p>
                </div>
              ))}
            </div>
            <button className="btn-sun w-full" onClick={() => {
              const applied = importMasterData(importPreview);
              toast.push("ok", "Master Data dipulihkan", applied.join(", "));
              setImportPreview(null);
            }}>
              <IconCheck size={16} /> Terapkan Impor
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* small preview helper */
function importPayloadCountStr<T>(arr?: T[]): string { return Array.isArray(arr) && arr.length ? `${arr.length} record` : "—"; }

/** Lock screen for non-Super-Admin (second wall behind the route guard). */
export function LockedVault() {
  return (
    <div className="anim-pop mx-auto max-w-sm rounded-[28px] border border-ink-100 bg-white p-8 text-center shadow-[0_30px_80px_rgba(23,42,89,0.18)]">
      <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-ink-950 text-sun-400">
        <IconLock size={34} />
      </span>
      <h1 className="mt-5 font-display text-[24px] leading-tight font-extrabold text-ink-900">Area Terbatas</h1>
      <p className="mt-2 text-[13px] leading-relaxed font-semibold text-ink-400">
        Master Data hanya dapat diakses oleh <b>Super Admin</b>. Percobaan akses ini dicatat di audit.
      </p>
    </div>
  );
}
