/**
 * Login — two-phase flow on a single morphing card:
 *   1) pick the Gudang/Area   2) enter email + password.
 * The last site is remembered; in the auth phase a tinted site badge lets
 * the user jump back to the picker without losing momentum.
 */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { decodeIdentity, encodeIdentity, SITE_STYLE, Site } from "../lib/database";
import { formatMeters } from "../lib/geoUtils";
import { wibClock, wibShortDate } from "../lib/format";
import { useToast } from "../components/Toast";
import {
  IconArrowRight, IconClock, IconEye, IconEyeOff, IconFace, IconLock, IconLogo, IconMail, IconPin, IconShield,
} from "../components/icons";

function LiveClockPill() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(iv);
  }, []);
  return (
    <div className="anim-fade-up mb-4 flex justify-center">
      <span className="chip-sun border border-sun-300/40 !px-3.5 !py-1.5 !text-[11px] shadow-sm tabular-nums">
        <IconClock size={13} /> {wibClock(now)} WIB · {wibShortDate(now)}
      </span>
    </div>
  );
}

export default function LoginView() {
  const { company, sites, activeSite, login, importIdentity } = useApp();
  const toast = useToast();

  /* remembered site → start straight on credentials for a fast return visit */
  const remembered = useMemo(() => {
    try { return localStorage.getItem("vittoria:last-site"); } catch { return null; }
  }, []);
  const [site, setSite] = useState<Site | null>(() => sites.find((s) => s.id === remembered) ?? null);
  const [phase, setPhase] = useState<"site" | "auth">(() => (remembered && sites.some((s) => s.id === remembered) ? "auth" : "site"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [lockLeft, setLockLeft] = useState(0);
  const [attempts, setAttempts] = useState(0);

  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (lockUntil <= Date.now()) return;
    const iv = window.setInterval(() => {
      const left = Math.ceil((lockUntil - Date.now()) / 1000);
      setLockLeft(left);
      if (left <= 0) setLockUntil(0);
    }, 250);
    return () => window.clearInterval(iv);
  }, [lockUntil]);

  const pickSite = (s: Site) => {
    setSite(s);
    setPhase("auth");
    setError("");
    try { localStorage.setItem("vittoria:last-site", s.id); } catch { /* private mode */ }
  };

  const applyCode = () => {
    const id = decodeIdentity(code);
    if (!id) return setCodeMsg({ ok: false, text: "Kode tidak valid — salin ulang dari menu Sistem Super Admin." });
    importIdentity(id, "kode manual");
    setCodeMsg({ ok: true, text: `Identitas "${id.appName}" diterapkan. Silakan login.` });
    toast.push("ok", "Identitas tenant diterapkan", id.appName);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || lockUntil > Date.now() || !site) return;
    if (!email.trim() || !password) {
      setError("Isi email dan kata sandi terlebih dahulu.");
      setShakeKey((k) => k + 1);
      return;
    }
    setBusy(true);
    setError("");
    const res = await login(email, password, site.id);
    setBusy(false);
    if (!res.ok) {
      const n = attempts + 1;
      setAttempts(n);
      setError(res.error ?? "Login gagal.");
      setShakeKey((k) => k + 1);
      if (n >= 5) {
        setLockUntil(Date.now() + 30_000);
        setLockLeft(30);
        setAttempts(0);
        setError("Terlalu banyak percobaan — coba lagi dalam 30 detik.");
      }
    }
  };

  const siteStyle = site ? SITE_STYLE[site.color] : null;

  return (
    <div className="app-bg relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8">
      {/* ambient layer */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <span className="floaty absolute -top-16 -left-16 h-64 w-64 rounded-full bg-sun-400/20 blur-3xl" />
        <span className="floaty absolute top-1/3 -right-20 h-72 w-72 rounded-full bg-sky-500/12 blur-3xl" style={{ animationDelay: "1.6s" }} />
        <span className="floaty absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-teal-500/12 blur-3xl" style={{ animationDelay: "3s" }} />
      </div>

      <div className="relative w-full max-w-sm">
        {/* brand header */}
        <div className="anim-fade-up mb-4 flex flex-col items-center text-center">
          <div className="relative">
            <span className="halo-pulse absolute inset-2 rounded-[28px] bg-sun-400/45" aria-hidden />
            <span className="orbit absolute -inset-3.5 rounded-full border-2 border-dashed border-sun-300/60" aria-hidden />
            <div className="ring-dots relative grid h-24 w-24 place-items-center rounded-[28px]">
              {company.logo ? (
                <img src={company.logo} alt={company.appName} className="anim-pop h-20 w-20 rounded-3xl object-cover shadow-[0_18px_40px_rgba(23,42,89,0.3)] ring-4 ring-white" />
              ) : (
                <IconLogo size={80} className="anim-pop drop-shadow-[0_18px_30px_rgba(240,115,0,0.35)]" />
              )}
            </div>
          </div>
          <h1 className="mt-4 font-display text-[30px] leading-none font-extrabold tracking-tight text-ink-900">
            {company.appName ?? "Vittoria HR"}
          </h1>
          <p className="mt-1 text-[13px] font-bold text-ink-400">{company.appTagline ?? "Absensi Wajah & Geofencing"}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            <span className="chip-sun !px-2 !py-1 !text-[9.5px]"><IconFace size={11} /> WAJAH 128-D</span>
            <span className="chip-teal !px-2 !py-1 !text-[9.5px]"><IconPin size={11} /> GEOFENCE GPS</span>
            <span className="chip-sky !px-2 !py-1 !text-[9.5px]"><IconShield size={11} /> SESI JWT</span>
          </div>
        </div>

        <LiveClockPill />

        {/* morphing card */}
        <div className="card anim-fade-up overflow-hidden">
          {phase === "site" ? (
            /* -------- phase 1: pick the Gudang/Area -------- */
            <div key="site" className="anim-fade-up p-5">
              <p className="text-[10.5px] font-extrabold tracking-[0.16em] text-sun-600 uppercase">Langkah 1 dari 2</p>
              <h2 className="mt-1 font-display text-[22px] leading-tight font-extrabold text-ink-900">Pilih Gudang / Area</h2>
              <p className="mt-1 text-[12.5px] leading-snug font-semibold text-ink-400">
                Setiap gudang punya geofence & struktur organisasinya sendiri.
              </p>
              <div className="mt-4 space-y-2.5">
                {sites.map((s, i) => {
                  const st = SITE_STYLE[s.color];
                  return (
                    <button
                      key={s.id}
                      onClick={() => pickSite(s)}
                      className="tile-pop group flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border-2 border-ink-100 bg-white p-3.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-[0_14px_32px_rgba(23,42,89,0.14)] active:scale-[0.98]"
                      style={{ animationDelay: `${120 + i * 70}ms` }}
                    >
                      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-[16px] bg-gradient-to-br ${st.grad} text-white shadow-[0_8px_18px_rgba(23,42,89,0.25)] transition-transform duration-150 group-hover:scale-105`}>
                        <IconPin size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[16px] leading-tight font-extrabold text-ink-900">{s.name}</span>
                        <span className="mt-0.5 block truncate text-[11px] font-semibold text-ink-400">{s.address}</span>
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 font-mono text-[9.5px] font-bold text-ink-500">
                          <IconShield size={10} /> radius {formatMeters(s.radiusM)}
                        </span>
                      </span>
                      <IconArrowRight size={18} className="shrink-0 text-ink-300 transition-all duration-150 group-hover:translate-x-1 group-hover:text-sun-600" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* -------- phase 2: credentials -------- */
            <div key="auth" className="anim-fade-up p-5">
              {/* site badge — tap to re-pick */}
              <button
                onClick={() => { setPhase("site"); setError(""); }}
                className="group mb-4 flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-ink-100 bg-ink-50/70 px-3 py-2.5 text-left transition hover:border-ink-200 hover:bg-ink-50"
                aria-label="Ganti gudang"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${siteStyle?.dot ?? "bg-ink-300"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] leading-tight font-extrabold text-ink-900">{site?.name ?? "Pilih gudang"}</span>
                  <span className="block text-[10px] font-bold text-ink-400">Ketuk untuk ganti area</span>
                </span>
                <IconArrowRight size={14} className="shrink-0 rotate-180 text-ink-300 transition group-hover:-translate-x-0.5 group-hover:text-sun-600" />
              </button>

              <p className="text-[10.5px] font-extrabold tracking-[0.16em] text-sun-600 uppercase">Langkah 2 dari 2 · Masuk</p>

              <form key={shakeKey} onSubmit={(e) => void submit(e)} className={`mt-2 space-y-3.5 ${error ? "anim-shake" : ""}`}>
                <div>
                  <label className="label">Email</label>
                  <div className="field-wrap">
                    <IconMail size={17} className="field-ico" />
                    <input type="email" className="input" placeholder="nama@perusahaan.co.id" value={email} autoComplete="username" onChange={(e) => setEmail(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="label">Kata Sandi</label>
                  <div className="field-wrap">
                    <IconLock size={17} className="field-ico" />
                    <input type={showPw ? "text" : "password"} className="input" placeholder="••••••••" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
                    <button type="button" className="field-eye" onClick={() => setShowPw((s) => !s)} aria-label="Tampilkan kata sandi">
                      {showPw ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                </div>

                {error && <p className="anim-fade-up rounded-xl bg-danger-100 px-3.5 py-2.5 text-[12.5px] font-bold text-danger-600">{error}</p>}

                <button type="submit" className={`btn-sun w-full !py-4 text-base bg-gradient-to-b ${siteStyle?.grad ?? ""}`} disabled={busy || lockUntil > Date.now() || !site}>
                  {lockUntil > Date.now() ? `Terkunci · ${lockLeft}s` : busy ? "Memverifikasi…" : <>Masuk <IconArrowRight size={18} /></>}
                </button>

                <div className="flex items-center justify-center gap-2 pt-1 text-[10.5px] font-bold text-ink-300">
                  <IconShield size={12} /> Sesi JWT · perangkat diikat saat login pertama
                </div>
              </form>
            </div>
          )}
        </div>

        {/* tenant identity for new devices */}
        <div className="anim-fade-up mt-4 text-center">
          <button
            onClick={() => { setCodeOpen((o) => !o); setCodeMsg(null); }}
            className="cursor-pointer text-[12px] font-extrabold text-ink-400 underline decoration-dotted underline-offset-4 transition hover:text-sun-600"
          >
            Perangkat baru? Terapkan kode identitas tenant
          </button>
          {codeOpen && (
            <div className="card anim-fade-up mt-3 space-y-2.5 p-4 text-left">
              <p className="text-[11.5px] leading-relaxed font-semibold text-ink-400">
                Tempel kode dari Super Admin (menu Sistem → Identitas) agar perangkat ini memakai nama, logo, dan warna perusahaan.
              </p>
              <textarea className="input !py-2.5 font-mono !text-[11px]" rows={3} placeholder="vt1.xxxxxxxx…" value={code} onChange={(e) => setCode(e.target.value)} />
              {codeMsg && <p className={`text-[11.5px] font-bold ${codeMsg.ok ? "text-ok-600" : "text-danger-600"}`}>{codeMsg.text}</p>}
              <div className="flex gap-2">
                <button className="btn-ghost flex-1 !py-2.5 !text-[13px]" onClick={() => setCodeOpen(false)}>Tutup</button>
                <button className="btn-sun flex-1 !py-2.5 !text-[13px]" onClick={applyCode} disabled={!code.trim()}>Terapkan</button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-[10.5px] font-bold text-ink-300">
          Belum punya akun atau lupa kata sandi? Akun dibuat & dipulihkan oleh Admin HR perusahaan Anda.
        </p>
        <span className="hidden">{encodeIdentity(company)}</span>
      </div>
    </div>
  );
}
