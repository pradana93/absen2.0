/** Aturan — geofence editor on a real map (per gudang), face threshold,
 *  GPS simulation, shift CRUD, identity sharing, data tools. (Admin HR+) */
import { useState } from "react";
import { useApp } from "../lib/store";
import { buildCsv, downloadTextFile, encodeIdentity, Shift, SITE_STYLE, SiteColor } from "../lib/database";
import { uid } from "../lib/format";
import GeofenceMap, { GeoDraft } from "../components/GeofenceMap";
import { useToast } from "../components/Toast";
import { Banner, Chip, ConfirmButton, SectionLabel, Toggle } from "../components/bits";
import { IconCheck, IconClock, IconCpu, IconDatabase, IconDownload, IconPin, IconPlus, IconShield, IconTrash, IconX } from "../components/icons";

function NumberField({ label, value, step, onCommit }: { label: string; value: number; step: number; onCommit: (v: number) => void }) {
  const [txt, setTxt] = useState(String(value));
  const [dirty, setDirty] = useState(false);
  const commit = () => {
    const v = parseFloat(txt.replace(",", "."));
    if (!Number.isNaN(v)) onCommit(v); else setTxt(String(value));
    setDirty(false);
  };
  return (
    <div>
      <label className="label">{label}</label>
      <input type="number" step={step} className={`input !py-2.5 font-mono text-sm ${dirty ? "!border-sun-400" : ""}`} value={dirty ? txt : String(value)}
        onChange={(e) => { setTxt(e.target.value); setDirty(true); }} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
    </div>
  );
}

const SHIFT_COLORS: SiteColor[] = ["sun", "sky", "teal", "grape", "coral"];

export default function SettingsView() {
  const { session, company, employees, logs, settings, engine, shifts, geo, activeSite, sites,
    addShift, updateShift, removeShift, updateSite, updateCompany, updateSettings, clearLogs, resetAll, audit, sql } = useApp();
  const toast = useToast();
  const isSuper = session?.role === "superadmin";

  /* geofence draft */
  const [draft, setDraft] = useState<GeoDraft | null>(null);
  const eff = draft ?? { lat: activeSite.hqLat, lon: activeSite.hqLon, radiusM: activeSite.radiusM };

  /* shift form */
  const [shOpen, setShOpen] = useState(false);
  const [shName, setShName] = useState("");
  const [shStart, setShStart] = useState("08:00");
  const [shEnd, setShEnd] = useState("16:00");
  const [shGrace, setShGrace] = useState(15);

  const addNewShift = () => {
    if (shName.trim().length < 3) return toast.push("warn", "Nama shift minimal 3 karakter");
    const sh: Shift = { id: `sh-${uid("s").slice(-6)}`, name: shName.trim(), start: shStart, end: shEnd, graceMin: shGrace, color: SHIFT_COLORS[shifts.length % SHIFT_COLORS.length] };
    addShift(sh);
    audit("SHIFT_CREATE", sh.id, `Shift "${sh.name}" ${sh.start}–${sh.end} (grace ${sh.graceMin} mnt)`);
    toast.push("ok", "Shift ditambahkan", sh.name);
    setShOpen(false); setShName("");
  };

  const copyIdentity = async (asLink: boolean) => {
    const code = encodeIdentity(company);
    const text = asLink ? `${window.location.origin}${window.location.pathname}#tenant=${encodeURIComponent(code)}` : code;
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    toast.push("ok", asLink ? "Tautan identitas disalin" : "Kode identitas disalin", asLink ? "Buka di perangkat baru — identitas langsung diterapkan." : "Tempel di login perangkat baru.");
    audit("IDENTITY_SHARE", company.id, asLink ? "Tautan identitas disalin" : "Kode identitas disalin");
  };

  return (
    <div className="space-y-5 pb-2">
      <div>
        <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">Aturan</h1>
        <p className="mt-0.5 text-[13px] font-semibold text-ink-400">Geofence, shift & identitas tenant</p>
      </div>

      {/* geofence editor */}
      <section className="card space-y-3.5 p-4">
        <SectionLabel
          right={
            <div className="flex items-center gap-1.5">
              <select className="input !w-auto !py-1.5 !text-[11px]" value={activeSite.id} onChange={(e) => { const s = sites.find((x) => x.id === e.target.value); if (s) { audit("SITE_SWITCH", s.id, `Konteks aturan pindah ke ${s.shortName}`); window.dispatchEvent(new Event("noop")); setDraft(null); } }}>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.shortName}</option>)}
              </select>
              <Chip tone={draft ? "warn" : "ok"}><IconPin size={11} /> {draft ? `${draft.radiusM} m · draft` : `${activeSite.radiusM} m · aktif`}</Chip>
            </div>
          }
        >
          Geofence Gudang
        </SectionLabel>

        <GeofenceMap hq={{ lat: eff.lat, lon: eff.lon }} radiusM={eff.radiusM} editable live={geo} onDraft={setDraft} heightClass="h-[300px]" fitPoints={false} />

        {draft ? (
          <div className="anim-fade-up space-y-2.5 rounded-2xl bg-ink-950 p-3.5 text-white">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="chip bg-white/10 font-mono !text-[10px] text-white/85"><IconPin size={10} /> {draft.lat.toFixed(5)}, {draft.lon.toFixed(5)}</span>
              <span className="chip bg-sun-500/20 font-mono !text-[10px] text-sun-300">RADIUS {draft.radiusM} m</span>
            </div>
            <div className="flex gap-2">
              {geo && (geo.status === "locked" || geo.status === "sim") && (
                <button className="btn-ghost flex-1 !border-white/20 !bg-white/10 !py-2.5 !text-[12px] !text-white hover:!bg-white/20" onClick={() => setDraft({ lat: geo.lat, lon: geo.lon, radiusM: draft.radiusM })}>
                  <IconPin size={13} /> Pusatkan ke GPS saya
                </button>
              )}
              <button className="btn-ghost flex-1 !border-white/20 !bg-white/10 !py-2.5 !text-[12px] !text-white hover:!bg-white/20" onClick={() => setDraft(null)}>Batal</button>
              <button className="btn-sun flex-[1.4] !py-2.5 !text-[13px]"
                onClick={() => {
                  updateSite(activeSite.id, { hqLat: draft.lat, hqLon: draft.lon, radiusM: draft.radiusM });
                  audit("GEOFENCE_UPDATE", activeSite.id, `HQ → ${draft.lat.toFixed(5)}, ${draft.lon.toFixed(5)} · radius ${draft.radiusM} m (via peta)`);
                  toast.push("ok", "Geofence disimpan", `${activeSite.shortName} · radius ${draft.radiusM} m langsung berlaku.`);
                  setDraft(null);
                }}>
                <IconCheck size={15} /> Simpan Geofence
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-ink-50 px-3 py-2 text-[11.5px] leading-relaxed font-semibold text-ink-400">
            <b className="text-ink-600">Geser pin oranye</b> untuk memilih area gudang, lalu <b className="text-ink-600">seret pegangan putih</b> untuk menentukan radius secara manual.
            Tersimpan setelah <b className="text-sun-700">Simpan</b> — tercatat di audit & mesin SQL.
          </p>
        )}

        <details className="group rounded-xl border border-ink-100 bg-ink-50/60 px-3 py-2">
          <summary className="cursor-pointer text-[11.5px] font-extrabold text-ink-500 select-none">Presisi manual (koordinat & slider)</summary>
          <div className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Latitude HQ" value={activeSite.hqLat} step={0.0001} onCommit={(v) => { setDraft(null); updateSite(activeSite.id, { hqLat: v }); audit("GEOFENCE_UPDATE", activeSite.id, `Lat → ${v}`); }} />
              <NumberField label="Longitude HQ" value={activeSite.hqLon} step={0.0001} onCommit={(v) => { setDraft(null); updateSite(activeSite.id, { hqLon: v }); audit("GEOFENCE_UPDATE", activeSite.id, `Lon → ${v}`); }} />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="label !mb-0">Radius maksimum</label>
                <span className="rounded-full bg-sun-100 px-2.5 py-0.5 font-display text-[14px] font-bold text-sun-700">{activeSite.radiusM} m</span>
              </div>
              <input type="range" min={25} max={500} step={5} value={activeSite.radiusM}
                onChange={(e) => { setDraft(null); updateSite(activeSite.id, { radiusM: Number(e.target.value) }); }}
                onMouseUp={() => audit("GEOFENCE_UPDATE", activeSite.id, `Radius → ${activeSite.radiusM} m`)} className="w-full cursor-pointer" />
            </div>
          </div>
        </details>
      </section>

      {/* engine */}
      <section className="card space-y-3 p-4">
        <SectionLabel right={<Chip tone={engine === "ai" ? "teal" : engine === "lite" ? "warn" : "ink"}><IconCpu size={11} /> {engine === "ai" ? "AI Aktif · 128-D" : engine === "lite" ? "Mode Lite · dHash" : "Memuat model…"}</Chip>}>
          Mesin Wajah
        </SectionLabel>
        <div>
          <div className="flex items-center justify-between">
            <label className="label !mb-0">Ambang kecocokan (Δ maks)</label>
            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 font-mono text-[13px] font-bold text-teal-600">{settings.matchThreshold.toFixed(2)}</span>
          </div>
          <input type="range" min={0.3} max={0.7} step={0.05} value={settings.matchThreshold} onChange={(e) => updateSettings({ matchThreshold: Number(e.target.value) })} className="w-full cursor-pointer" />
          <div className="flex justify-between font-mono text-[10px] font-semibold text-ink-300"><span>0.30 ketat</span><span>0.70 longgar</span></div>
        </div>
        {engine === "lite" && <Banner tone="warn" title="Model AI tidak termuat">Aplikasi memakai dHash agar tetap berfungsi offline. Muat ulang dengan internet untuk encoding 128-D penuh.</Banner>}
      </section>

      {/* GPS sim */}
      <section className="card space-y-3 p-4">
        <SectionLabel right={<Toggle checked={settings.simEnabled} onChange={(v) => updateSettings({ simEnabled: v })} />}>Simulasi GPS</SectionLabel>
        {settings.simEnabled ? (
          <div className="anim-fade-up space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Lat simulasi" value={settings.simLat} step={0.0001} onCommit={(v) => updateSettings({ simLat: v })} />
              <NumberField label="Lon simulasi" value={settings.simLon} step={0.0001} onCommit={(v) => updateSettings({ simLon: v })} />
            </div>
            <button className="btn-soft w-full !py-2.5 !text-[12px]" onClick={() => { updateSettings({ simLat: activeSite.hqLat + 0.0002, simLon: activeSite.hqLon + 0.0002 }); toast.push("info", "Simulasi dipusatkan", `Dekat ${activeSite.shortName} (± dalam radius).`); }}>
              <IconPin size={13} /> Pusatkan ke {activeSite.shortName}
            </button>
            <p className="rounded-xl bg-sky-100 px-3 py-2 text-[11px] leading-relaxed font-semibold text-sky-600">Mode demo: posisi diambil dari koordinat di atas (±10 m). Ubah menjauh dari HQ untuk melihat absensi ditolak.</p>
          </div>
        ) : (
          <p className="text-[12px] leading-relaxed font-semibold text-ink-400">Nyalakan untuk mencoba alur absensi tanpa berpindah tempat.</p>
        )}
      </section>

      {/* shifts */}
      <section className="card p-4">
        <SectionLabel right={<button className="btn-sun !rounded-xl !px-3 !py-2 !text-[12px]" onClick={() => setShOpen(!shOpen)}>{shOpen ? <IconX size={13} /> : <IconPlus size={13} />} Shift</button>}>
          Definisi Shift
        </SectionLabel>
        {shOpen && (
          <div className="anim-fade-up mb-3 space-y-2.5 rounded-2xl border border-ink-100 bg-ink-50/60 p-3">
            <input className="input !py-2.5 text-sm" placeholder="Nama shift (cth. Shift Sore)" value={shName} onChange={(e) => setShName(e.target.value)} />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">Mulai</label>
                <input type="time" className="input !py-2 font-mono text-sm" value={shStart} onChange={(e) => setShStart(e.target.value)} />
              </div>
              <div>
                <label className="label">Selesai</label>
                <input type="time" className="input !py-2 font-mono text-sm" value={shEnd} onChange={(e) => setShEnd(e.target.value)} />
              </div>
              <div>
                <label className="label">Grace (mnt)</label>
                <input type="number" min={0} className="input !py-2 font-mono text-sm" value={shGrace} onChange={(e) => setShGrace(Math.max(0, Number(e.target.value)))} />
              </div>
            </div>
            <button className="btn-sun w-full !py-2.5 !text-[13px]" onClick={addNewShift}><IconCheck size={14} /> Tambah Shift</button>
          </div>
        )}
        <div className="space-y-2">
          {shifts.map((s) => {
            const used = employees.filter((e) => e.shiftId === s.id).length;
            return (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white px-3 py-2.5">
                <span className={`h-3 w-3 shrink-0 rounded-full ${SITE_STYLE[(s.color as SiteColor) ?? "sun"].dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-extrabold text-ink-900">{s.name}</p>
                  <p className="font-mono text-[10.5px] font-semibold text-ink-400">{s.start}–{s.end} · grace {s.graceMin} mnt · {used} staff</p>
                </div>
                <button className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-danger-100 text-danger-600 transition hover:bg-danger-500 hover:text-white active:scale-90 disabled:opacity-40"
                  disabled={used > 0} onClick={() => { removeShift(s.id); audit("SHIFT_DELETE", s.id, `Shift "${s.name}" dihapus`); toast.push("info", "Shift dihapus", s.name); }}
                  title={used > 0 ? "Masih dipakai staff" : "Hapus shift"} aria-label={`Hapus ${s.name}`}><IconTrash size={14} /></button>
              </div>
            );
          })}
        </div>
      </section>

      {/* identity sharing */}
      <section className="card p-4">
        <SectionLabel right={<IconShield size={16} className="text-ink-300" />}>Identitas Tenant</SectionLabel>
        <p className="text-[12px] leading-relaxed font-semibold text-ink-400">
          Bawa nama, logo & warna <b className="text-ink-700">{company.appName}</b> ke perangkat baru — buka tautannya atau tempel kodenya di layar login.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn-soft !py-2.5 !text-[12px]" onClick={() => void copyIdentity(true)}>Salin Tautan</button>
          <button className="btn-soft !py-2.5 !text-[12px]" onClick={() => void copyIdentity(false)}>Salin Kode</button>
        </div>
      </section>

      {/* data tools */}
      <section className="card space-y-3 p-4">
        <SectionLabel>Data & Penyimpanan</SectionLabel>
        <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2.5">
          <IconDatabase size={16} className="shrink-0 text-ink-400" />
          <p className="text-[12px] font-bold text-ink-600">
            {employees.length} pengguna · {logs.length} log · mesin SQL {sql.status === "ready" ? `v${sql.version} (${sql.sizeKB} KB)` : sql.status === "fallback" ? "fallback cache" : "memuat…"}
          </p>
        </div>
        <button className="btn-soft w-full !py-3 text-sm" onClick={() => downloadTextFile("absensi-vittoria-lengkap.csv", buildCsv(logs), "text/csv;charset=utf-8")} disabled={!logs.length}>
          <IconDownload size={16} /> Ekspor semua log (CSV)
        </button>
        <div className="grid grid-cols-2 gap-2">
          <ConfirmButton label="Hapus Log" icon={<IconTrash size={15} />} onConfirm={() => { clearLogs(); audit("LOGS_CLEAR", "logs", "Semua log absensi dihapus"); toast.push("info", "Log dihapus"); }} className="btn-danger w-full !py-3 text-sm" />
          <ConfirmButton label="Reset Data" icon={<IconDatabase size={15} />} onConfirm={resetAll} className="btn-soft w-full !py-3 text-sm" confirmLabel="Reset semua?" />
        </div>
        {!isSuper && <p className="text-[10.5px] font-bold text-ink-300">Master Data & branding dikelola Super Admin.</p>}
      </section>

      <footer className="pt-1 pb-2 text-center text-[11px] font-bold tracking-wide text-ink-300">
        {company.appName} · v7.0 · SQLite embedded · semua waktu WIB
      </footer>
      <span className="hidden"><IconClock size={1} /></span>
    </div>
  );
}
