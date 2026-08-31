/**
 * Absen — the clock-in/out pipeline: liveness (2-frame) → face identity
 * (128-D, Δ ≤ threshold) → geofence (Haversine ≤ radius) with GPS accuracy
 * gate, photo evidence, duplicate guard, success burst and manual fallback.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store";
import { AttendanceType } from "../lib/database";
import { formatCoord, formatMeters } from "../lib/geoUtils";
import { todayKey, uid, wibDayKey, wibTime } from "../lib/format";
import { extractSignature, identifyBest, quickHash } from "../lib/faceEngine";
import CameraCapture from "../components/CameraCapture";
import { useToast } from "../components/Toast";
import { Banner, Chip, InitialsAvatar, PageHeader, SuccessBurst } from "../components/bits";
import { IconAlert, IconCamera, IconCheck, IconCrosshair, IconFace, IconPin, IconX } from "../components/icons";

type StepKey = "face" | "identity" | "fence";
type StepState = "idle" | "busy" | "ok" | "fail";

interface Result {
  ok: boolean;
  title: string;
  desc: string;
  matchedName?: string;
  matchedId?: string;
  lateMin?: number;
  overtimeMin?: number;
}

function toThumb(canvas: HTMLCanvasElement | null): string | null {
  if (!canvas) return null;
  try {
    const w = 160;
    const h = Math.max(1, Math.round((canvas.height / canvas.width) * w));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(canvas, 0, 0, w, h);
    const out = c.toDataURL("image/jpeg", 0.55);
    return out.length < 48_000 ? out : null;
  } catch {
    return null;
  }
}

export default function AttendView({ initialType }: { initialType: AttendanceType }) {
  const { session, employees, logs, breaks, shifts, activeSite, settings, engine, geo, fence, addLog, audit } = useApp();
  const toast = useToast();
  const me = session!;
  const company = activeSite; // geofence now follows the chosen Gudang/Area

  const [type, setType] = useState<AttendanceType>(initialType);
  useEffect(() => setType(initialType), [initialType]);

  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(false);
  const [step, setStep] = useState<Record<StepKey, StepState>>({ face: "idle", identity: "idle", fence: "idle" });
  const [result, setResult] = useState<Result | null>(null);
  const [manualShown, setManualShown] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const today = todayKey();
  const threshold = settings.matchThreshold;

  const myVerifiedToday = useMemo(
    () => logs.filter((l) => l.staffId === me.staffId && wibDayKey(new Date(l.ts)) === today && l.status === "VERIFIED"),
    [logs, me.staffId, today],
  );
  const alreadyIn = !!myVerifiedToday.find((l) => l.type === "IN");
  const alreadyOut = !![...myVerifiedToday].reverse().find((l) => l.type === "OUT");
  const suggested: AttendanceType = alreadyIn && !alreadyOut ? "OUT" : "IN";

  const hasFace = !!me.descriptor || !!me.hash;
  const hasGps = !!fence;

  const steps: Array<{ key: StepKey; label: string; icon: React.ReactNode }> = [
    { key: "face", label: "Deteksi Wajah", icon: <IconFace size={16} /> },
    { key: "identity", label: "Identitas 128-D", icon: <IconCheck size={16} /> },
    { key: "fence", label: "Geofence GPS", icon: <IconPin size={16} /> },
  ];

  const resetPipeline = () => {
    setStep({ face: "idle", identity: "idle", fence: "idle" });
    setResult(null);
    setManualShown(false);
    setPhoto(null);
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const onCapture = async (canvas: HTMLCanvasElement, dataUrl: string, frame1?: HTMLCanvasElement) => {
    setBusy(true);
    canvasRef.current = canvas;
    setPhoto(dataUrl);
    setResult(null);
    setStep({ face: "busy", identity: "idle", fence: "idle" });

    /* 1) liveness — identical frames mean a static image, not a live face */
    if (frame1 && quickHash(frame1) === quickHash(canvas)) {
      setStep({ face: "fail", identity: "idle", fence: "idle" });
      setBusy(false);
      setResult({
        ok: false, title: "Liveness gagal",
        desc: "Dua frame identik — terdeteksi gambar statis (foto/cetakan), bukan wajah hidup. Pastikan wajahmu bergerak alami, lalu coba lagi.",
      });
      toast.push("warn", "Liveness gagal", "Terdeteksi gambar statis — anti-fraud menolak verifikasi.");
      audit(`CLOCK_${type}_REJECT`, "liveness", "Ditolak: dua frame identik (gambar statis)");
      return;
    }

    /* 2) face signature + identity match against MY baseline */
    const sig = await extractSignature(canvas);
    setStep({ face: "ok", identity: "busy", fence: "idle" });
    await sleep(350);

    const best = identifyBest(sig, [{ staffId: me.staffId, descriptor: me.descriptor, hash: me.hash }], threshold);
    const faceOk = !!best && best.match.staffId === me.staffId;

    if (!faceOk) {
      setStep({ face: "ok", identity: "fail", fence: "idle" });
      setBusy(false);
      const who = identifyBest(sig, employees.map((e) => ({ staffId: e.staffId, descriptor: e.descriptor, hash: e.hash })), threshold);
      setResult({
        ok: false,
        title: "Wajah tidak cocok",
        desc: who
          ? `Wajah terdeteksi milik ${employees.find((e) => e.staffId === who.match.staffId)?.name ?? who.match.staffId}, bukan akun yang login.`
          : sig.faceFound || sig.hash
            ? `Jarak wajah melebihi ambang ${threshold.toFixed(2)}. Pastikan pencahayaan cukup dan coba lagi.`
            : "Wajah tidak terdeteksi pada foto. Posisikan wajah di dalam bingkai, lalu coba lagi.",
      });
      toast.push("warn", "Verifikasi wajah gagal", "Wajah tidak cocok dengan akun yang login.");
      setManualShown(true);
      return;
    }

    /* 3) geofence with accuracy gate */
    setStep({ face: "ok", identity: "ok", fence: "busy" });
    await sleep(350);

    if (!geo || (geo.status !== "locked" && geo.status !== "sim")) {
      setStep({ face: "ok", identity: "ok", fence: "fail" });
      setBusy(false);
      setResult({
        ok: false, title: "GPS tidak tersedia",
        desc: "Lokasi tidak dapat diverifikasi. Aktifkan GPS atau gunakan mode simulasi di menu Aturan.",
      });
      toast.push("danger", "Absensi ditolak", "GPS tidak tersedia untuk verifikasi lokasi.");
      audit(`CLOCK_${type}_REJECT`, me.staffId, "Ditolak: GPS tidak tersedia");
      setManualShown(true);
      return;
    }
    if (!geo.simulated && geo.accuracy > 60) {
      setStep({ face: "ok", identity: "ok", fence: "fail" });
      setBusy(false);
      setResult({
        ok: false, title: "Akurasi GPS rendah",
        desc: `Akurasi saat ini ±${Math.round(geo.accuracy)} m (maks 60 m). Pindah ke area terbuka lalu coba lagi.`,
      });
      toast.push("warn", "GPS kurang akurat", `±${Math.round(geo.accuracy)} m — butuh ≤ 60 m.`);
      setManualShown(true);
      return;
    }

    const verdict = fence!;
    const distanceM = Math.round(verdict.distanceM * 10) / 10;
    const source: "gps" | "sim" = geo.simulated ? "sim" : "gps";

    /* duplicate guard */
    if (type === "IN" && alreadyIn) {
      setStep({ face: "ok", identity: "ok", fence: verdict.inside ? "ok" : "fail" });
      setBusy(false);
      setResult({ ok: false, title: "Sudah Check-In", desc: `Check-In tercatat ${wibTime(new Date(myVerifiedToday.find((l) => l.type === "IN")!.ts))}. Gunakan Check-Out saat pulang.` });
      return;
    }
    if (type === "OUT" && alreadyOut) {
      setStep({ face: "ok", identity: "ok", fence: verdict.inside ? "ok" : "fail" });
      setBusy(false);
      setResult({ ok: false, title: "Sudah Check-Out", desc: "Shift hari ini sudah ditutup. Sampai jumpa besok!" });
      return;
    }

    if (!verdict.inside) {
      setStep({ face: "ok", identity: "ok", fence: "fail" });
      setBusy(false);
      addLog({
        id: uid("log"), ts: Date.now(), staffId: me.staffId, name: me.name, department: me.department,
        siteId: activeSite.id,
        type, lat: geo.lat, lon: geo.lon, distanceM,
        faceDist: best!.match.distance, method: "face", source, status: "REJECTED",
        reason: `Di luar radius (${formatMeters(distanceM)})`,
        photo: toThumb(canvasRef.current),
      });
      audit(`CLOCK_${type}_REJECT`, me.staffId, `Ditolak: di luar radius (${Math.round(distanceM)} m)`);
      toast.push("danger", "Absensi ditolak", `Di luar radius: ${formatMeters(distanceM)} dari HQ (maks ${company.radiusM} m).`);
      setResult({
        ok: false, title: "Di luar area gudang",
        desc: `Posisi Anda ${formatMeters(distanceM)} dari HQ, melebihi batas ${company.radiusM} m. Mendekatlah ke area gudang.`,
      });
      setManualShown(true);
      return;
    }

    /* success */
    const now = Date.now();
    const sh = shifts.find((s) => s.id === me.shiftId);
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(now));
    const mins = (Number(parts.find((p) => p.type === "hour")?.value) % 24) * 60 + Number(parts.find((p) => p.type === "minute")?.value);

    let lateMin: number | undefined;
    if (type === "IN" && sh && sh.id !== "sh-fleks") {
      const start = toMin(sh.start);
      lateMin = mins > start + sh.graceMin ? mins - start : undefined;
    }
    let overtimeMin: number | undefined;
    if (type === "OUT" && sh && sh.id !== "sh-fleks") {
      const end = toMin(sh.end);
      const start = toMin(sh.start);
      if (end > start) overtimeMin = Math.max(0, mins - end) || undefined;
    }
    let workMin: number | undefined;
    if (type === "OUT") {
      const dayIn = myVerifiedToday.find((l) => l.type === "IN" && l.ts <= now);
      if (dayIn) {
        const breakMin = breaks
          .filter((b) => b.staffId === me.staffId && b.day === today && b.end)
          .reduce((a, b) => a + (b.end! - b.start), 0) / 60000;
        workMin = Math.max(0, Math.round((now - dayIn.ts) / 60000 - breakMin));
      }
    }

    setStep({ face: "ok", identity: "ok", fence: "ok" });
    addLog({
      id: uid("log"), ts: now, staffId: me.staffId, name: me.name, department: me.department,
      siteId: activeSite.id,
      type, lat: geo.lat, lon: geo.lon, distanceM,
      faceDist: Math.round(best!.match.distance * 1000) / 1000,
      method: "face", source, status: "VERIFIED", reason: null,
      lateMin, overtimeMin, workMin,
      photo: toThumb(canvasRef.current),
    });
    audit(`CLOCK_${type}`, me.staffId,
      `Verifikasi wajah Δ ${best!.match.distance.toFixed(2)} · GPS ${Math.round(distanceM)} m${lateMin ? ` · telat ${lateMin} mnt` : ""}${overtimeMin ? ` · lembur ${overtimeMin} mnt` : ""}`);

    setBurst(true);
    window.setTimeout(() => setBurst(false), 1150);
    toast.push("ok", `${type === "IN" ? "Check-In" : "Check-Out"} terverifikasi`,
      `${me.name} · ${formatMeters(distanceM)} dari HQ${workMin ? ` · ${workMin} mnt kerja` : ""}`);
    setResult({
      ok: true,
      title: type === "IN" ? "Check-In Berhasil" : "Check-Out Berhasil",
      desc: `Wajah cocok (Δ ${best!.match.distance.toFixed(2)}) · ${formatMeters(distanceM)} dari HQ${workMin ? ` · jam kerja ${workMin} mnt` : ""}.`,
      matchedName: me.name, matchedId: me.staffId, lateMin, overtimeMin,
    });
    setBusy(false);
  };

  const manualRecord = () => {
    const now = Date.now();
    addLog({
      id: uid("log"), ts: now, staffId: me.staffId, name: me.name, department: me.department,
      siteId: activeSite.id,
      type, lat: company.hqLat, lon: company.hqLon, distanceM: -1, faceDist: null,
      method: "manual", source: "manual", status: "VERIFIED", reason: "Dicatat manual (pengawas)",
    });
    audit(`CLOCK_${type}_MANUAL`, me.staffId, "Dicatat manual oleh pengawas");
    toast.push("info", "Dicatat manual", `${type === "IN" ? "Check-In" : "Check-Out"} manual tercatat & diaudit.`);
    setResult({ ok: true, title: "Dicatat Manual", desc: "Absensi dicatat manual dan ditandai di audit untuk review HR.", matchedName: me.name, matchedId: me.staffId });
    setManualShown(false);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Absensi"
        sub={hasGps ? `HQ ${formatCoord({ lat: company.hqLat, lon: company.hqLon })} · batas ${company.radiusM} m` : "Menunggu sinyal GPS…"}
        right={
          <div className="flex rounded-full border border-ink-100 bg-white p-0.5">
            {(["IN", "OUT"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setType(t); resetPipeline(); }}
                className={`cursor-pointer rounded-full px-3.5 py-1.5 text-[11px] font-extrabold tracking-wide transition ${
                  type === t
                    ? t === "IN" ? "bg-sun-500 text-white shadow" : "bg-teal-500 text-white shadow"
                    : "text-ink-400 hover:text-ink-600"
                }`}
              >
                {t === "IN" ? "CHECK-IN" : "CHECK-OUT"}
              </button>
            ))}
          </div>
        }
      />

      {/* status hint */}
      {(type === "IN" && alreadyIn && !alreadyOut) && (
        <Banner tone="info" title="Sudah Check-In hari ini">Beralih ke Check-Out saat shift selesai.</Banner>
      )}
      {suggested !== type && !result && (
        <button className="anim-fade-up w-full cursor-pointer rounded-xl border border-dashed border-ink-200 px-3 py-2 text-[12px] font-bold text-ink-400 transition hover:border-sun-300 hover:text-sun-700"
          onClick={() => { setType(suggested); resetPipeline(); }}>
          Saran sistem: {suggested === "IN" ? "Check-In" : "Check-Out"} — ketuk untuk beralih
        </button>
      )}

      {/* camera / photo */}
      {!photo ? (
        <CameraCapture
          onCapture={(c, d, f1) => void onCapture(c, d, f1)}
          liveness
          disabled={busy}
          captureLabel={type === "IN" ? "Ambil Foto & Check-In" : "Ambil Foto & Check-Out"}
        />
      ) : (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-[22px]">
            <img src={photo} alt="Hasil foto" className="h-56 w-full object-cover" />
            <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-white backdrop-blur">
              <IconCamera size={11} /> TERTANGKAP
            </span>
            {burst && <SuccessBurst />}
          </div>
          <button className="btn-ghost w-full !py-3 text-sm" onClick={resetPipeline} disabled={busy}>
            <IconCamera size={15} /> Ulangi Foto
          </button>
        </div>
      )}

      {!hasFace && (
        <Banner tone="warn" title="Belum ada foto tanda tangan">
          Verifikasi memakai mode lite (dHash). Ambil baseline yang lebih akurat di menu Profil.
        </Banner>
      )}

      {/* pipeline steps */}
      <div className="card divide-y divide-ink-100/80">
        {steps.map((s) => {
          const st = step[s.key];
          return (
            <div key={s.key} className="relative flex items-center gap-3 overflow-hidden px-3.5 py-2.5">
              {st === "busy" && <span className="shimmer pointer-events-none absolute inset-0" aria-hidden />}
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-colors ${
                st === "ok" ? "anim-pop bg-ok-100 text-ok-600" : st === "fail" ? "anim-shake bg-danger-100 text-danger-600" : st === "busy" ? "bg-sun-100 text-sun-600" : "bg-ink-50 text-ink-300"
              }`}>
                {st === "ok" ? <IconCheck size={15} /> : st === "fail" ? <IconX size={15} /> : st === "busy" ? <span className="anim-blink">{s.icon}</span> : s.icon}
              </span>
              <div className="flex-1">
                <p className={`text-[13px] font-extrabold ${st === "fail" ? "text-danger-600" : st === "ok" ? "text-ok-600" : "text-ink-700"}`}>{s.label}</p>
                <p className="text-[10.5px] font-semibold text-ink-400">
                  {s.key === "face" ? "Deteksi & liveness 2-frame" : s.key === "identity" ? `Encoding 128-D vs baseline (Δ ≤ ${settings.matchThreshold.toFixed(2)})` : `Haversine ≤ ${company.radiusM} m dari HQ`}
                </p>
              </div>
              {st === "busy" && <span className="h-2 w-2 animate-ping rounded-full bg-sun-500" />}
            </div>
          );
        })}
      </div>

      {/* result */}
      {result && (
        <Banner tone={result.ok ? "ok" : "danger"} title={result.title}>
          {result.desc}
          {result.ok && result.matchedName && (
            <span className="mt-2 flex items-center gap-2">
              <InitialsAvatar name={result.matchedName} seedKey={result.matchedId ?? "x"} size="h-8 w-8 text-[11px]" rounded="rounded-xl" />
              <span className="text-[12px] font-extrabold">{result.matchedName} · {result.matchedId}</span>
              {result.lateMin ? <Chip tone="warn">Telat {result.lateMin} mnt</Chip> : null}
              {result.overtimeMin ? <Chip tone="sun">Lembur {result.overtimeMin} mnt</Chip> : null}
            </span>
          )}
          {!result.ok && manualShown && (
            <span className="mt-2.5 block">
              <button className="btn-soft !rounded-xl !px-3.5 !py-2 !text-[12px]" onClick={manualRecord}>
                <IconAlert size={13} /> Catat manual (pengawas)
              </button>
            </span>
          )}
        </Banner>
      )}

      <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-[10.5px] font-bold text-ink-300">
        <IconCrosshair size={12} /> Diterima bila Δ wajah ≤ {settings.matchThreshold.toFixed(2)} dan jarak ≤ {company.radiusM} m
      </p>
    </div>
  );
}
