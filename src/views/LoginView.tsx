/**
 * Login — 1) choose your Gudang/Area, 2) email + password.
 * Rate limiting (5 attempts → 30s lock), tenant identity import for new
 * devices (paste code or #tenant=… link), live brand header.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store";
import { encodeIdentity, SITE_STYLE } from "../lib/database";
import { wibClock, wibShortDate } from "../lib/format";
import { buzz } from "../components/Toast";
import {
  IconArrowRight, IconBuilding, IconCheck, IconClock, IconEye, IconEyeOff, IconFace,
  IconLock, IconLogo, IconMail, IconPin, IconShield, IconUsers,
} from "../components/icons";

function LiveClockPill() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(iv);
  }, []);
  return (
    <div className="anim-fade-up mb-4 flex justify-center">
      <span className="chip-sun border border-sun-300/40 !px-3.5 !py-1.5 !text-[11px] shadow-sm">
        <IconClock size={13} /> {wibClock(now)} WIB · {wibShortDate(now)}
      </span>
    </div>
  );
}

export default function LoginView() {
  const { company, sites, employees, login, importIdentity } = useApp();

  /* ------------------------------ step 1: area ----------------------------- */
  const [step, setStep] = useState<"site" | "creds">("site");
  const [picked, setPicked] = useState<string | null>(() => {
    try {
      const last = localStorage.getItem("vittoria:sitechoice");
      const stored = last ? JSON.parse(last) : null;
      return typeof stored === "string" && sites.some((s) => s.id === stored) ? stored : null;
    } catch { return null; }
  });

  const teamCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of employees) if (e.siteId) m.set(e.siteId, (m.get(e.siteId) ?? 0) + 1);
    return m;
  }, [employees]);

  /* ---------------------------- step 2: credentials ------------------------ */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [lockLeft, setLockLeft] = useState(0);
  const attempts = useRef(0);

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

  const pickedSite = sites.find((s) => s.id === picked) ?? null;

  const applyCode = () => {
    try {
      const id = JSON.parse(code) as { appName?: string };
      if (!id || typeof id.appName !== "string") throw new Error("bad");
      importIdentity(id as never, "kode manual");
      setCodeMsg({ ok: true, text: `Identitas "${id.appName}" diterapkan. Silakan login.` });
    } catch {
      setCodeMsg({ ok: false, text: "Kode tidak valid — salin ulang dari menu Sistem Super Admin." });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || lockUntil > Date.now() || !pickedSite) return;
    if (!email.trim() || !password) {
      setError("Isi email dan kata sandi terlebih dahulu.");
      setShakeKey((k) => k + 1);
      return;
    }
    setBusy(true);
    setError("");
    const res = await login(email, password, pickedSite.id);
    setBusy(false);
    if (!res.ok) {
      attempts.current += 1;
      setError(res.error ?? "Login gagal.");
      setShakeKey((k) => k + 1);
      buzz([40, 60, 40]);
      if (attempts.current >= 5) {
        setLockUntil(Date.now() + 30_000);
        setLockLeft(30);
        attempts.current = 0;
        setError("Terlalu banyak percobaan — coba lagi dalam 30 detik.");
      }
    }
  };

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

        {/* ============================ STEP 1 — AREA ============================ */}
        {step === "site" && (
          <div className="card anim-fade-up space-y-3 p-5">
            <div>
              <p className="text-[10.5px] font-extrabold tracking-[0.16em] text-sun-600 uppercase">Langkah 1 dari 2</p>
              <h2 className="mt-0.5 font-display text-[21px] leading-tight font-extrabold text-ink-900">Pilih Gudang / Area</h2>
              <p className="mt-0.5 text-[12px] font-semibold text-ink-400">Absensi, struktur & geofence mengikuti area yang Anda pilih.</p>
            </div>

            <div className="space-y-2.5">
              {sites.map((s, i) => {
                const st = SITE_STYLE[s.color];
                const active = picked === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => { setPicked(s.id); buzz(12); }}
                    className={`tile-pop group relative flex w-full cursor-pointer items-center gap-3.5 overflow-hidden rounded-2xl border-2 p-3.5 text-left transition-all duration-200 active:scale-[0.98] ${
                      active
                        ? `border-transparent ring-2 ${st.ring} bg-white shadow-[0_16px_40px_rgba(23,42,89,0.16)] -translate-y-0.5`
                        : "border-ink-100 bg-white hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-[0_12px_30px_rgba(23,42,89,0.10)]"
                    }`}
                    style={{ animationDelay: `${i * 90}ms` }}
                  >
                    <span className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${st.grad}`} />
                    <span className={`grid h-13 w-13 shrink-0 place-items-center rounded-2xl p-3 text-white shadow-md bg-gradient-to-br ${st.grad}`}>
                      <IconBuilding size={24} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[16px] leading-tight font-extrabold text-ink-900">{s.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] font-semibold text-ink-400">{s.address}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={`chip !px-1.5 !py-0.5 !text-[9px] ${st.chip}`}><IconPin size={9} /> RADIUS {s.radiusM} M</span>
                        <span className="chip-ink !px-1.5 !py-0.5 !text-[9px]"><IconUsers size={9} /> {teamCount.get(s.id) ?? 0} TIM</span>
                      </span>
                    </span>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-all duration-200 ${
                      active ? `border-transparent bg-gradient-to-br ${st.grad} text-white shadow-md` : "border-ink-200 text-transparent"
                    }`}>
                      <IconCheck size={14} />
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              className="btn-sun w-full !py-4 text-base"
              disabled={!picked}
              onClick={() => { setStep("creds"); setError(""); }}
            >
              Lanjut ke Login <IconArrowRight size={17} />
            </button>
          </div>
        )}

        {/* ========================= STEP 2 — CREDENTIALS ======================== */}
        {step === "creds" && pickedSite && (
          <form key={shakeKey} onSubmit={(e) => void submit(e)} className={`card anim-fade-up space-y-3.5 p-5 ${error ? "anim-shake" : ""}`}>
            <button
              type="button"
              onClick={() => { setStep("site"); setError(""); }}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-ink-100 bg-ink-50/70 px-3 py-2.5 text-left transition hover:bg-ink-50`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${SITE_STYLE[pickedSite.color].grad} text-white shadow`}>
                <IconBuilding size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[9.5px] font-extrabold tracking-[0.14em] text-ink-400 uppercase">Area kerja</span>
                <span className="block truncate font-display text-[14px] leading-tight font-extrabold text-ink-900">{pickedSite.name}</span>
              </span>
              <span className="shrink-0 text-[10.5px] font-extrabold text-sun-600">Ganti</span>
            </button>

            <div>
              <label className="label">Email</label>
              <div className="field-wrap">
                <IconMail size={17} className="field-ico" />
                <input
                  type="email"
                  className="input"
                  placeholder="nama@perusahaan.co.id"
                  value={email}
                  autoComplete="username"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="label">Kata Sandi</label>
              <div className="field-wrap">
                <IconLock size={17} className="field-ico" />
                <input
                  type={showPw ? "text" : "password"}
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" className="field-eye" onClick={() => setShowPw((s) => !s)} aria-label="Tampilkan kata sandi">
                  {showPw ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="anim-fade-up rounded-xl bg-danger-100 px-3.5 py-2.5 text-[12.5px] font-bold text-danger-600">{error}</p>
            )}

            <button type="submit" className="btn-sun w-full !py-4 text-base" disabled={busy || lockUntil > Date.now()}>
              {lockUntil > Date.now()
                ? `Terkunci · ${lockLeft}s`
                : busy
                  ? "Memverifikasi…"
                  : `Masuk — ${pickedSite.shortName}`}
            </button>

            <div className="flex items-center justify-center gap-2 pt-1 text-[10.5px] font-bold text-ink-300">
              <IconShield size={12} /> Sesi JWT · perangkat diikat saat login pertama
            </div>
          </form>
        )}

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
              <textarea
                className="input !py-2.5 font-mono !text-[11px]"
                rows={3}
                placeholder="vt1.xxxxxxxx…"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              {codeMsg && (
                <p className={`text-[11.5px] font-bold ${codeMsg.ok ? "text-ok-600" : "text-danger-600"}`}>{codeMsg.text}</p>
              )}
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
