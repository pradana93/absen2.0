/**
 * Login — pick Gudang/Area first, then email + password.
 * Includes rate limiting, tenant identity import, and the forgot-password
 * flow (real SMTP when configured, simulated inbox otherwise).
 */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { decodeIdentity, encodeIdentity, SITE_STYLE, SiteColor } from "../lib/database";
import { wibClock, wibShortDate } from "../lib/format";
import { useToast } from "../components/Toast";
import {
  IconArrowRight, IconCheck, IconClock, IconEye, IconEyeOff, IconFace, IconLock, IconLogo, IconMail, IconPin, IconRefresh, IconShield,
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
  const { company, sites, siteId, switchSite, login, importIdentity, requestReset, consumeReset, resetPassword, smtp, deliverResetEmail } = useApp();
  const toast = useToast();

  const remembered = useMemo(() => {
    try { return localStorage.getItem("vittoria:last-site"); } catch { return null; }
  }, []);

  const [step, setStep] = useState<"site" | "creds">(remembered ? "creds" : "site");
  const site = sites.find((s) => s.id === siteId) ?? sites[0];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [lockLeft, setLockLeft] = useState(0);
  const attempts = useMemo(() => ({ n: 0 }), []);

  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /* forgot password */
  const [fpMode, setFpMode] = useState<null | "request" | "inbox" | "reset">(null);
  const [fpEmail, setFpEmail] = useState("");
  const [fpToken, setFpToken] = useState("");
  const [fpName, setFpName] = useState("");
  const [fpNew, setFpNew] = useState("");
  const [fpConfirm, setFpConfirm] = useState("");
  const [fpErr, setFpErr] = useState("");
  const [fpBusy, setFpBusy] = useState(false);
  const [fpSentVia, setFpSentVia] = useState<"smtp" | "demo">("demo");

  useEffect(() => {
    if (lockUntil <= Date.now()) return;
    const iv = window.setInterval(() => {
      const left = Math.ceil((lockUntil - Date.now()) / 1000);
      setLockLeft(left);
      if (left <= 0) setLockUntil(0);
    }, 250);
    return () => window.clearInterval(iv);
  }, [lockUntil]);

  const pickSite = (id: string) => {
    switchSite(id);
    try { localStorage.setItem("vittoria:last-site", id); } catch { /* noop */ }
    setStep("creds");
    setError("");
  };

  const applyCode = () => {
    const id = decodeIdentity(code);
    if (!id) { setCodeMsg({ ok: false, text: "Kode tidak valid — salin ulang dari menu Sistem Super Admin." }); return; }
    importIdentity(id, "kode manual");
    setCodeMsg({ ok: true, text: `Identitas "${id.appName}" diterapkan. Silakan login.` });
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
      attempts.n += 1;
      setError(res.error ?? "Login gagal.");
      setShakeKey((k) => k + 1);
      if (attempts.n >= 5) {
        setLockUntil(Date.now() + 30_000);
        setLockLeft(30);
        attempts.n = 0;
        setError("Terlalu banyak percobaan — coba lagi dalam 30 detik.");
      }
    }
  };

  const submitForgot = async () => {
    if (!fpEmail.trim()) return setFpErr("Isi email terdaftar Anda.");
    setFpBusy(true);
    setFpErr("");
    const res = requestReset(fpEmail);
    if (!res.ok || !res.token) { setFpBusy(false); return setFpErr(res.error ?? "Gagal mengirim tautan."); }
    setFpToken(res.token.token);
    const link = `${window.location.origin}${window.location.pathname}#reset=${res.token.token}`;
    const via = await deliverResetEmail(fpEmail.trim(), res.name ?? "Rekan", link);
    setFpSentVia(via);
    setFpMode("inbox");
    setFpBusy(false);
    toast.push("info", "Tautan reset dikirim", via === "smtp" ? `Email sungguhan ke ${fpEmail.trim()}.` : `Ke ${fpEmail.trim()} (inbox simulasi).`);
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

  /* deep link #reset=TOKEN (from the emailed link) */
  useEffect(() => {
    const m = window.location.hash.match(/^#reset=(.+)$/);
    if (!m) return;
    window.history.replaceState(null, "", window.location.pathname);
    setFpToken(m[1]);
    setFpMode("request");
    const res = consumeReset(m[1]);
    if (res.ok) { setFpName(res.name ?? ""); setFpMode("reset"); }
    else setFpErr(res.error ?? "Tautan tidak valid.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-bg relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8">
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
          <h1 className="mt-4 font-display text-[30px] leading-none font-extrabold tracking-tight text-ink-900">{company.appName ?? "Vittoria HR"}</h1>
          <p className="mt-1 text-[13px] font-bold text-ink-400">{company.appTagline ?? "Absensi Wajah & Geofencing"}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            <span className="chip-sun !px-2 !py-1 !text-[9.5px]"><IconFace size={11} /> WAJAH 128-D</span>
            <span className="chip-teal !px-2 !py-1 !text-[9.5px]"><IconPin size={11} /> GEOFENCE GPS</span>
            <span className="chip-sky !px-2 !py-1 !text-[9.5px]"><IconShield size={11} /> SESI JWT + SQL</span>
          </div>
        </div>

        <LiveClockPill />

        {/* STEP 1 — site picker */}
        {step === "site" && fpMode === null && (
          <div className="card anim-fade-up space-y-3.5 p-5">
            <div>
              <p className="font-display text-[19px] font-extrabold text-ink-900">Pilih Gudang / Area</p>
              <p className="mt-0.5 text-[12px] font-semibold text-ink-400">Absensi Anda mengikuti geofence gudang yang dipilih.</p>
            </div>
            <div className="space-y-2.5">
              {sites.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => pickSite(s.id)}
                  className="tile-pop card card-press flex w-full cursor-pointer items-center gap-3.5 border-ink-100 p-4 text-left transition-all hover:border-sun-400 hover:shadow-[0_14px_36px_rgba(240,115,0,0.14)]"
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${SITE_STYLE[(s.color as SiteColor) ?? "sun"].grad} text-white shadow-[0_8px_20px_rgba(23,42,89,0.25)]`}>
                    <IconPin size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[16px] leading-tight font-extrabold text-ink-900">{s.name}</span>
                    <span className="block truncate text-[11px] font-semibold text-ink-400">{s.address} · radius {s.radiusM} m</span>
                  </span>
                  <IconArrowRight size={17} className="shrink-0 text-ink-300" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2 — credentials */}
        {step === "creds" && fpMode === null && (
          <div className="anim-fade-up">
            <button onClick={() => setStep("site")} className="mb-2.5 flex cursor-pointer items-center gap-1.5 text-[12px] font-extrabold text-ink-400 transition hover:text-sun-600">
              <IconArrowRight size={13} className="rotate-180" /> Ganti gudang
            </button>
            <div key={shakeKey} className={`card space-y-3.5 p-5 ${error ? "anim-shake" : ""}`}>
              {site && (
                <div className={`flex items-center gap-2.5 rounded-xl bg-gradient-to-r ${SITE_STYLE[(site.color as SiteColor) ?? "sun"].grad} px-3.5 py-2.5 text-white`}>
                  <IconPin size={16} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[13.5px] leading-tight font-extrabold">{site.name}</p>
                    <p className="text-[10px] font-bold text-white/75">Geofence {site.radiusM} m aktif</p>
                  </div>
                  <button onClick={() => setStep("site")} className="shrink-0 cursor-pointer rounded-lg bg-white/20 px-2 py-1 text-[10px] font-extrabold transition hover:bg-white/30">GANTI</button>
                </div>
              )}
              <div>
                <label className="label">Email</label>
                <div className="field-wrap">
                  <IconMail size={17} className="field-ico" />
                  <input type="email" className="input" placeholder="nama@vittoria.co.id" value={email} autoComplete="username" onChange={(e) => setEmail(e.target.value)} />
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
              {error && <p className="rounded-xl bg-danger-100 px-3.5 py-2.5 text-[12.5px] font-bold text-danger-600">{error}</p>}
              <button className="btn-sun w-full !py-4 text-base" disabled={busy || lockUntil > Date.now()} onClick={(e) => void submit(e as unknown as React.FormEvent)}>
                {lockUntil > Date.now() ? `Terkunci · ${lockLeft}s` : busy ? "Memverifikasi…" : "Masuk"}
              </button>
              <div className="flex items-center justify-between pt-0.5">
                <button onClick={() => { setFpMode("request"); setFpErr(""); }} className="cursor-pointer text-[12px] font-extrabold text-sun-700 underline decoration-dotted underline-offset-4 hover:text-sun-600">
                  Lupa kata sandi?
                </button>
                <span className="flex items-center gap-1 text-[10px] font-bold text-ink-300"><IconShield size={11} /> perangkat diikat saat login pertama</span>
              </div>
            </div>
          </div>
        )}

        {/* forgot password — request */}
        {fpMode === "request" && (
          <div className="card anim-fade-up mt-2 space-y-3.5 p-5">
            <p className="font-display text-[19px] font-extrabold text-ink-900">Reset Kata Sandi</p>
            <p className="text-[12px] leading-relaxed font-semibold text-ink-400">
              Masukkan email terdaftar. {smtp.enabled && smtp.user ? "Tautan reset akan dikirim ke inbox Anda via email." : "Build ini memakai inbox simulasi (SMTP dapat diatur oleh Super Admin)."}
            </p>
            <div className="field-wrap">
              <IconMail size={17} className="field-ico" />
              <input type="email" className="input" placeholder="nama@vittoria.co.id" value={fpEmail} onChange={(e) => setFpEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submitForgot()} />
            </div>
            {fpErr && <p className="rounded-xl bg-danger-100 px-3.5 py-2.5 text-[12.5px] font-bold text-danger-600">{fpErr}</p>}
            <button className="btn-sun w-full !py-3.5" onClick={() => void submitForgot()} disabled={fpBusy}>
              {fpBusy ? "Mengirim…" : <><IconMail size={16} /> Kirim Tautan Reset</>}
            </button>
            <button className="w-full cursor-pointer text-center text-[12px] font-extrabold text-ink-400 underline decoration-dotted underline-offset-4 hover:text-sun-600" onClick={() => { setFpMode(null); setFpErr(""); }}>
              Kembali ke login
            </button>
          </div>
        )}

        {/* forgot password — inbox (real or simulated) */}
        {fpMode === "inbox" && (
          <div className="anim-fade-up mt-2 space-y-3.5">
            {fpSentVia === "smtp" ? (
              <div className="card space-y-3 p-5 text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ok-100 text-ok-600"><IconMail size={28} /></span>
                <p className="font-display text-[18px] font-extrabold text-ink-900">Email terkirim ✉️</p>
                <p className="text-[12.5px] leading-relaxed font-semibold text-ink-400">
                  Tautan reset dikirim ke <b className="text-ink-700">{fpEmail}</b>. Cek inbox (dan folder Spam). Berlaku 30 menit, sekali pakai.
                </p>
                <button onClick={() => void submitForgot()} className="btn-soft w-full !py-2.5 !text-[12.5px]"><IconRefresh size={14} /> Kirim ulang</button>
              </div>
            ) : (
              <div className="card space-y-3.5 p-4">
                <p className="text-[12px] leading-relaxed font-semibold text-ink-400">
                  Tautan terkirim ke <b className="text-ink-700">{fpEmail}</b>. SMTP belum aktif — inbox disimulasikan di bawah (Super Admin dapat mengaktifkan email sungguhan di Master Data).
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
                    <p className="text-[12px] leading-relaxed font-semibold text-ink-500">Anda meminta reset kata sandi. Klik tombol di bawah. Abaikan jika bukan Anda.</p>
                    <button className="btn-sun w-full !py-3 !text-[14px]" onClick={openResetLink}><IconLock size={15} /> Atur Ulang Kata Sandi</button>
                    <p className="text-[9.5px] font-bold text-ink-300">Berlaku 30 menit · sekali pakai · tercatat di audit</p>
                  </div>
                </div>
                {fpErr && <p className="rounded-xl bg-danger-100 px-3.5 py-2.5 text-[12.5px] font-bold text-danger-600">{fpErr}</p>}
                <button className="w-full cursor-pointer text-center text-[12px] font-extrabold text-ink-400 underline decoration-dotted underline-offset-4 hover:text-sun-600" onClick={() => { setFpMode(null); setFpErr(""); }}>
                  Kembali ke login
                </button>
              </div>
            )}
          </div>
        )}

        {/* forgot password — set new */}
        {fpMode === "reset" && (
          <div className="card anim-fade-up mt-2 space-y-3.5 p-5">
            <p className="text-[12px] leading-relaxed font-semibold text-ink-400">
              Tautan valid{fpName ? <> untuk <b className="text-ink-700">{fpName}</b></> : ""}. Buat kata sandi baru — minimal 6 karakter.
            </p>
            <div className="field-wrap">
              <IconLock size={17} className="field-ico" />
              <input type="password" className="input" placeholder="Kata sandi baru" value={fpNew} onChange={(e) => setFpNew(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="field-wrap">
              <IconLock size={17} className="field-ico" />
              <input type="password" className="input" placeholder="Ulangi kata sandi baru" value={fpConfirm} onChange={(e) => setFpConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitReset()} autoComplete="new-password" />
            </div>
            {fpErr && <p className="rounded-xl bg-danger-100 px-3.5 py-2.5 text-[12.5px] font-bold text-danger-600">{fpErr}</p>}
            <button className="btn-sun w-full !py-4 text-base" onClick={submitReset} disabled={!fpNew || !fpConfirm}>
              <IconCheck size={17} /> Simpan & Kembali ke Login
            </button>
          </div>
        )}

        {/* tenant identity import */}
        <div className="anim-fade-up mt-4 text-center">
          <button onClick={() => { setCodeOpen((o) => !o); setCodeMsg(null); }} className="cursor-pointer text-[12px] font-extrabold text-ink-400 underline decoration-dotted underline-offset-4 transition hover:text-sun-600">
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
