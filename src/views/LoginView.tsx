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
  IconArrowRight, IconClock, IconEye, IconEyeOff, IconFace, IconLock, IconLogo, IconMail, IconPin, IconRefresh, IconShield,
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
  const { company, sites, activeSite, login, importIdentity, requestReset, consumeReset, resetPassword, smtp, deliverResetEmail } = useApp();
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

  /* ------------------------- forgot password flow ------------------------- */
  const [fpMode, setFpMode] = useState<null | "request" | "inbox" | "reset">(null);
  const [fpSentVia, setFpSentVia] = useState<"smtp" | "demo">("demo");
  const [fpEmail, setFpEmail] = useState("");
  const [fpToken, setFpToken] = useState("");
  const [fpName, setFpName] = useState("");
  const [fpNew, setFpNew] = useState("");
  const [fpConfirm, setFpConfirm] = useState("");
  const [fpErr, setFpErr] = useState("");
  const [fpBusy, setFpBusy] = useState(false);

  /* A real emailed link would arrive as …#reset=<token> — honor it on load */
  useEffect(() => {
    const m = window.location.hash.match(/^#reset=(.+)$/);
    if (!m) return;
    const res = consumeReset(decodeURIComponent(m[1]));
    if (res.ok) {
      setPhase("auth");
      if (!site && sites.length) setSite(sites[0]);
      setFpToken(decodeURIComponent(m[1]));
      setFpName(res.name ?? "");
      setFpMode("reset");
      setFpErr("");
    } else {
      setFpErr(res.error ?? "Tautan reset tidak valid.");
      setFpMode("request");
    }
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitForgot = async () => {
    if (!fpEmail.trim()) return setFpErr("Isi email terdaftar Anda.");
    setFpBusy(true);
    setFpErr("");
    await new Promise((r) => setTimeout(r, 600));
    const res = requestReset(fpEmail);
    if (!res.ok || !res.token) {
      setFpBusy(false);
      return setFpErr(res.error ?? "Gagal mengirim tautan.");
    }
    const token = res.token.token;
    setFpToken(token);
    const link = `${window.location.origin}${window.location.pathname}#reset=${token}`;
    /* real Gmail/SMTP delivery when the Super Admin configured it — demo inbox otherwise */
    const via = smtp.enabled ? await deliverResetEmail(fpEmail.trim(), res.name ?? "Rekan", link) : "demo";
    setFpBusy(false);
    setFpSentVia(via);
    setFpMode("inbox");
    if (via === "smtp") toast.push("ok", "Email reset terkirim", `Cek kotak masuk ${fpEmail.trim()} (serta folder Spam).`);
    else toast.push("info", "Tautan reset siap", "SMTP belum aktif — tautan ditampilkan di inbox simulasi.");
  };

  const openResetLink = () => {
    const res = consumeReset(fpToken);
    if (!res.ok) return setFpErr(res.error ?? "Tautan tidak valid.");
    setFpName(res.name ?? "");
    setFpErr("");
    setFpMode("reset");
  };

  const submitReset = () => {
    if (fpNew.length < 6) return setFpErr("Kata sandi minimal 6 karakter.");
    if (fpNew !== fpConfirm) return setFpErr("Konfirmasi kata sandi tidak sama.");
    const res = resetPassword(fpToken, fpNew);
    if (!res.ok) return setFpErr(res.error ?? "Reset gagal.");
    toast.push("ok", "Kata sandi diperbarui", `Silakan masuk, ${fpName || "rekan"}.`);
    setFpMode(null); setFpToken(""); setFpNew(""); setFpConfirm(""); setFpErr("");
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

              <p className="text-[10.5px] font-extrabold tracking-[0.16em] text-sun-600 uppercase">
                {fpMode ? "Pemulihan Akun" : "Langkah 2 dari 2 · Masuk"}
              </p>

              {fpMode === "request" && (
                <div className="anim-fade-up mt-2 space-y-3.5">
                  <p className="text-[12px] leading-relaxed font-semibold text-ink-400">
                    Masukkan email terdaftar — kami kirimkan tautan reset yang berlaku <b>30 menit</b> dan hanya bisa dipakai sekali.
                  </p>
                  <div>
                    <label className="label">Email terdaftar</label>
                    <div className="field-wrap">
                      <IconMail size={17} className="field-ico" />
                      <input type="email" className="input" placeholder="nama@perusahaan.co.id" value={fpEmail} onChange={(e) => setFpEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitForgot()} />
                    </div>
                  </div>
                  {fpErr && <p className="rounded-xl bg-danger-100 px-3.5 py-2.5 text-[12.5px] font-bold text-danger-600">{fpErr}</p>}
                  <button className="btn-sun w-full !py-4 text-base" onClick={submitForgot} disabled={fpBusy}>
                    {fpBusy ? "Mengirim tautan…" : <>Kirim Tautan Reset <IconArrowRight size={18} /></>}
                  </button>
                  <button className="w-full cursor-pointer text-center text-[12px] font-extrabold text-ink-400 underline decoration-dotted underline-offset-4 hover:text-sun-600" onClick={() => { setFpMode(null); setFpErr(""); }}>
                    Kembali ke login
                  </button>
                </div>
              )}

              {fpMode === "inbox" && fpSentVia === "smtp" && (
                <div className="anim-fade-up mt-2 space-y-3.5">
                  <div className="overflow-hidden rounded-2xl border border-ok-300 bg-ok-100/60 shadow-[0_16px_40px_rgba(21,154,109,0.15)]">
                    <div className="flex items-center gap-3 px-4 py-4">
                      <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-ok-500 to-teal-600 text-white shadow-[0_10px_24px_rgba(21,154,109,0.4)]">
                        <span className="halo-pulse absolute inset-0 rounded-2xl bg-ok-500/50" aria-hidden />
                        <IconMail size={22} className="relative" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-display text-[16px] leading-tight font-extrabold text-ink-900">Email terkirim ✉️</p>
                        <p className="text-[11.5px] font-bold text-ink-500">via {smtp.user || "SMTP"}</p>
                      </div>
                    </div>
                    <div className="space-y-2 border-t border-ok-300/60 bg-white/70 px-4 py-3.5">
                      <p className="text-[12px] leading-relaxed font-semibold text-ink-600">
                        Tautan reset meluncur ke <b className="text-ink-900">{fpEmail}</b>. Periksa kotak masuk — dan folder <b>Spam/Promosi</b> jika belum terlihat.
                      </p>
                      <ul className="space-y-1 text-[11px] font-semibold text-ink-400">
                        <li>• Berlaku 30 menit & sekali pakai</li>
                        <li>• Tautan membuka halaman pengaturan sandi baru</li>
                      </ul>
                    </div>
                  </div>
                  {fpErr && <p className="rounded-xl bg-danger-100 px-3.5 py-2.5 text-[12.5px] font-bold text-danger-600">{fpErr}</p>}
                  <div className="flex gap-2">
                    <button className="btn-ghost flex-1 !py-2.5 !text-[12.5px]" onClick={() => void submitForgot()} disabled={fpBusy}>
                      <IconRefresh size={13} /> {fpBusy ? "Mengirim…" : "Kirim Ulang"}
                    </button>
                    <button className="btn-ghost flex-1 !py-2.5 !text-[12.5px]" onClick={() => setFpSentVia("demo")}>
                      <IconEye size={13} /> Buka Inbox Simulasi
                    </button>
                  </div>
                  <button className="w-full cursor-pointer text-center text-[12px] font-extrabold text-ink-400 underline decoration-dotted underline-offset-4 hover:text-sun-600" onClick={() => { setFpMode(null); setFpErr(""); }}>
                    Kembali ke login
                  </button>
                </div>
              )}

              {fpMode === "inbox" && fpSentVia === "demo" && (
                <div className="anim-fade-up mt-2 space-y-3.5">
                  <p className="text-[12px] leading-relaxed font-semibold text-ink-400">
                    Tautan terkirim ke <b className="text-ink-700">{fpEmail}</b>. {smtp.enabled
                      ? "SMTP aktif namun pengiriman gagal — tautan ditampilkan di inbox simulasi di bawah."
                      : "SMTP belum diaktifkan oleh Super Admin (Master Data → Email & SMTP), jadi inbox-nya disimulasikan di bawah."}
                  </p>
                  <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-[0_16px_40px_rgba(23,42,89,0.12)]">
                    <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50 px-3.5 py-2">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-sun-400 to-sun-600 text-white"><IconMail size={14} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11.5px] font-extrabold text-ink-900">{company.appName ?? "Vittoria HR"} · Reset Kata Sandi</p>
                        <p className="truncate font-mono text-[9.5px] font-bold text-ink-400">no-reply@vittoria.co.id → {fpEmail}</p>
                      </div>
                      <span className="chip-ok !px-1.5 !py-0.5 !text-[8.5px]">BARU</span>
                    </div>
                    <div className="space-y-2.5 p-3.5">
                      <p className="text-[12px] leading-relaxed font-semibold text-ink-500">
                        Anda meminta reset kata sandi. Klik tombol di bawah atau salin kode token. Abaikan jika bukan Anda.
                      </p>
                      <button className="btn-sun w-full !py-3 !text-[14px]" onClick={openResetLink}>
                        <IconLock size={15} /> Atur Ulang Kata Sandi
                      </button>
                      <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-lg bg-ink-50 px-2.5 py-1.5 font-mono text-[10.5px] font-bold text-ink-500">{fpToken}</code>
                        <button className="btn-ghost !rounded-lg !px-2.5 !py-1.5 !text-[10.5px]" onClick={() => { navigator.clipboard?.writeText(fpToken).catch(() => undefined); toast.push("ok", "Token disalin"); }}>Salin</button>
                      </div>
                      <p className="text-[9.5px] font-bold text-ink-300">Berlaku 30 menit · sekali pakai · tercatat di audit</p>
                    </div>
                  </div>
                  {fpErr && <p className="rounded-xl bg-danger-100 px-3.5 py-2.5 text-[12.5px] font-bold text-danger-600">{fpErr}</p>}
                  <button className="w-full cursor-pointer text-center text-[12px] font-extrabold text-ink-400 underline decoration-dotted underline-offset-4 hover:text-sun-600" onClick={() => { setFpMode(null); setFpErr(""); }}>
                    Kembali ke login
                  </button>
                </div>
              )}

              {fpMode === "reset" && (
                <div className="anim-fade-up mt-2 space-y-3.5">
                  <p className="text-[12px] leading-relaxed font-semibold text-ink-400">
                    Tautan valid{fpName ? <> untuk <b className="text-ink-700">{fpName}</b></> : ""}. Buat kata sandi baru — minimal 6 karakter.
                  </p>
                  <div>
                    <label className="label">Kata sandi baru</label>
                    <div className="field-wrap">
                      <IconLock size={17} className="field-ico" />
                      <input type="password" className="input" value={fpNew} onChange={(e) => setFpNew(e.target.value)} autoComplete="new-password" />
                    </div>
                  </div>
                  <div>
                    <label className="label">Ulangi kata sandi baru</label>
                    <div className="field-wrap">
                      <IconLock size={17} className="field-ico" />
                      <input type="password" className="input" value={fpConfirm} onChange={(e) => setFpConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitReset()} autoComplete="new-password" />
                    </div>
                  </div>
                  {fpErr && <p className="rounded-xl bg-danger-100 px-3.5 py-2.5 text-[12.5px] font-bold text-danger-600">{fpErr}</p>}
                  <button className="btn-sun w-full !py-4 text-base" onClick={submitReset} disabled={!fpNew || !fpConfirm}>
                    Simpan & Kembali ke Login
                  </button>
                </div>
              )}

              {fpMode === null && (
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

                <button
                  type="button"
                  onClick={() => { setFpMode("request"); setFpErr(""); setFpEmail(email); }}
                  className="w-full cursor-pointer text-center text-[12px] font-extrabold text-sun-700 underline decoration-dotted underline-offset-4 transition hover:text-sun-600"
                >
                  Lupa kata sandi?
                </button>
              </form>
              )}
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
          Belum punya akun? Minta Admin HR membuatkan. Lupa sandi? Gunakan “Lupa kata sandi?” di atas.
        </p>
        <span className="hidden">{encodeIdentity(company)}</span>
      </div>
    </div>
  );
}
