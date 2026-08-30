/**
 * Absen — face + GPS verification pipeline:
 * liveness (2-frame) → 128-D identity match → geofence → log with evidence.
 * Manual supervisor override available after a failed attempt.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store";
import { formatMeters, formatCoord } from "../lib/geoUtils";
import { todayKey, uid, wibDayKey, wibTime } from "../lib/format";
import { AttendanceType } from "../lib/database";
import { extractSignature, identifyBest, quickHash } from "../lib/faceEngine";
import CameraCapture from "../components/CameraCapture";
import { useToast } from "../components/Toast";
import { Banner, Chip, InitialsAvatar, PageHeader, SuccessBurst } from "../components/bits";
import {
  IconArrowRight, IconCamera, IconCheck, IconClock, IconCrosshair, IconCpu, IconFace, IconPin, IconShield, IconX,
} from "../components/icons";

/** Downscale the verification snapshot to a small evidence thumbnail. */
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

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

interface Result {
  ok: boolean;
  title: string;
  desc: string;
  matchedName?: string;
  matchedId?: string;
  distanceM?: number;
  faceDist?: number;
  lateMin?: number;
  overtimeMin?: number;
  workMin?: number;
}

interface StepState {
  face: "idle" | "busy" | "ok" | "fail";
  identity: "idle" | "busy" | "ok" | "fail";
  fence: "idle" | "busy" | "ok" | "fail";
}

export default function AttendView({ initialType }: { initialType: AttendanceType }) {
  const { session, employees, logs, breaks, settings, shifts, company, engine, geo, fence, addLog, audit } = useApp();
  const toast = useToast();
  const me = session!;
  const [type, setType] = useState<AttendanceType>(initialType);
  useEffect(() => setType(initialType), [initialType]);

  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [step, setStep] = useState<StepState>({ face: "idle", identity: "idle", fence: "idle" });
  const [result, setResult] = useState<Result | null>(null);
  const [manualShown, setManualShown] = useState(false);
  const [burst, setBurst] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const today = todayKey();
  const myDayLogs = useMemo(
    () => logs.filter((l) => l.staffId === me.staffId && wibDayKey(new Date(l.ts)) === today),
    [logs, me.staffId, today],
  );
  const inToday = [...myDayLogs].reverse().find((l) => l.type === "IN" && l.status === "VERIFIED");
  const outToday = [...myDayLogs].reverse().find((l) => l.type === "OUT" && l.status === "VERIFIED" && (!inToday || l.ts >= inToday.ts));
  const duplicate = (type === "IN" && !!inToday) || (type === "OUT" && !!outToday);

  const myShift = shifts.find((s) => s.id === me.shiftId);

  /* live WIB minutes */
  const nowMin = () => {
    const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(new Date()));
    const m = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", minute: "2-digit" }).format(new Date()));
    return (h % 24) * 60 + m;
  };

  const steps: Array<{ key: keyof StepState; label: string; icon: React.ReactNode }> = [
    { key: "face", label: "Wajah terdeteksi", icon: <IconFace size={15} /> },
    { key: "identity", label: "Identitas cocok", icon: <IconCpu size={15} /> },
    { key: "fence", label: "Dalam radius GPS", icon: <IconPin size={15} /> },
  ];

  const onCapture = async (canvas: HTMLCanvasElement, dataUrl: string, frame1?: HTMLCanvasElement) => {
    setBusy(true);
    canvasRef.current = canvas;
    setPhoto(dataUrl);
    setResult(null);
    setStep({ face: "busy", identity: "idle", fence: "idle" });

    /* liveness: two identical frames mean a static image, not a live face */
    if (frame1 && quickHash(frame1) === quickHash(canvas)) {
      setBusy(false);
      setStep({ face: "fail", identity: "idle", fence: "idle" });
      setResult({
        ok: false, title: "Liveness gagal",
        desc: "Dua frame identik — terdeteksi gambar statis (foto/cetakan), bukan wajah hidup. Pastikan wajahmu bergerak alami, lalu coba lagi.",
      });
      toast.push("warn", "Liveness gagal", "Terdeteksi gambar statis — anti-fraud menolak verifikasi.");
      audit(`CLOCK_${type}_REJECT`, "liveness", "Ditolak: dua frame identik (gambar statis)");
      return;
    }

    const sig = await extractSignature(canvas);
    setStep((s) => ({ ...s, face: sig.faceFound || engine === "lite" ? "ok" : "fail", identity: "busy" }));
    if (!sig.faceFound && engine === "ai") {
      setBusy(false);
      setStep({ face: "fail", identity: "idle", fence: "idle" });
      setResult({ ok: false, title: "Wajah tidak terdeteksi", desc: "Pastikan wajahmu berada di tengah bingkai dengan pencahayaan cukup, lalu coba lagi." });
      return;
    }

    /* identity: match against MY registered baseline */
    const best = identifyBest(sig, [{ staffId: me.staffId, descriptor: me.descriptor, hash: me.hash }], settings.matchThreshold);
    await new Promise((r) => setTimeout(r, 350));
    const identityOk = !!best && best.match.staffId === me.staffId;
    setStep((s) => ({ ...s, identity: identityOk ? "ok" : "fail", fence: identityOk ? "busy" : "idle" }));

    if (!identityOk) {
      setBusy(false);
      setResult({
        ok: false, title: "Wajah tidak cocok",
        desc: `Jarak wajah Δ ${best ? best.match.distance.toFixed(2) : "—"} melebihi ambang ${settings.matchThreshold.toFixed(2)}. Pastikan kamu login dengan akunmu sendiri, lalu foto ulang.`,
      });
      toast.push("warn", "Verifikasi wajah gagal", "Wajah tidak cocok dengan akun yang login.");
      setManualShown(true);
      return;
    }

    /* geofence */
    await new Promise((r) => setTimeout(r, 350));
    if (!fence) {
      setBusy(false);
      setStep({ face: "ok", identity: "ok", fence: "fail" });
      setResult({ ok: false, title: "GPS tidak tersedia", desc: "Lokasi tidak dapat diverifikasi. Aktifkan GPS atau gunakan mode simulasi di menu Aturan." });
      toast.push("danger", "Absensi ditolak", "Lokasi tidak dapat diverifikasi.");
      return;
    }
    const geoOk = fence.inside;
    setStep((s) => ({ ...s, fence: geoOk ? "ok" : "fail" }));

    /* decision */
    const distanceM = Math.round(fence.distanceM * 10) / 10;
    const source: "gps" | "sim" = geo?.simulated ? "sim" : "gps";
    const now = Date.now();
    const mins = nowMin();

    if (geoOk && identityOk && best) {
      const lateMin = type === "IN" && myShift && myShift.id !== "sh-fleks"
        ? Math.max(0, mins - (toMin(myShift.start) + myShift.graceMin)) || undefined
        : undefined;
      const overtimeMin = type === "OUT" && myShift && myShift.id !== "sh-fleks" && toMin(myShift.end) > toMin(myShift.start)
        ? Math.max(0, mins - toMin(myShift.end)) || undefined
        : undefined;

      /* net worked minutes on clock-out */
      let workMin: number | undefined;
      if (type === "OUT" && inToday) {
        const breakMin = breaks
          .filter((b) => b.staffId === me.staffId && b.day === today && b.end)
          .reduce((a, b) => a + (b.end! - b.start), 0) / 60000;
        workMin = Math.max(0, Math.round((now - inToday.ts) / 60000 - breakMin));
      }
      const evidence = toThumb(canvasRef.current);

      addLog({
        id: uid("log"), ts: now, staffId: me.staffId, name: me.name,
        department: me.department, type, lat: geo!.lat, lon: geo!.lon, distanceM,
        faceDist: Math.round(best.match.distance * 1000) / 1000,
        method: "face", source, status: "VERIFIED", reason: null,
        lateMin, overtimeMin, workMin, photo: evidence,
      });
      audit(`CLOCK_${type}`, me.staffId,
        `Verifikasi wajah Δ ${best.match.distance.toFixed(2)} · GPS ${Math.round(distanceM)} m${lateMin ? ` · telat ${lateMin} mnt` : ""}${overtimeMin ? ` · lembur ${overtimeMin} mnt` : ""}`);

      setBurst(true);
      window.setTimeout(() => setBurst(false), 1150);
      toast.push("ok", `${type === "IN" ? "Check-In" : "Check-Out"} terverifikasi`,
        `${me.name} · ${formatMeters(distanceM)} dari HQ${workMin ? ` · ${workMin} mnt kerja` : ""}`);

      setResult({
        ok: true,
        title: `${type === "IN" ? "Check-In" : "Check-Out"} Terverifikasi`,
        desc: `${wibTime(new Date(now))} WIB · ${formatMeters(distanceM)} dari HQ · Δ ${best.match.distance.toFixed(2)}`,
        matchedName: me.name, matchedId: me.staffId, distanceM, faceDist: best.match.distance,
        lateMin, overtimeMin, workMin,
      });
      setBusy(false);
      return;
    }

    /* rejected — geofence */
    addLog({
      id: uid("log"), ts: now, staffId: me.staffId, name: me.name,
      department: me.department, type, lat: geo!.lat, lon: geo!.lon, distanceM,
      faceDist: Math.round((best?.match.distance ?? 0) * 1000) / 1000,
      method: "face", source, status: "REJECTED",
      reason: `Di luar radius (${formatMeters(distanceM)})`,
    });
    audit(`CLOCK_${type}_REJECT`, me.staffId, `Ditolak: di luar radius (${Math.round(distanceM)} m)`);
    toast.push("danger", "Absensi ditolak", `Di luar radius: ${formatMeters(distanceM)} dari HQ (maks ${company.radiusM} m).`);
    setResult({
      ok: false, title: "Di Luar Radius",
      desc: `Posisi Anda ${formatMeters(distanceM)} dari HQ, melebihi batas ${company.radiusM} m. Mendekatlah ke area gudang lalu coba lagi.`,
      matchedName: me.name, matchedId: me.staffId, distanceM,
    });
    setManualShown(true);
    setBusy(false);
  };

  /* manual supervisor override */
  const manualRecord = () => {
    const now = Date.now();
    addLog({
      id: uid("log"), ts: now, staffId: me.staffId, name: me.name,
      department: me.department, type, lat: geo?.lat ?? company.hqLat, lon: geo?.lon ?? company.hqLon,
      distanceM: fence ? Math.round(fence.distanceM) : -1, faceDist: null,
      method: "manual", source: geo?.simulated ? "sim" : "gps", status: "VERIFIED",
      reason: "Override manual (verifikasi gagal)",
    });
    audit(`CLOCK_${type}_MANUAL`, me.staffId, "Absensi dicatat manual setelah verifikasi gagal");
    toast.push("info", "Dicatat manual", "Override tercatat di audit untuk review HR.");
    setResult({
      ok: true, title: "Dicatat Manual",
      desc: `${wibTime(new Date(now))} WIB — override tercatat di audit dan akan direview HR.`,
      matchedName: me.name, matchedId: me.staffId,
    });
    setManualShown(false);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Absensi"
        sub={`${me.name} · ${myShift?.name ?? "Fleksibel"}`}
        right={
          <div className="flex rounded-full border border-ink-100 bg-white p-0.5">
            {(["IN", "OUT"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setType(t); setResult(null); setPhoto(null); setManualShown(false); setStep({ face: "idle", identity: "idle", fence: "idle" }); }}
                className={`cursor-pointer rounded-full px-3.5 py-1.5 text-[11px] font-extrabold tracking-wide transition ${
                  type === t
                    ? t === "IN" ? "bg-sun-500 text-white shadow" : "bg-teal-500 text-white shadow"
                    : "text-ink-400 hover:text-ink-600"
                }`}
              >
                {t === "IN" ? "Check-In" : "Check-Out"}
              </button>
            ))}
          </div>
        }
      />

      {/* duplicate guard */}
      {duplicate && (
        <Banner tone="info" title={`${type === "IN" ? "Check-In" : "Check-Out"} sudah tercatat`}>
          {type === "IN" && inToday ? `Kamu sudah Check-In pukul ${wibTime(new Date(inToday.ts))} WIB hari ini.` : `Kamu sudah Check-Out pukul ${outToday ? wibTime(new Date(outToday.ts)) : "—"} WIB hari ini.`}
          Satu pencatatan per tipe per hari untuk mencegah duplikat.
        </Banner>
      )}

      {/* engine + GPS status */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={engine === "ai" ? "teal" : "warn"}><IconCpu size={11} /> {engine === "ai" ? "128-D AI" : engine === "lite" ? "Mode Lite" : "Memuat…"}</Chip>
        <Chip tone={fence ? (fence.inside ? "ok" : "danger") : "warn"}>
          <IconPin size={11} /> {fence ? `${formatMeters(fence.distanceM)} dari HQ` : "Menunggu GPS…"}
        </Chip>
        <Chip tone="ink"><IconCrosshair size={11} /> Δ ≤ {settings.matchThreshold.toFixed(2)} · ≤ {company.radiusM} m</Chip>
      </div>

      {/* pipeline steps */}
      <div className="card divide-y divide-ink-100/80">
        {steps.map((s) => {
          const st = step[s.key];
          return (
            <div key={s.key} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-colors ${
                st === "ok" ? "bg-ok-100 text-ok-600" : st === "fail" ? "bg-danger-100 text-danger-600" : st === "busy" ? "bg-sun-100 text-sun-600" : "bg-ink-50 text-ink-300"
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
              {result.workMin ? <Chip tone="teal">{result.workMin} mnt kerja</Chip> : null}
            </span>
          )}
        </Banner>
      )}

      {/* camera */}
      {!duplicate && (
        <CameraCapture
          onCapture={(c, d, f1) => void onCapture(c, d, f1)}
          liveness
          disabled={busy}
          captureLabel={type === "IN" ? "Foto & Check-In" : "Foto & Check-Out"}
        />
      )}

      {/* manual override */}
      {manualShown && !duplicate && (
        <Banner tone="warn" title="Verifikasi gagal">
          <p>Atasan dapat mencatat absensi secara manual — tindakan ini diaudit dan direview HR.</p>
          <button className="btn-soft mt-2.5 w-full !py-2.5 !text-[13px]" onClick={manualRecord}>
            <IconShield size={15} /> Catat Manual (Override)
          </button>
        </Banner>
      )}

      {/* today timeline */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="font-display text-[17px] font-bold text-ink-900">Timeline Hari Ini</h2>
          <Chip tone="ink"><IconClock size={11} /> {myDayLogs.length} aktivitas</Chip>
        </div>
        {myDayLogs.length === 0 ? (
          <p className="card px-4 py-5 text-center text-[13px] font-semibold text-ink-400">
            Belum ada absensi hari ini — mulai dengan Check-In. <IconArrowRight size={12} className="ml-1 inline text-sun-600" />
          </p>
        ) : (
          <div className="card divide-y divide-ink-100/80">
            {[...myDayLogs].reverse().map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                  l.status === "REJECTED" ? "bg-danger-100 text-danger-600" : l.type === "IN" ? "bg-sun-100 text-sun-600" : "bg-teal-100 text-teal-600"
                }`}>
                  {l.status === "REJECTED" ? <IconX size={15} /> : <IconCheck size={15} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-extrabold text-ink-900">
                    {l.type === "IN" ? "Check-In" : "Check-Out"}
                    {l.method === "manual" ? " · Manual" : ""}
                    {l.status === "REJECTED" ? " · Ditolak" : ""}
                  </p>
                  <p className="truncate text-[11px] font-semibold text-ink-400">
                    {l.reason ?? `${formatMeters(l.distanceM)} dari HQ · Δ ${l.faceDist?.toFixed(2) ?? "—"}`}
                  </p>
                </div>
                <span className="font-mono text-[12px] font-bold text-ink-500 tabular-nums">{wibTime(new Date(l.ts))}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="pb-2 text-center text-[10.5px] font-bold text-ink-300">
        HQ: {formatCoord({ lat: company.hqLat, lon: company.hqLon })} · radius {company.radiusM} m · semua waktu WIB
      </p>
    </div>
  );
}
