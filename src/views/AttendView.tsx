/**
 * Absen — face + geofence verification pipeline (liveness, evidence photo,
 * burst on success), manual supervisor fallback (audited).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store";
import { formatCoord, formatMeters } from "../lib/geoUtils";
import { todayKey, uid, wibDayKey, wibTime } from "../lib/format";
import { AttendanceType } from "../lib/database";
import { extractSignature, identifyBest, quickHash } from "../lib/faceEngine";
import CameraCapture from "../components/CameraCapture";
import { useToast } from "../components/Toast";
import { Banner, Chip, InitialsAvatar, PageHeader, SuccessBurst } from "../components/bits";
import { IconCamera, IconCheck, IconCpu, IconFace, IconPin, IconRefresh, IconScan, IconShield, IconX } from "../components/icons";

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
  } catch { return null; }
}

type StepKey = "face" | "gps" | "done";
type StepState = "idle" | "busy" | "ok" | "fail";

export default function AttendView({ initialType }: { initialType: AttendanceType }) {
  const { session, employees, logs, breaks, shifts, activeSite, settings, engine, geo, fence, addLog, audit } = useApp();
  const toast = useToast();
  const me = session!;
  const site = activeSite;

  const [type, setType] = useState<AttendanceType>(initialType);
  useEffect(() => setType(initialType), [initialType]);

  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(false);
  const [manualShown, setManualShown] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; title: string; desc: string } | null>(null);
  const [steps, setSteps] = useState<Record<StepKey, StepState>>({ face: "idle", gps: "idle", done: "idle" });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const today = todayKey();
  const myToday = useMemo(
    () => logs.filter((l) => l.staffId === me.staffId && wibDayKey(new Date(l.ts)) === today && l.status === "VERIFIED"),
    [logs, me.staffId, today],
  );
  const hasIn = myToday.some((l) => l.type === "IN");
  const hasOut = myToday.some((l) => l.type === "OUT");
  const dupBlocked = (type === "IN" && hasIn) || (type === "OUT" && (!hasIn || hasOut));

  const setStep = (k: StepKey, s: StepState) => setSteps((prev) => ({ ...prev, [k]: s }));

  const reset = () => {
    setPhoto(null); setResult(null); setManualShown(false);
    setSteps({ face: "idle", gps: "idle", done: "idle" });
  };

  const onCapture = async (canvas: HTMLCanvasElement, dataUrl: string, frame1?: HTMLCanvasElement) => {
    setBusy(true);
    canvasRef.current = canvas;
    setPhoto(dataUrl);
    setResult(null);

    /* liveness */
    if (frame1 && quickHash(frame1) === quickHash(canvas)) {
      setBusy(false);
      setResult({ ok: false, title: "Liveness gagal", desc: "Dua frame identik — terdeteksi gambar statis (foto/cetakan), bukan wajah hidup. Coba lagi." });
      toast.push("warn", "Liveness gagal", "Anti-fraud menolak gambar statis.");
      audit(`CLOCK_${type}_REJECT`, "liveness", "Ditolak: dua frame identik (gambar statis)");
      return;
    }

    /* 1 — face */
    setStep("face", "busy");
    const sig = await extractSignature(canvas);
    const registry = employees.filter((e) => e.descriptor || e.hash).map((e) => ({ staffId: e.staffId, descriptor: e.descriptor, hash: e.hash }));
    const best = identifyBest(sig, registry, settings.matchThreshold);
    const matched = best ? employees.find((e) => e.staffId === best.match.staffId) : null;

    if (!matched || matched.staffId !== me.staffId) {
      setStep("face", "fail");
      setBusy(false);
      setResult({
        ok: false, title: "Wajah tidak cocok",
        desc: matched
          ? `Wajah terdeteksi sebagai ${matched.name} (Δ ${best!.match.distance.toFixed(2)}), bukan akun yang login (${me.name}).`
          : `Tidak ada kecocokan Δ ≤ ${settings.matchThreshold.toFixed(2)}. Pastikan pencahayaan cukup dan wajah menghadap kamera.`,
      });
      toast.push("warn", "Verifikasi wajah gagal", "Wajah tidak cocok dengan akun yang login.");
      setManualShown(true);
      return;
    }
    setStep("face", "ok");

    /* 2 — geofence */
    setStep("gps", "busy");
    await new Promise((r) => setTimeout(r, 450));
    const geoOk = !!fence && fence.inside && geo!.accuracy <= 60;
    setStep("gps", geoOk ? "ok" : "fail");

    if (!geoOk) {
      setBusy(false);
      setResult({
        ok: false, title: "Di luar area gudang",
        desc: !fence
          ? "Lokasi tidak dapat diverifikasi. Aktifkan GPS atau gunakan mode simulasi di menu Aturan."
          : geo!.accuracy > 60
            ? `Akurasi GPS ±${Math.round(geo!.accuracy)} m terlalu rendah. Pindah ke tempat terbuka lalu coba lagi.`
            : `Posisi Anda ${formatMeters(fence.distanceM)} dari ${site.shortName}, melebihi batas ${site.radiusM} m.`,
      });
      toast.push("danger", "Absensi ditolak", !fence ? "GPS tidak tersedia." : `Di luar radius ${site.radiusM} m.`);
      audit(`CLOCK_${type}_REJECT`, me.staffId, `Ditolak: ${!fence ? "GPS tidak tersedia" : `di luar radius (${Math.round(fence.distanceM)} m)`}`);
      addLog({
        id: uid("log"), ts: Date.now(), staffId: me.staffId, name: me.name, department: me.department,
        siteId: site.id, type, lat: geo?.lat ?? site.hqLat, lon: geo?.lon ?? site.hqLon,
        distanceM: fence ? Math.round(fence.distanceM) : -1, faceDist: best ? Math.round(best.match.distance * 1000) / 1000 : null,
        method: "face", source: geo?.simulated ? "sim" : "gps", status: "REJECTED",
        reason: !fence ? "GPS tidak tersedia" : `Di luar radius (${formatMeters(fence.distanceM)})`,
      });
      return;
    }

    /* 3 — record */
    setStep("done", "busy");
    await new Promise((r) => setTimeout(r, 300));
    const now = Date.now();
    const sh = shifts.find((s) => s.id === me.shiftId);
    let lateMin: number | undefined;
    if (type === "IN" && sh && sh.id !== "sh-fleks") {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(now));
      const mins = (Number(parts.find((p) => p.type === "hour")?.value) % 24) * 60 + Number(parts.find((p) => p.type === "minute")?.value);
      const start = Number(sh.start.slice(0, 2)) * 60 + Number(sh.start.slice(3));
      lateMin = Math.max(0, mins - start - sh.graceMin) || undefined;
    }
    let overtimeMin: number | undefined;
    let workMin: number | undefined;
    if (type === "OUT" && sh && sh.id !== "sh-fleks") {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(now));
      const mins = (Number(parts.find((p) => p.type === "hour")?.value) % 24) * 60 + Number(parts.find((p) => p.type === "minute")?.value);
      const end = Number(sh.end.slice(0, 2)) * 60 + Number(sh.end.slice(3));
      overtimeMin = Math.max(0, mins - end) || undefined;
    }
    if (type === "OUT") {
      const dayIn = logs.find((l) => l.staffId === me.staffId && l.type === "IN" && l.status === "VERIFIED" && wibDayKey(new Date(l.ts)) === today && l.ts <= now);
      if (dayIn) {
        const breakMin = breaks.filter((b) => b.staffId === me.staffId && b.day === today && b.end).reduce((a, b) => a + (b.end! - b.start), 0) / 60000;
        workMin = Math.max(0, Math.round((now - dayIn.ts) / 60000 - breakMin));
      }
    }
    addLog({
      id: uid("log"), ts: now, staffId: me.staffId, name: me.name, department: me.department,
      siteId: site.id, type, lat: geo!.lat, lon: geo!.lon,
      distanceM: Math.round(fence!.distanceM * 10) / 10,
      faceDist: best ? Math.round(best.match.distance * 1000) / 1000 : null,
      method: "face", source: geo!.simulated ? "sim" : "gps", status: "VERIFIED", reason: null,
      lateMin, overtimeMin, workMin, photo: toThumb(canvasRef.current),
    });
    audit(`CLOCK_${type}`, me.staffId, `Δ ${best!.match.distance.toFixed(2)} · GPS ${Math.round(fence!.distanceM)} m @ ${site.shortName}${lateMin ? ` · telat ${lateMin} mnt` : ""}${overtimeMin ? ` · lembur ${overtimeMin} mnt` : ""}`);
    setStep("done", "ok");
    setBusy(false);
    setBurst(true);
    window.setTimeout(() => setBurst(false), 1150);
    toast.push("ok", `${type === "IN" ? "Check-In" : "Check-Out"} terverifikasi`, `${me.name} · ${formatMeters(fence!.distanceM)} dari ${site.shortName}${workMin ? ` · ${workMin} mnt kerja` : ""}`);
    setResult({
      ok: true,
      title: `${type === "IN" ? "Check-In" : "Check-Out"} berhasil`,
      desc: `${wibTime(new Date(now))} WIB · Δ ${best!.match.distance.toFixed(2)} · ${formatMeters(fence!.distanceM)} dari ${site.shortName}${lateMin ? ` · terlambat ${lateMin} mnt` : ""}${workMin ? ` · ${workMin} mnt kerja bersih` : ""}`,
    });
  };

  const manualRecord = () => {
    const now = Date.now();
    addLog({
      id: uid("log"), ts: now, staffId: me.staffId, name: me.name, department: me.department,
      siteId: site.id, type, lat: site.hqLat, lon: site.hqLon, distanceM: -1, faceDist: null,
      method: "manual", source: "manual", status: "VERIFIED", reason: "Dicatat manual (pengawas)",
    });
    audit(`CLOCK_${type}_MANUAL`, me.staffId, `Dicatat manual oleh pengawas di ${site.shortName}`);
    toast.push("info", "Dicatat manual", "Tercatat di audit sebagai entri manual.");
    reset();
  };

  const pipeline: Array<{ key: StepKey; label: string; detail: string }> = [
    { key: "face", label: "Verifikasi Wajah", detail: engine === "ai" ? `Encoding 128-D · ambang Δ ${settings.matchThreshold.toFixed(2)}` : "Mode lite · dHash" },
    { key: "gps", label: "Geofence GPS", detail: `${site.shortName} · radius ${site.radiusM} m` },
    { key: "done", label: "Pencatatan", detail: "Tersimpan + audit trail + SQL" },
  ];

  return (
    <div className="space-y-4 pb-2">
      <PageHeader
        title={type === "IN" ? "Check-In" : "Check-Out"}
        sub={`${site.name} · radius ${site.radiusM} m`}
        right={
          <div className="flex rounded-full border border-ink-100 bg-white p-0.5">
            {(["IN", "OUT"] as AttendanceType[]).map((t) => (
              <button key={t} onClick={() => { setType(t); reset(); }} className={`cursor-pointer rounded-full px-3.5 py-1.5 text-[11px] font-extrabold transition ${type === t ? (t === "IN" ? "bg-sun-500 text-white shadow" : "bg-teal-500 text-white shadow") : "text-ink-400"}`}>
                {t === "IN" ? "MASUK" : "PULANG"}
              </button>
            ))}
          </div>
        }
      />

      {/* status strip */}
      <div className="flex flex-wrap gap-1.5">
        <Chip tone={engine === "ai" ? "teal" : "warn"}><IconCpu size={11} /> {engine === "ai" ? "AI 128-D" : "LITE"}</Chip>
        {fence ? (
          <Chip tone={fence.inside ? "ok" : "danger"}><IconPin size={11} /> {formatMeters(fence.distanceM)}{fence.inside ? " · dalam area" : " · luar area"}</Chip>
        ) : (
          <Chip tone="warn"><IconPin size={11} /> GPS mencari…</Chip>
        )}
        {geo && <Chip tone="ink">±{Math.round(geo.accuracy)} m{geo.simulated ? " · SIM" : ""}</Chip>}
        {dupBlocked && <Chip tone="danger"><IconX size={11} /> sudah tercatat hari ini</Chip>}
      </div>

      {dupBlocked ? (
        <Banner tone="warn" title={type === "IN" ? "Check-In sudah tercatat" : "Check-Out sudah tercatat"}>
          Absensi {type === "IN" ? "masuk" : "pulang"} hari ini sudah tercatat. Duplikasi diblokir otomatis.
        </Banner>
      ) : (
        <>
          {!photo ? (
            <CameraCapture onCapture={(c, d, f1) => void onCapture(c, d, f1)} liveness disabled={busy} heightClass="h-72" captureLabel={`Ambil Foto & ${type === "IN" ? "Check-In" : "Check-Out"}`} />
          ) : (
            <div className="card anim-fade-up space-y-3 p-4">
              <div className="relative overflow-hidden rounded-[22px]">
                <img src={photo} alt="Hasil foto" className="h-56 w-full object-cover" />
                <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-white backdrop-blur">
                  <IconCamera size={11} /> TERTANGKAP
                </span>
                {burst && <SuccessBurst />}
              </div>

              {/* pipeline */}
              <div className="divide-y divide-ink-100/70 rounded-2xl border border-ink-100">
                {pipeline.map((s) => {
                  const st = steps[s.key];
                  return (
                    <div key={s.key} className="relative flex items-center gap-3 overflow-hidden px-3.5 py-2.5">
                      {st === "busy" && <span className="shimmer pointer-events-none absolute inset-0" aria-hidden />}
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-colors ${st === "ok" ? "anim-pop bg-ok-100 text-ok-600" : st === "fail" ? "anim-shake bg-danger-100 text-danger-600" : st === "busy" ? "bg-sun-100 text-sun-600" : "bg-ink-50 text-ink-300"}`}>
                        {st === "ok" ? <IconCheck size={15} /> : st === "fail" ? <IconX size={15} /> : st === "busy" ? <IconScan size={15} className="anim-blink" /> : s.key === "face" ? <IconFace size={15} /> : s.key === "gps" ? <IconPin size={15} /> : <IconShield size={15} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[13px] font-extrabold ${st === "fail" ? "text-danger-600" : "text-ink-900"}`}>{s.label}</p>
                        <p className="text-[10.5px] font-semibold text-ink-400">{s.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {result && (
                <Banner tone={result.ok ? "ok" : "danger"} title={result.title}>{result.desc}</Banner>
              )}

              <div className="flex gap-2">
                <button className="btn-ghost flex-1 !py-3 text-sm" onClick={reset} disabled={busy}>
                  <IconRefresh size={15} /> Ulangi
                </button>
                {manualShown && result && !result.ok && (
                  <button className="btn-soft flex-1 !py-3 text-sm" onClick={manualRecord}>Catat Manual</button>
                )}
              </div>
              {manualShown && <p className="text-center text-[10px] font-bold text-ink-300">Catat manual hanya untuk pengawas — selalu tercatat di audit.</p>}
            </div>
          )}
        </>
      )}

      {/* today summary */}
      {myToday.length > 0 && (
        <section>
          <div className="mb-2 flex items-end justify-between">
            <h2 className="font-display text-[15px] font-bold text-ink-900">Hari Ini</h2>
            <Chip tone="ink">{myToday.length} entri</Chip>
          </div>
          <div className="card divide-y divide-ink-100/80">
            {myToday.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <InitialsAvatar name={l.name} photo={me.photo} seedKey={l.staffId} size="h-9 w-9 text-[12px]" rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-extrabold text-ink-900">Check-{l.type}</p>
                  <p className="text-[10.5px] font-semibold text-ink-400">{formatMeters(l.distanceM)} dari {site.shortName} · Δ {l.faceDist?.toFixed(2) ?? "—"}</p>
                </div>
                <span className="font-mono text-[13px] font-bold text-ink-600 tabular-nums">{wibTime(new Date(l.ts))}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center font-mono text-[10px] font-bold text-ink-300">HQ {formatCoord({ lat: site.hqLat, lon: site.hqLon })}</p>
        </section>
      )}
    </div>
  );
}
