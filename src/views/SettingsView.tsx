/**
 * Aturan/Sistem — Super Admin: branding (name, logo, brand color, identity
 * sharing), announcements, maintenance mode, backup. Admin: geofence map
 * editor (drag pin + radius handle), shifts with grace, holidays, face
 * threshold, GPS simulation, data tools, and the architecture notes.
 */
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/store";
import {
  applyBrand, BRAND_PRESETS, buildCsv, downloadTextFile, encodeIdentity, Shift,
} from "../lib/database";
import { formatMeters } from "../lib/geoUtils";
import { uid, wibShortDate } from "../lib/format";
import { useToast } from "../components/Toast";
import GeofenceMap, { GeoDraft } from "../components/GeofenceMap";
import { Banner, Chip, ConfirmButton, SectionLabel, Toggle } from "../components/bits";
import {
  IconBell, IconBuilding, IconCheck, IconClock, IconCpu, IconDatabase, IconDownload, IconPin, IconPlus, IconShield, IconStar, IconTrash, IconX,
} from "../components/icons";

function NumberField({ label, value, step, onCommit }: { label: string; value: number; step: number; onCommit: (v: number) => void }) {
  const [txt, setTxt] = useState(String(value));
  const [dirty, setDirty] = useState(false);
  useEffect(() => setTxt(String(value)), [value]);
  const commit = () => {
    const v = parseFloat(txt.replace(",", "."));
    if (!Number.isNaN(v)) onCommit(v);
    else setTxt(String(value));
    setDirty(false);
  };
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number" step={step}
        className={`input !py-2.5 font-mono text-sm ${dirty ? "!border-sun-400" : ""}`}
        value={dirty ? txt : String(value)}
        onChange={(e) => { setTxt(e.target.value); setDirty(true); }}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </div>
  );
}

function IdentityField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [txt, setTxt] = useState(value);
  const [dirty, setDirty] = useState(false);
  useEffect(() => setTxt(value), [value]);
  const commit = () => {
    if (txt.trim() && txt !== value) onCommit(txt.trim());
    else setTxt(value);
    setDirty(false);
  };
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className={`input !py-2.5 text-sm ${dirty ? "!border-sun-400" : ""}`}
        value={txt}
        onChange={(e) => { setTxt(e.target.value); setDirty(true); }}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </div>
  );
}

function storageKB(): number {
  try {
    let bytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("vittoria:")) bytes += k.length + (localStorage.getItem(k)?.length ?? 0);
    }
    return Math.round((bytes * 2) / 1024);
  } catch {
    return 0;
  }
}

const MODULE_MAP: Array<[string, string, string]> = [
  ["app.py", "App.tsx + views/", "Shell Streamlit → shell React (RBAC, dock, PWA)"],
  ["database.py", "lib/database.ts", "SQLite attendance.db → storage persisten"],
  ["face_engine.py", "lib/faceEngine.ts", "face_recognition → 128-D face-api + dHash"],
  ["geo_utils.py", "lib/geoUtils.ts", "geopy → Haversine & geofencing"],
  ["st.camera_input", "CameraCapture.tsx", "getUserMedia + reticle + liveness 2-frame"],
  ["streamlit-js-eval", "navigator.geolocation", "watchPosition GPS waktu-nyata"],
  ["pydeck", "GeofenceMap.tsx", "Peta asli Leaflet/OSM + radar SVG"],
];

export default function SettingsView() {
  const {
    session, company, employees, logs, settings, engine, shifts, geo,
    addShift, updateShift, removeShift, updateCompany, updateSettings, clearLogs, resetAll, audit,
  } = useApp();
  const toast = useToast();
  const isSuper = session?.role === "superadmin";

  const [geoDraft, setGeoDraft] = useState<GeoDraft | null>(null);

  /* branding */
  const [appName, setAppName] = useState(company.appName);
  const [appTagline, setAppTagline] = useState(company.appTagline);
  const logoRef = useRef<HTMLInputElement>(null);
  const [annText, setAnnText] = useState(company.announcement?.text ?? "");
  const [annTone, setAnnTone] = useState<"info" | "warn" | "danger">(company.announcement?.tone ?? "info");

  useEffect(() => { setAppName(company.appName); setAppTagline(company.appTagline); }, [company.appName, company.appTagline]);
  useEffect(() => {
    setAnnText(company.announcement?.text ?? "");
    setAnnTone(company.announcement?.tone ?? "info");
  }, [company.announcement]);

  const onLogoFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 200_000) return toast.push("warn", "Logo terlalu besar", "Maksimal 200 KB (PNG/JPG/SVG).");
    const reader = new FileReader();
    reader.onload = () => {
      updateCompany({ logo: String(reader.result) });
      audit("BRAND_UPDATE", company.id, "Logo diperbarui");
      toast.push("ok", "Logo diperbarui", "Tampil di header, login & slip.");
    };
    reader.readAsDataURL(f);
  };

  /* identity sharing */
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const copyIdentity = async (kind: "link" | "code") => {
    const code = encodeIdentity(company);
    const txt = kind === "link" ? `${window.location.origin}${window.location.pathname}#tenant=${encodeURIComponent(code)}` : code;
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
    toast.push("ok", kind === "link" ? "Tautan disalin" : "Kode disalin", "Tempel di perangkat lain untuk menerapkan identitas tenant.");
  };

  /* shifts */
  const [sName, setSName] = useState("");
  const [sStart, setSStart] = useState("08:00");
  const [sEnd, setSEnd] = useState("16:00");
  const [sGrace, setSGrace] = useState(15);
  const addNewShift = () => {
    if (sName.trim().length < 3) return toast.push("warn", "Nama shift minimal 3 karakter");
    addShift({ id: `sh-${uid("s").slice(-6)}`, name: sName.trim(), start: sStart, end: sEnd, graceMin: sGrace, color: "sun" });
    audit("SHIFT_CREATE", sName.trim(), `${sStart}–${sEnd} · grace ${sGrace} mnt`);
    toast.push("ok", "Shift ditambahkan", sName.trim());
    setSName("");
  };

  /* holidays */
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const addHoliday = () => {
    if (!holidayDate || !holidayName.trim()) return toast.push("warn", "Isi tanggal dan nama hari libur");
    const list = company.holidays ?? [];
    if (list.some((h) => h.date === holidayDate)) return toast.push("warn", "Tanggal sudah terdaftar");
    updateCompany({ holidays: [...list, { date: holidayDate, name: holidayName.trim() }] });
    audit("HOLIDAY_ADD", holidayDate, holidayName.trim());
    toast.push("ok", "Hari libur ditambahkan", `${holidayName.trim()} — tampil di semua kalender.`);
    setHolidayDate(""); setHolidayName("");
  };
  const removeHoliday = (date: string) => {
    updateCompany({ holidays: (company.holidays ?? []).filter((h) => h.date !== date) });
    toast.push("info", "Hari libur dihapus");
  };

  /* backup */
  const exportBackup = () => {
    const payload = { app: "vittoria-hr", version: "6", exportedAt: Date.now(), company, employees, logs, shifts };
    downloadTextFile(`vittoria-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json");
    audit("BACKUP_EXPORT", company.id, "Cadangan JSON diekspor");
    toast.push("ok", "Cadangan diekspor", "Simpan file JSON di tempat aman.");
  };

  return (
    <div className="space-y-5 pb-2">
      <div>
        <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">{isSuper ? "Sistem" : "Aturan"}</h1>
        <p className="mt-0.5 text-[13px] font-semibold text-ink-400">{isSuper ? "Branding, keamanan & cadangan tenant" : "Geofence, shift & kebijakan absensi"}</p>
      </div>

      {/* ------------------------- SUPER ADMIN: branding ------------------------- */}
      {isSuper && (
        <>
          <section className="card space-y-3.5 p-4">
            <SectionLabel right={<Chip tone="sun"><IconBuilding size={11} /> WHITE-LABEL</Chip>}>Kendali Perusahaan</SectionLabel>

            {/* live preview */}
            <div className="flex items-center gap-3 rounded-2xl bg-ink-50 p-3.5">
              {company.logo ? (
                <img src={company.logo} alt="" className="h-11 w-11 rounded-xl object-cover ring-1 ring-ink-100" />
              ) : (
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-sun-400 to-sun-600 text-white"><IconBuilding size={19} /></span>
              )}
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] leading-tight font-extrabold text-ink-900">{company.appName}</p>
                <p className="truncate text-[10.5px] font-bold text-ink-400">{company.appTagline}</p>
              </div>
              <Chip tone="ok" className="ml-auto shrink-0">LIVE</Chip>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <IdentityField label="Nama Aplikasi" value={appName} onCommit={(v) => { updateCompany({ appName: v }); audit("BRAND_UPDATE", company.id, `Nama → ${v}`); toast.push("ok", "Nama aplikasi diperbarui"); }} />
              <IdentityField label="Tagline" value={appTagline} onCommit={(v) => { updateCompany({ appTagline: v }); audit("BRAND_UPDATE", company.id, `Tagline → ${v}`); }} />
            </div>

            <div>
              <label className="label">Logo</label>
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onLogoFile(e.target.files?.[0])} />
              <div className="flex gap-2">
                <button className="btn-soft flex-1 !py-2.5 !text-[13px]" onClick={() => logoRef.current?.click()}>Unggah Logo (≤200 KB)</button>
                {company.logo && (
                  <button
                    className="btn-danger !py-2.5 !text-[13px]"
                    onClick={() => { updateCompany({ logo: null }); toast.push("info", "Logo dihapus", "Kembali ke lambang bawaan."); }}
                  >
                    <IconTrash size={13} /> Hapus
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="label">Warna Merek</label>
              <div className="grid grid-cols-3 gap-2">
                {BRAND_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { applyBrand(p.id); updateCompany({ brand: p.id }); audit("BRAND_UPDATE", company.id, `Warna → ${p.name}`); toast.push("ok", "Warna merek diterapkan", p.name); }}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition active:scale-95 ${
                      company.brand === p.id ? "border-sun-400 bg-sun-100/60 shadow-sm" : "border-ink-100 bg-white hover:border-ink-200"
                    }`}
                  >
                    <span className="h-5 w-5 shrink-0 rounded-full shadow-inner" style={{ background: p.swatch }} />
                    <span className="truncate text-[11px] font-extrabold text-ink-700">{p.name}</span>
                    {company.brand === p.id && <IconCheck size={13} className="ml-auto text-sun-600" />}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* identity sharing */}
          <section className="card space-y-2.5 p-4">
            <SectionLabel right={<Chip tone="sky"><IconShield size={11} /> SYNC</Chip>}>Identitas Antar-Perangkat</SectionLabel>
            <p className="text-[11.5px] leading-relaxed font-semibold text-ink-400">
              Aplikasi ini berjalan tanpa server — tiap perangkat menyimpan datanya sendiri. Kirim tautan/kode ini agar perangkat
              lain memakai <b className="text-ink-600">nama, logo & warna</b> tenant yang sama (berlaku saat dibuka di layar login).
            </p>
            <div className="flex gap-2">
              <button className="btn-sun flex-1 !py-2.5 !text-[13px]" onClick={() => void copyIdentity("link")}>
                {copied === "link" ? <><IconCheck size={14} /> Tersalin!</> : "Salin Tautan"}
              </button>
              <button className="btn-ghost flex-1 !py-2.5 !text-[13px]" onClick={() => void copyIdentity("code")}>
                {copied === "code" ? <><IconCheck size={14} /> Tersalin!</> : "Salin Kode"}
              </button>
            </div>
          </section>

          {/* announcement + maintenance */}
          <section className="card space-y-3 p-4">
            <SectionLabel right={<Chip tone="warn"><IconBell size={11} /> GLOBAL</Chip>}>Pengumuman</SectionLabel>
            <textarea
              className="input !py-2.5 text-sm" rows={2}
              placeholder="cth. Gudang tutup 17 Agu untuk upacara — absensi dinonaktifkan."
              value={annText}
              onChange={(e) => setAnnText(e.target.value)}
            />
            <div className="flex gap-1.5">
              {(["info", "warn", "danger"] as const).map((t) => (
                <button key={t} onClick={() => setAnnTone(t)} className={`cursor-pointer rounded-full px-3 py-1.5 text-[11px] font-extrabold uppercase transition ${
                  annTone === t ? (t === "danger" ? "bg-danger-500 text-white" : t === "warn" ? "bg-warn-500 text-white" : "bg-sky-500 text-white") : "bg-ink-100 text-ink-500"
                }`}>
                  {t === "info" ? "Info" : t === "warn" ? "Perhatian" : "Penting"}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                className="btn-sun flex-1 !py-2.5 !text-[13px]"
                disabled={!annText.trim()}
                onClick={() => { updateCompany({ announcement: { text: annText.trim(), tone: annTone } }); audit("ANNOUNCE", "all", annText.trim()); toast.push("ok", "Pengumuman tayang", "Tampil di atas semua layar."); }}
              >
                <IconBell size={14} /> Tayangkan
              </button>
              {company.announcement && (
                <button className="btn-ghost !py-2.5 !text-[13px]" onClick={() => { updateCompany({ announcement: null }); toast.push("info", "Pengumuman dicabut"); }}>
                  <IconX size={13} /> Cabut
                </button>
              )}
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-ink-100 px-3.5 py-2.5">
              <div>
                <p className="text-[13px] font-extrabold text-ink-900">Mode Pemeliharaan</p>
                <p className="text-[10.5px] font-semibold text-ink-400">Kunci staff & manajer; admin tetap masuk.</p>
              </div>
              <Toggle
                checked={company.maintenance}
                onChange={(v) => { updateCompany({ maintenance: v }); audit("MAINTENANCE", company.id, v ? "Mode pemeliharaan AKTIF" : "Mode pemeliharaan nonaktif"); toast.push(v ? "warn" : "ok", v ? "Mode pemeliharaan aktif" : "Pemeliharaan selesai"); }}
              />
            </div>
          </section>

          {/* about + backup */}
          <section className="card space-y-3 p-4">
            <SectionLabel right={<Chip tone="ink">v6.2</Chip>}>Tentang & Cadangan</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-ink-50 px-3 py-2 text-center">
                <p className="font-display text-[15px] font-extrabold text-ink-900">{employees.length}</p>
                <p className="text-[8.5px] font-extrabold tracking-wide text-ink-400 uppercase">Akun</p>
              </div>
              <div className="rounded-xl bg-ink-50 px-3 py-2 text-center">
                <p className="font-display text-[15px] font-extrabold text-ink-900">{logs.length}</p>
                <p className="text-[8.5px] font-extrabold tracking-wide text-ink-400 uppercase">Log</p>
              </div>
              <div className="rounded-xl bg-ink-50 px-3 py-2 text-center">
                <p className="font-display text-[15px] font-extrabold text-ink-900">{storageKB()} KB</p>
                <p className="text-[8.5px] font-extrabold tracking-wide text-ink-400 uppercase">Storage</p>
              </div>
            </div>
            <button className="btn-soft w-full !py-2.5 !text-[13px]" onClick={exportBackup}>
              <IconDownload size={14} /> Ekspor Cadangan JSON
            </button>
          </section>
        </>
      )}

      {/* ------------------------------ geofence ------------------------------ */}
      <section className="card space-y-3.5 p-4">
        <SectionLabel
          right={
            <Chip tone={geoDraft ? "warn" : "ok"}>
              <IconPin size={11} /> {geoDraft ? `${geoDraft.radiusM} m · draft` : `${company.radiusM} m · aktif`}
            </Chip>
          }
        >
          Geofence Gudang
        </SectionLabel>

        <GeofenceMap
          hq={{ lat: geoDraft?.lat ?? company.hqLat, lon: geoDraft?.lon ?? company.hqLon }}
          radiusM={geoDraft?.radiusM ?? company.radiusM}
          live={geo}
          editable
          fitPoints={false}
          heightClass="h-[300px]"
          onDraft={setGeoDraft}
        />

        {geoDraft ? (
          <div className="anim-fade-up space-y-2.5 rounded-2xl bg-ink-950 p-3.5 text-white">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="chip bg-white/10 font-mono !text-[10px] text-white/85">
                <IconPin size={10} /> {geoDraft.lat.toFixed(5)}, {geoDraft.lon.toFixed(5)}
              </span>
              <span className="chip bg-sun-500/20 font-mono !text-[10px] text-sun-300">RADIUS {geoDraft.radiusM} m</span>
            </div>
            <div className="flex gap-2">
              {geo && (geo.status === "locked" || geo.status === "sim") && (
                <button
                  className="btn-ghost flex-1 !border-white/20 !bg-white/10 !py-2.5 !text-[12px] !text-white hover:!bg-white/20"
                  onClick={() => setGeoDraft({ lat: geo.lat, lon: geo.lon, radiusM: geoDraft.radiusM })}
                >
                  <IconPin size={13} /> GPS saya
                </button>
              )}
              <button className="btn-ghost flex-1 !border-white/20 !bg-white/10 !py-2.5 !text-[12px] !text-white hover:!bg-white/20" onClick={() => setGeoDraft(null)}>
                Batal
              </button>
              <button
                className="btn-sun flex-[1.4] !py-2.5 !text-[13px]"
                onClick={() => {
                  updateCompany({ hqLat: geoDraft.lat, hqLon: geoDraft.lon, radiusM: geoDraft.radiusM });
                  audit("GEOFENCE_UPDATE", company.id, `HQ → ${geoDraft.lat.toFixed(5)}, ${geoDraft.lon.toFixed(5)} · radius ${geoDraft.radiusM} m (via peta)`);
                  toast.push("ok", "Geofence disimpan", `HQ baru & radius ${geoDraft.radiusM} m langsung berlaku.`);
                  setGeoDraft(null);
                }}
              >
                <IconCheck size={15} /> Simpan
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-ink-50 px-3 py-2 text-[11.5px] leading-relaxed font-semibold text-ink-400">
            <b className="text-ink-600">Geser pin oranye</b> untuk memilih area gudang, lalu <b className="text-ink-600">seret pegangan putih</b> di tepi
            lingkaran untuk menentukan radius secara manual. Berlaku setelah <b className="text-sun-700">Simpan</b> — tercatat di audit.
          </p>
        )}

        <details className="group rounded-xl border border-ink-100 bg-ink-50/60 px-3 py-2">
          <summary className="cursor-pointer list-none text-[11.5px] font-extrabold text-ink-500 select-none">
            Presisi manual <span className="text-ink-300">(koordinat & slider)</span>
          </summary>
          <div className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Latitude HQ" value={company.hqLat} step={0.0001} onCommit={(v) => { setGeoDraft(null); updateCompany({ hqLat: v }); audit("GEOFENCE_UPDATE", company.id, `Lat → ${v}`); }} />
              <NumberField label="Longitude HQ" value={company.hqLon} step={0.0001} onCommit={(v) => { setGeoDraft(null); updateCompany({ hqLon: v }); audit("GEOFENCE_UPDATE", company.id, `Lon → ${v}`); }} />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="label !mb-0">Radius maksimum</label>
                <span className="rounded-full bg-sun-100 px-2.5 py-0.5 font-display text-[14px] font-bold text-sun-700">{company.radiusM} m</span>
              </div>
              <input type="range" min={25} max={500} step={5} value={company.radiusM}
                onChange={(e) => { setGeoDraft(null); updateCompany({ radiusM: Number(e.target.value) }); }}
                onMouseUp={() => audit("GEOFENCE_UPDATE", company.id, `Radius → ${company.radiusM} m`)}
                className="w-full cursor-pointer" />
              <div className="flex justify-between font-mono text-[10px] font-semibold text-ink-300"><span>25 m</span><span>500 m</span></div>
            </div>
          </div>
        </details>

        <p className="rounded-xl bg-ink-50 px-3 py-2 text-[11.5px] leading-relaxed font-semibold text-ink-400">
          Jarak dihitung dengan rumus Haversine. Absensi di luar radius otomatis ditolak & diaudit.
        </p>
      </section>

      {/* engine */}
      <section className="card space-y-3 p-4">
        <SectionLabel right={
          <Chip tone={engine === "ai" ? "teal" : engine === "lite" ? "warn" : "ink"}>
            <IconCpu size={11} /> {engine === "ai" ? "AI Aktif · 128-D" : engine === "lite" ? "Mode Lite · dHash" : "Memuat model…"}
          </Chip>
        }>
          Mesin Wajah
        </SectionLabel>
        <div>
          <div className="flex items-center justify-between">
            <label className="label !mb-0">Ambang kecocokan (Δ maks)</label>
            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 font-mono text-[13px] font-bold text-teal-600">{settings.matchThreshold.toFixed(2)}</span>
          </div>
          <input type="range" min={0.3} max={0.7} step={0.05} value={settings.matchThreshold}
            onChange={(e) => updateSettings({ matchThreshold: Number(e.target.value) })} className="w-full cursor-pointer" />
          <div className="flex justify-between font-mono text-[10px] font-semibold text-ink-300"><span>0.30 ketat</span><span>0.70 longgar</span></div>
        </div>
        {engine === "lite" && (
          <Banner tone="warn" title="Model AI tidak termuat">
            Aplikasi memakai dHash agar tetap berfungsi offline. Sambungkan ke internet lalu muat ulang untuk 128-D penuh.
          </Banner>
        )}
      </section>

      {/* GPS simulation */}
      <section className="card space-y-3 p-4">
        <SectionLabel right={<Toggle checked={settings.simEnabled} onChange={(v) => updateSettings({ simEnabled: v })} />}>
          Simulasi GPS
        </SectionLabel>
        {settings.simEnabled ? (
          <div className="anim-fade-up space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Lat simulasi" value={settings.simLat} step={0.0001} onCommit={(v) => updateSettings({ simLat: v })} />
              <NumberField label="Lon simulasi" value={settings.simLon} step={0.0001} onCommit={(v) => updateSettings({ simLon: v })} />
            </div>
            <p className="rounded-xl bg-sky-100 px-3 py-2 text-[11.5px] leading-relaxed font-semibold text-sky-600">
              Mode simulasi: posisi diambil dari koordinat di atas (±10 m). Ubah menjauh dari HQ untuk melihat absensi ditolak.
            </p>
          </div>
        ) : (
          <p className="text-[12px] leading-relaxed font-semibold text-ink-400">
            Nyalakan untuk mencoba alur absensi tanpa berpindah tempat — berguna untuk demo dan pengujian geofence.
          </p>
        )}
      </section>

      {/* shifts */}
      <section className="card space-y-3 p-4">
        <SectionLabel right={<Chip tone="ink">{shifts.length} shift</Chip>}>Jadwal Shift</SectionLabel>
        <div className="space-y-2">
          {shifts.map((s: Shift) => (
            <div key={s.id} className="flex items-center gap-2.5 rounded-xl border border-ink-100 px-3 py-2.5">
              <span className={`h-8 w-1.5 rounded-full ${s.color === "sky" ? "bg-sky-500" : s.color === "grape" ? "bg-grape-500" : s.color === "teal" ? "bg-teal-500" : "bg-sun-500"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-extrabold text-ink-900">{s.name}</p>
                <p className="font-mono text-[10.5px] font-semibold text-ink-400">{s.start}–{s.end} · grace {s.graceMin} mnt</p>
              </div>
              <Chip tone="ink" className="!px-1.5 !py-0.5 !text-[9px]">
                {employees.filter((e) => e.shiftId === s.id).length} staff
              </Chip>
              <button
                className="cursor-pointer rounded-lg p-1.5 text-ink-300 transition hover:bg-danger-100 hover:text-danger-600 active:scale-90"
                onClick={() => { removeShift(s.id); audit("SHIFT_DELETE", s.id, `Shift ${s.name} dihapus`); toast.push("info", "Shift dihapus", s.name); }}
                aria-label={`Hapus ${s.name}`}
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[1.2fr_1fr_1fr_auto] items-end gap-2">
          <div>
            <label className="label">Nama</label>
            <input className="input !py-2 text-sm" placeholder="cth. Subuh" value={sName} onChange={(e) => setSName(e.target.value)} />
          </div>
          <div>
            <label className="label">Mulai</label>
            <input type="time" className="input !py-2 font-mono text-sm" value={sStart} onChange={(e) => setSStart(e.target.value)} />
          </div>
          <div>
            <label className="label">Selesai</label>
            <input type="time" className="input !py-2 font-mono text-sm" value={sEnd} onChange={(e) => setSEnd(e.target.value)} />
          </div>
          <button className="btn-sun !rounded-xl !px-3 !py-2" onClick={addNewShift} aria-label="Tambah shift"><IconPlus size={15} /></button>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label !mb-0">Grace period shift baru</label>
            <span className="rounded-full bg-ink-100 px-2.5 py-0.5 font-mono text-[12px] font-bold text-ink-600">{sGrace} mnt</span>
          </div>
          <input type="range" min={0} max={60} step={5} value={sGrace} onChange={(e) => setSGrace(Number(e.target.value))} className="w-full cursor-pointer" />
        </div>
        <span className="hidden"><IconClock size={1} />{void updateShift}</span>
      </section>

      {/* holidays */}
      <section className="card space-y-3 p-4">
        <SectionLabel right={<Chip tone="grape">{company.holidays?.length ?? 0} hari</Chip>}>Kalender Libur Perusahaan</SectionLabel>
        <div className="flex gap-2">
          <input type="date" className="input !py-2.5 text-sm" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
          <input
            className="input !py-2.5 text-sm" placeholder="Nama hari libur" value={holidayName}
            onChange={(e) => setHolidayName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && holidayDate && holidayName.trim() && addHoliday()}
          />
          <button className="btn-sun !rounded-xl !px-3.5" onClick={addHoliday} disabled={!holidayDate || !holidayName.trim()} aria-label="Tambah hari libur">
            <IconPlus size={15} />
          </button>
        </div>
        <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
          {(company.holidays ?? []).slice().sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
            <div key={h.date} className="anim-fade-up flex items-center gap-2.5 rounded-xl bg-ink-50 px-3 py-2">
              <IconStar size={13} className="shrink-0 text-grape-500" />
              <span className="shrink-0 font-mono text-[11.5px] font-bold text-ink-500">{wibShortDate(new Date(h.date + "T12:00:00+07:00"))}</span>
              <span className="flex-1 truncate text-[12.5px] font-extrabold text-ink-800">{h.name}</span>
              <button
                onClick={() => removeHoliday(h.date)}
                className="cursor-pointer rounded-lg p-1.5 text-ink-300 transition hover:bg-danger-100 hover:text-danger-600 active:scale-90"
                aria-label={`Hapus ${h.name}`}
              >
                <IconTrash size={13} />
              </button>
            </div>
          ))}
          {(company.holidays ?? []).length === 0 && (
            <p className="px-1 py-2 text-[12px] font-semibold text-ink-300">Belum ada hari libur terdaftar.</p>
          )}
        </div>
      </section>

      {/* data tools */}
      <section className="card space-y-3 p-4">
        <SectionLabel>Data & Penyimpanan</SectionLabel>
        <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2.5">
          <IconDatabase size={16} className="shrink-0 text-ink-400" />
          <p className="text-[12px] font-bold text-ink-600">{employees.length} pengguna · {logs.length} catatan absensi — tersimpan di perangkat ini.</p>
        </div>
        <button
          className="btn-soft w-full !py-3 text-sm"
          onClick={() => downloadTextFile("absensi-vittoria-lengkap.csv", buildCsv(logs), "text/csv;charset=utf-8")}
          disabled={logs.length === 0}
        >
          <IconDownload size={16} /> Ekspor semua log (CSV)
        </button>
        <div className="grid grid-cols-2 gap-2">
          <ConfirmButton label="Hapus Log" icon={<IconTrash size={15} />} onConfirm={clearLogs} className="btn-danger w-full !py-3 text-sm" />
          <ConfirmButton label="Reset Data" icon={<IconDatabase size={15} />} onConfirm={resetAll} className="btn-soft w-full !py-3 text-sm" confirmLabel="Reset semua?" />
        </div>
      </section>

      {/* architecture */}
      <section className="card p-4">
        <SectionLabel>Arsitektur Modul</SectionLabel>
        <div className="overflow-hidden rounded-xl border border-ink-100">
          {MODULE_MAP.map(([py, web, note], i) => (
            <div key={py} className={`grid grid-cols-[1fr_1.2fr] gap-2 px-3 py-2 ${i % 2 ? "bg-ink-50" : "bg-white"}`}>
              <span className="font-mono text-[11px] font-bold text-sun-700">{py}</span>
              <div>
                <span className="font-mono text-[11px] font-bold text-ink-800">{web}</span>
                <p className="text-[10.5px] font-semibold text-ink-400">{note}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[10px] leading-relaxed font-bold text-ink-300">
          Lapisan klien mendemokan JWT, storage & geofence secara lokal; produksi mengganti keduanya dengan auth server +
          PostgreSQL + PostGIS sesuai skema di dokumentasi.
        </p>
      </section>

      <footer className="pt-1 pb-2 text-center text-[11px] font-bold tracking-wide text-ink-300">
        {company.appName} · v6.2 · semua waktu WIB · {formatMeters(company.radiusM)} radius
      </footer>
    </div>
  );
}
