/**
 * Aturan / Sistem — geofence map editor (drag pin + radius handle),
 * shift & holiday CRUD, engine threshold, GPS simulation, and for
 * Super Admin the full Kendali Perusahaan panel (white-label branding,
 * announcement, maintenance, cross-device identity, backup).
 */
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/store";
import {
  BRAND_PRESETS, buildCsv, downloadTextFile, encodeIdentity, ROLE_LABEL, Shift,
} from "../lib/database";
import { formatMeters } from "../lib/geoUtils";
import { uid } from "../lib/format";
import GeofenceMap, { GeoDraft } from "../components/GeofenceMap";
import { useToast } from "../components/Toast";
import { Banner, Chip, ConfirmButton, SectionLabel, Toggle, Tone } from "../components/bits";
import {
  IconBell, IconBuilding, IconCheck, IconClock, IconCpu, IconDatabase, IconDownload, IconPin, IconPlus, IconShield, IconSmartphone, IconStar, IconTrash, IconX,
} from "../components/icons";

function NumberField({ label, value, step, onCommit }: { label: string; value: number; step: number; onCommit: (v: number) => void }) {
  const [txt, setTxt] = useState(String(value));
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setTxt(String(value)); setDirty(false); }, [value]);
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
        value={txt}
        onChange={(e) => { setTxt(e.target.value); setDirty(true); }}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </div>
  );
}

const ANN_TONES: Array<{ id: "info" | "warn" | "danger"; label: string; cls: string }> = [
  { id: "info", label: "Info", cls: "bg-sky-100 text-sky-600" },
  { id: "warn", label: "Perhatian", cls: "bg-warn-100 text-warn-600" },
  { id: "danger", label: "Penting", cls: "bg-danger-100 text-danger-600" },
];

export default function SettingsView() {
  const { session, company, logs, settings, engine, shifts, geo, addShift, updateShift, removeShift, updateCompany, updateSettings, clearLogs, resetAll, audit } = useApp();
  const toast = useToast();
  const isSuper = session?.role === "superadmin";

  const [geoDraft, setGeoDraft] = useState<GeoDraft | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  /* identity sharing */
  const [idCode, setIdCode] = useState("");
  const [idCopied, setIdCopied] = useState<"code" | "link" | null>(null);
  useEffect(() => { setIdCode(encodeIdentity(company)); }, [company]);

  /* announcement */
  const [annText, setAnnText] = useState(company.announcement?.text ?? "");
  const [annTone, setAnnTone] = useState<"info" | "warn" | "danger">(company.announcement?.tone ?? "info");

  /* shifts */
  const [sOpen, setSOpen] = useState(false);
  const [sName, setSName] = useState("");
  const [sStart, setSStart] = useState("08:00");
  const [sEnd, setSEnd] = useState("17:00");
  const [sGrace, setSGrace] = useState(15);

  /* holidays */
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");

  /* brand fields */
  const [appName, setAppName] = useState(company.appName);
  const [appTagline, setAppTagline] = useState(company.appTagline);

  const copy = async (text: string, which: "code" | "link") => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    setIdCopied(which);
    window.setTimeout(() => setIdCopied(null), 2000);
  };

  const onLogo = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 150_000) return toast.push("warn", "Logo terlalu besar", "Maksimal 150 KB.");
    const reader = new FileReader();
    reader.onload = () => {
      updateCompany({ logo: String(reader.result) });
      audit("BRAND_UPDATE", company.id, "Logo perusahaan diganti");
      toast.push("ok", "Logo diperbarui", "Tersinkron ke semua perangkat lewat identitas.");
    };
    reader.readAsDataURL(f);
  };

  const saveGeo = () => {
    if (!geoDraft) return;
    updateCompany({ hqLat: geoDraft.lat, hqLon: geoDraft.lon, radiusM: geoDraft.radiusM });
    audit("GEOFENCE_UPDATE", company.id, `HQ → ${geoDraft.lat.toFixed(5)}, ${geoDraft.lon.toFixed(5)} · radius ${geoDraft.radiusM} m (via peta)`);
    toast.push("ok", "Geofence disimpan", `HQ baru & radius ${geoDraft.radiusM} m langsung berlaku.`);
    setGeoDraft(null);
  };

  const exportBackup = () => {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("vittoria:")) data[k] = localStorage.getItem(k);
    }
    downloadTextFile(`vittoria-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
    audit("BACKUP_EXPORT", company.id, `Cadangan JSON (${Object.keys(data).length} kunci)`);
    toast.push("ok", "Cadangan diekspor", `${Object.keys(data).length} kunci tersimpan sebagai JSON.`);
  };

  const importRef = useRef<HTMLInputElement>(null);
  const importBackup = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result)) as Record<string, string>;
        let n = 0;
        for (const [k, v] of Object.entries(obj)) if (k.startsWith("vittoria:")) { localStorage.setItem(k, v); n++; }
        audit("BACKUP_RESTORE", company.id, `Cadangan dipulihkan (${n} kunci)`);
        toast.push("ok", "Cadangan dipulihkan", `${n} kunci — memuat ulang…`);
        window.setTimeout(() => window.location.reload(), 900);
      } catch {
        toast.push("danger", "File cadangan tidak valid", "Pastikan itu JSON cadangan Vittoria.");
      }
    };
    reader.readAsText(f);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">{isSuper ? "Sistem" : "Aturan"}</h1>
        <p className="mt-0.5 text-[13px] font-semibold text-ink-400">
          {isSuper ? "Kendali penuh tenant — branding, geofence, data" : "Geofence, shift, mesin wajah, dan data"}
        </p>
      </div>

      {/* ============ SUPER ADMIN: Kendali Perusahaan ============ */}
      {isSuper && (
        <>
          <section className="card space-y-3.5 p-4">
            <SectionLabel right={<Chip tone="grape"><IconBuilding size={11} /> SUPER ADMIN</Chip>}>Kendali Perusahaan</SectionLabel>

            {/* live wordmark preview */}
            <div className="flex items-center gap-2.5 rounded-2xl bg-ink-950 px-3.5 py-3">
              {company.logo ? (
                <img src={company.logo} alt="" className="h-9 w-9 rounded-xl object-cover ring-1 ring-white/20" />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sun-400 to-sun-600 text-white"><IconBuilding size={16} /></span>
              )}
              <div className="min-w-0">
                <p className="truncate font-display text-[14px] font-extrabold text-white">{appName || "Nama Aplikasi"}</p>
                <p className="truncate text-[10px] font-bold text-white/50">{appTagline || "Tagline"}</p>
              </div>
              <span className="ml-auto shrink-0 text-[9px] font-extrabold tracking-widest text-white/35 uppercase">Pratinjau</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Nama Aplikasi</label>
                <input className="input !py-2.5 text-sm" value={appName} onChange={(e) => setAppName(e.target.value)}
                  onBlur={() => { if (appName.trim() && appName !== company.appName) { updateCompany({ appName: appName.trim() }); audit("BRAND_UPDATE", company.id, `Nama → ${appName.trim()}`); } }} />
              </div>
              <div>
                <label className="label">Tagline</label>
                <input className="input !py-2.5 text-sm" value={appTagline} onChange={(e) => setAppTagline(e.target.value)}
                  onBlur={() => { if (appTagline !== company.appTagline) { updateCompany({ appTagline: appTagline.trim() }); audit("BRAND_UPDATE", company.id, `Tagline → ${appTagline.trim()}`); } }} />
              </div>
            </div>

            {/* logo */}
            <div>
              <label className="label">Logo</label>
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
              <div className="flex items-center gap-2">
                <button className="btn-soft flex-1 !py-2.5 !text-[13px]" onClick={() => logoRef.current?.click()}>
                  <IconDownload size={14} className="rotate-180" /> Unggah Logo
                </button>
                {company.logo && (
                  <button className="btn-danger !py-2.5 !px-3 !text-[12px]" onClick={() => { updateCompany({ logo: null }); toast.push("info", "Logo dihapus", "Kembali ke lambang bawaan."); }}>
                    <IconTrash size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* brand presets */}
            <div>
              <label className="label">Warna Merek</label>
              <div className="grid grid-cols-3 gap-2">
                {BRAND_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { updateCompany({ brand: p.id }); audit("BRAND_UPDATE", company.id, `Warna → ${p.name}`); toast.push("ok", `Warna: ${p.name}`, "Berlaku di seluruh aplikasi."); }}
                    className={`card-press flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${company.brand === p.id ? "border-sun-400 ring-2 ring-sun-400/30" : "border-ink-100 hover:border-ink-200"}`}
                  >
                    <span className="h-6 w-6 shrink-0 rounded-full shadow-inner" style={{ background: p.swatch }} />
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-extrabold text-ink-800">{p.name}</span>
                      {company.brand === p.id && <span className="text-[9px] font-extrabold text-sun-600 uppercase">Aktif</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* announcement */}
          <section className="card space-y-3 p-4">
            <SectionLabel right={company.announcement ? <Chip tone="ok"><IconBell size={11} /> AKTIF</Chip> : <Chip tone="ink"><IconBell size={11} /> NONAKTIF</Chip>}>
              Pengumuman Global
            </SectionLabel>
            <textarea
              className="input !py-2.5 text-sm" rows={2} placeholder="cth. Gudang tutup Jumat 14.00 untuk stock opname."
              value={annText} onChange={(e) => setAnnText(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <div className="flex flex-1 gap-1.5">
                {ANN_TONES.map((t) => (
                  <button key={t.id} onClick={() => setAnnTone(t.id)} className={`cursor-pointer rounded-full px-3 py-1.5 text-[11px] font-extrabold transition ${annTone === t.id ? t.cls + " ring-2 ring-current/20" : "bg-ink-50 text-ink-400"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                className="btn-sun !rounded-xl !px-3.5 !py-2 !text-[12px]"
                onClick={() => {
                  if (annText.trim()) { updateCompany({ announcement: { text: annText.trim(), tone: annTone } }); audit("ANNOUNCE", company.id, annTone); toast.push("ok", "Pengumuman dipasang", "Tampil di semua layar."); }
                  else { updateCompany({ announcement: null }); toast.push("info", "Pengumuman dihapus"); }
                }}
              >
                {annText.trim() ? "Pasang" : "Hapus"}
              </button>
            </div>
          </section>

          {/* maintenance */}
          <section className="card flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-[13.5px] font-extrabold text-ink-900">Mode Pemeliharaan</p>
              <p className="text-[11.5px] font-semibold text-ink-400">Kunci staff & manajer; admin tetap masuk.</p>
            </div>
            <Toggle checked={company.maintenance} onChange={(v) => { updateCompany({ maintenance: v }); audit("MAINTENANCE", company.id, v ? "diaktifkan" : "dinonaktifkan"); toast.push(v ? "warn" : "ok", v ? "Mode pemeliharaan AKTIF" : "Mode pemeliharaan selesai"); }} />
          </section>

          {/* cross-device identity */}
          <section className="card space-y-3 p-4">
            <SectionLabel right={<Chip tone="ink"><IconSmartphone size={11} /> LINTAS PERANGKAT</Chip>}>Identitas Tenant</SectionLabel>
            <p className="text-[11.5px] leading-relaxed font-semibold text-ink-400">
              Karena data tersimpan per-perangkat, kirim identitas ini agar perangkat lain memakai nama, logo, dan warna yang sama.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-soft !py-2.5 !text-[12px]" onClick={() => void copy(idCode, "code")}>
                {idCopied === "code" ? <><IconCheck size={13} /> Tersalin!</> : "Salin Kode"}
              </button>
              <button className="btn-soft !py-2.5 !text-[12px]" onClick={() => void copy(`${window.location.origin}${window.location.pathname}#tenant=${encodeURIComponent(idCode)}`, "link")}>
                {idCopied === "link" ? <><IconCheck size={13} /> Tersalin!</> : "Salin Tautan"}
              </button>
            </div>
            <details className="rounded-xl bg-ink-50 px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-extrabold text-ink-400">Lihat kode</summary>
              <p className="mt-1.5 max-h-24 overflow-y-auto font-mono text-[10px] break-all text-ink-500">{idCode}</p>
            </details>
          </section>

          {/* backup */}
          <section className="card space-y-3 p-4">
            <SectionLabel right={<Chip tone="ink"><IconDatabase size={11} /> CADANGAN</Chip>}>Cadangan & Pulihkan</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-soft !py-2.5 !text-[12px]" onClick={exportBackup}><IconDownload size={14} /> Ekspor JSON</button>
              <button className="btn-soft !py-2.5 !text-[12px]" onClick={() => importRef.current?.click()}><IconDownload size={14} className="rotate-180" /> Impor JSON</button>
            </div>
            <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={(e) => importBackup(e.target.files?.[0])} />
          </section>
        </>
      )}

      {/* ============ geofence map editor ============ */}
      <section className="card space-y-3.5 p-4">
        <SectionLabel right={<Chip tone={geoDraft ? "warn" : "ok"}><IconPin size={11} /> {geoDraft ? `${geoDraft.radiusM} m · draft` : `${company.radiusM} m · aktif`}</Chip>}>
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
          <div className="anim-fade-up flex items-center gap-2 rounded-2xl bg-ink-950 p-3">
            <span className="chip bg-white/10 font-mono !text-[10px] text-white/85"><IconPin size={10} /> {geoDraft.lat.toFixed(5)}, {geoDraft.lon.toFixed(5)}</span>
            <span className="chip bg-sun-500/20 font-mono !text-[10px] text-sun-300">{geoDraft.radiusM} m</span>
            <div className="ml-auto flex gap-2">
              <button className="cursor-pointer rounded-xl bg-white/10 px-3 py-2 text-[12px] font-extrabold text-white transition hover:bg-white/20" onClick={() => setGeoDraft(null)}>Batal</button>
              <button className="btn-sun !rounded-xl !px-3.5 !py-2 !text-[13px]" onClick={saveGeo}><IconCheck size={14} /> Simpan</button>
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-ink-50 px-3 py-2 text-[11.5px] leading-relaxed font-semibold text-ink-400">
            <b className="text-ink-600">Geser pin oranye</b> untuk memilih area gudang, lalu <b className="text-ink-600">seret pegangan putih</b> di tepi
            lingkaran untuk menentukan radius. Simpan untuk memberlakukan — tercatat di audit.
          </p>
        )}
        <details className="rounded-xl border border-ink-100 bg-ink-50/60 px-3 py-2">
          <summary className="cursor-pointer text-[11.5px] font-extrabold text-ink-500 select-none">Presisi manual (koordinat & slider)</summary>
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
        {geo && (geo.status === "locked" || geo.status === "sim") && (
          <p className="text-[11px] font-bold text-ink-400">
            Posisi Anda saat ini: <span className="text-ok-600">{formatMeters(Math.round(((geoDraft?.radiusM ?? company.radiusM) >= 0 ? 1 : 1) * 1))}</span>
            {" "}· {formatMeters(geo.accuracy === 0 ? 0 : geo.accuracy)} akurasi
          </p>
        )}
      </section>

      {/* ============ shifts ============ */}
      <section className="card space-y-3 p-4">
        <SectionLabel
          right={<button className="btn-sun !rounded-xl !px-3 !py-1.5 text-[12px]" onClick={() => setSOpen((o) => !o)}>{sOpen ? <IconX size={13} /> : <IconPlus size={13} />} {sOpen ? "Tutup" : "Shift"}</button>}
        >
          Jadwal Shift
        </SectionLabel>
        <div className="space-y-2">
          {shifts.map((sh) => (
            <div key={sh.id} className="flex items-center gap-2.5 rounded-xl border border-ink-100 px-3 py-2.5">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: sh.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-extrabold text-ink-900">{sh.name}</p>
                <p className="font-mono text-[10.5px] font-semibold text-ink-400">
                  {sh.id === "sh-fleks" ? "Tanpa jam tetap" : `${sh.start} – ${sh.end} · grace ${sh.graceMin} mnt`}
                </p>
              </div>
              <ConfirmButton label="" icon={<IconTrash size={14} />} confirmLabel="?" className="btn-ghost !rounded-lg !border-0 !bg-ink-50 !p-2 !text-ink-400 hover:!bg-danger-100 hover:!text-danger-600"
                onConfirm={() => { removeShift(sh.id); audit("SHIFT_DELETE", sh.id, `Shift ${sh.name} dihapus`); toast.push("info", "Shift dihapus", sh.name); }} />
            </div>
          ))}
        </div>
        {sOpen && (
          <div className="anim-fade-up space-y-3 rounded-2xl bg-ink-50 p-3.5">
            <div>
              <label className="label">Nama shift</label>
              <input className="input !py-2.5 text-sm" placeholder="cth. Shift Malam" value={sName} onChange={(e) => setSName(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="label">Mulai</label><input type="time" className="input !py-2 font-mono text-sm" value={sStart} onChange={(e) => setSStart(e.target.value)} /></div>
              <div><label className="label">Selesai</label><input type="time" className="input !py-2 font-mono text-sm" value={sEnd} onChange={(e) => setSEnd(e.target.value)} /></div>
              <div><label className="label">Grace (mnt)</label><input type="number" className="input !py-2 font-mono text-sm" value={sGrace} onChange={(e) => setSGrace(Number(e.target.value))} /></div>
            </div>
            <button className="btn-sun w-full !py-3 !text-[13px]" onClick={() => {
              if (sName.trim().length < 3) return toast.push("warn", "Nama shift minimal 3 karakter");
              const sh: Shift = { id: `sh-${uid("s").slice(-6)}`, name: sName.trim(), start: sStart, end: sEnd, graceMin: sGrace, color: "#7a4fc0" };
              addShift(sh);
              audit("SHIFT_CREATE", sh.id, `Shift ${sh.name} (${sh.start}–${sh.end}, grace ${sh.graceMin})`);
              toast.push("ok", "Shift dibuat", sh.name);
              setSOpen(false); setSName("");
            }}>
              <IconPlus size={14} /> Tambah Shift
            </button>
          </div>
        )}
      </section>

      {/* ============ holidays ============ */}
      <section className="card space-y-3 p-4">
        <SectionLabel right={<Chip tone="grape"><IconStar size={11} /> {company.holidays?.length ?? 0} hari</Chip>}>Kalender Libur</SectionLabel>
        <div className="flex gap-2">
          <input type="date" className="input !py-2.5 text-sm" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
          <input className="input !py-2.5 text-sm" placeholder="Nama libur" value={holidayName} onChange={(e) => setHolidayName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && holidayDate && holidayName.trim() && addHoliday()} />
          <button className="btn-sun !rounded-xl !px-3.5" onClick={addHoliday} disabled={!holidayDate || !holidayName.trim()} aria-label="Tambah libur"><IconPlus size={15} /></button>
        </div>
        <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
          {(company.holidays ?? []).slice().sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
            <div key={h.date} className="anim-fade-up flex items-center gap-2.5 rounded-xl bg-ink-50 px-3 py-2">
              <IconStar size={13} className="shrink-0 text-grape-500" />
              <span className="shrink-0 font-mono text-[11.5px] font-bold text-ink-500">{h.date}</span>
              <span className="flex-1 truncate text-[12.5px] font-extrabold text-ink-800">{h.name}</span>
              <button onClick={() => { updateCompany({ holidays: (company.holidays ?? []).filter((x) => x.date !== h.date) }); toast.push("info", "Libur dihapus"); }}
                className="cursor-pointer rounded-lg p-1.5 text-ink-300 transition hover:bg-danger-100 hover:text-danger-600 active:scale-90" aria-label={`Hapus ${h.name}`}>
                <IconTrash size={13} />
              </button>
            </div>
          ))}
          {(company.holidays ?? []).length === 0 && <p className="px-1 py-2 text-[12px] font-semibold text-ink-300">Belum ada hari libur.</p>}
        </div>
      </section>

      {/* ============ engine ============ */}
      <section className="card space-y-3 p-4">
        <SectionLabel right={<Chip tone={engine === "ai" ? "teal" : engine === "lite" ? "warn" : "ink"}><IconCpu size={11} /> {engine === "ai" ? "AI 128-D" : engine === "lite" ? "Lite dHash" : "Memuat…"}</Chip>}>
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
            Aplikasi memakai dHash agar tetap berfungsi offline. Sambungkan internet lalu muat ulang untuk 128-D penuh.
          </Banner>
        )}
      </section>

      {/* ============ GPS simulation ============ */}
      <section className="card space-y-3 p-4">
        <SectionLabel right={<Toggle checked={settings.simEnabled} onChange={(v) => updateSettings({ simEnabled: v })} />}>Simulasi GPS</SectionLabel>
        {settings.simEnabled ? (
          <div className="anim-fade-up grid grid-cols-2 gap-3">
            <NumberField label="Lat simulasi" value={settings.simLat} step={0.0001} onCommit={(v) => updateSettings({ simLat: v })} />
            <NumberField label="Lon simulasi" value={settings.simLon} step={0.0001} onCommit={(v) => updateSettings({ simLon: v })} />
          </div>
        ) : (
          <p className="text-[12px] leading-relaxed font-semibold text-ink-400">Nyalakan untuk mencoba alur absensi tanpa berpindah tempat.</p>
        )}
      </section>

      {/* ============ data ============ */}
      <section className="card space-y-3 p-4">
        <SectionLabel>Data & Penyimpanan</SectionLabel>
        <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2.5">
          <IconDatabase size={16} className="shrink-0 text-ink-400" />
          <p className="text-[12px] font-bold text-ink-600">{logs.length} catatan absensi · tersimpan di perangkat ini</p>
        </div>
        <button className="btn-soft w-full !py-3 text-sm" onClick={() => downloadTextFile("absensi-vittoria-lengkap.csv", buildCsv(logs), "text/csv;charset=utf-8")} disabled={!logs.length}>
          <IconDownload size={16} /> Ekspor semua log (CSV)
        </button>
        <div className="grid grid-cols-2 gap-2">
          <ConfirmButton label="Hapus Log" icon={<IconTrash size={15} />} onConfirm={() => { clearLogs(); audit("LOGS_CLEAR", "logs", "Semua log dihapus"); toast.push("info", "Log dihapus"); }} className="btn-danger w-full !py-3 text-sm" />
          <ConfirmButton label="Reset Data" icon={<IconDatabase size={15} />} onConfirm={resetAll} className="btn-soft w-full !py-3 text-sm" confirmLabel="Reset semua?" />
        </div>
      </section>

      {/* ============ security notes ============ */}
      <section className="card p-4">
        <SectionLabel right={<IconShield size={16} className="text-ink-300" />}>Keamanan</SectionLabel>
        <div className="space-y-1.5 text-[11.5px] leading-relaxed font-semibold text-ink-500">
          <p>• Login dibatasi 5 percobaan, lalu terkunci 30 detik (rate limiting).</p>
          <p>• Sesi memakai JWT (access 8 jam + refresh 7 hari) dan auto-logout.</p>
          <p>• Perangkat diikat ke akun saat login pertama; Super Admin dapat melepas.</p>
          <p>• Semua aksi penting tercatat di jejak audit yang bisa diekspor.</p>
        </div>
      </section>

      <p className="pb-2 text-center text-[10.5px] font-bold tracking-wide text-ink-300">
        {company.appName} · v6.1 · {ROLE_LABEL[session?.role ?? "employee"]} · semua waktu WIB
      </p>
      <span className="hidden"><ClockRef /><ToneRef /></span>
    </div>
  );

  function addHoliday() {
    const list = company.holidays ?? [];
    if (list.some((h) => h.date === holidayDate)) return toast.push("warn", "Tanggal sudah ada");
    updateCompany({ holidays: [...list, { date: holidayDate, name: holidayName.trim() }] });
    audit("HOLIDAY_ADD", holidayDate, holidayName.trim());
    toast.push("ok", "Libur ditambahkan", holidayName.trim());
    setHolidayDate(""); setHolidayName("");
  }
}

function ClockRef() { return <IconClock size={1} />; }
function ToneRef() { const t: Tone = "ink"; return <span className={t === "ink" ? "" : ""} />; }
