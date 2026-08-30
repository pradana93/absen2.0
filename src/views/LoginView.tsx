/**
 * Login — email + password against the tenant directory.
 * Rate limiting (5 attempts → 30s lock), tenant identity import for new
 * devices (paste code or #tenant=… link), live brand header.
 */
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/store";
import { decodeIdentity, encodeIdentity } from "../lib/database";
import { IconEye, IconEyeOff, IconLock, IconLogo, IconMail, IconShield } from "../components/icons";

export default function LoginView() {
  const { company, login, importIdentity } = useApp();
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

  const applyCode = () => {
    const id = decodeIdentity(code);
    if (!id) {
      setCodeMsg({ ok: false, text: "Kode tidak valid — salin ulang dari menu Sistem Super Admin." });
      return;
    }
    importIdentity(id, "kode manual");
    setCodeMsg({ ok: true, text: `Identitas "${id.appName}" diterapkan. Silakan login.` });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || lockUntil > Date.now()) return;
    if (!email.trim() || !password) {
      setError("Isi email dan kata sandi terlebih dahulu.");
      setShakeKey((k) => k + 1);
      return;
    }
    setBusy(true);
    setError("");
    const res = await login(email, password);
    setBusy(false);
    if (!res.ok) {
      attempts.current += 1;
      setError(res.error ?? "Login gagal.");
      setShakeKey((k) => k + 1);
      if (attempts.current >= 5) {
        setLockUntil(Date.now() + 30_000);
        setLockLeft(30);
        attempts.current = 0;
        setError("Terlalu banyak percobaan — coba lagi dalam 30 detik.");
      }
    }
  };

  return (
    <div className="app-bg flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* brand header */}
        <div className="anim-fade-up mb-5 flex flex-col items-center text-center">
          <div className="ring-dots grid h-24 w-24 place-items-center rounded-[28px]">
            {company.logo ? (
              <img src={company.logo} alt={company.appName} className="anim-pop h-20 w-20 rounded-3xl object-cover shadow-[0_18px_40px_rgba(23,42,89,0.3)] ring-4 ring-white" />
            ) : (
              <IconLogo size={80} className="anim-pop drop-shadow-[0_18px_30px_rgba(240,115,0,0.35)]" />
            )}
          </div>
          <h1 className="mt-3 font-display text-[30px] leading-none font-extrabold tracking-tight text-ink-900">
            {company.appName ?? "Vittoria HR"}
          </h1>
          <p className="mt-1 text-[13px] font-bold text-ink-400">{company.appTagline ?? "Absensi Wajah & Geofencing"}</p>
        </div>

        {/* form */}
        <form key={shakeKey} onSubmit={(e) => void submit(e)} className={`card anim-fade-up space-y-3.5 p-5 ${error ? "anim-shake" : ""}`}>
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
                : "Masuk"}
          </button>

          <div className="flex items-center justify-center gap-2 pt-1 text-[10.5px] font-bold text-ink-300">
            <IconShield size={12} /> Sesi JWT · perangkat diikat saat login pertama
          </div>
        </form>

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
