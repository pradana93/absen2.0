/**
 * FaceEnrollGate — shown on a user's FIRST login (HR no longer captures the
 * base photo at account creation). Saving activates face-based attendance.
 */
import { useState } from "react";
import { useApp } from "../lib/store";
import { extractSignature, FaceSignature } from "../lib/faceEngine";
import { shrinkPhoto } from "../lib/database";
import CameraCapture from "./CameraCapture";
import { useToast } from "./Toast";
import { Banner, Chip } from "./bits";
import { IconCheck, IconCpu, IconFace, IconLogo, IconShield } from "./icons";

export default function FaceEnrollGate({ onDone }: { onDone: () => void }) {
  const { session, company, engine, updateEmployee, audit } = useApp();
  const toast = useToast();
  const me = session!;

  const [photo, setPhoto] = useState<string | null>(null);
  const [sig, setSig] = useState<FaceSignature | null>(null);
  const [busy, setBusy] = useState(false);

  const onCapture = async (canvas: HTMLCanvasElement, dataUrl: string) => {
    setBusy(true);
    setSig(await extractSignature(canvas));
    setPhoto(await shrinkPhoto(dataUrl, 360));
    setBusy(false);
  };

  const saveAndEnter = () => {
    if (!photo || !sig) return;
    updateEmployee(me.staffId, { photo, descriptor: sig.descriptor ?? null, hash: sig.hash ?? null });
    audit("FACE_ENROLL", me.staffId, sig.descriptor ? "Baseline 128-D disimpan saat login pertama" : "Baseline dHash disimpan saat login pertama");
    toast.push("ok", "Foto tanda tangan tersimpan", "Absensi wajah Anda sekarang aktif.");
    onDone();
  };

  return (
    <div className="app-bg relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <span className="floaty absolute -top-16 -left-16 h-64 w-64 rounded-full bg-sun-400/20 blur-3xl" />
        <span className="floaty absolute top-1/3 -right-20 h-72 w-72 rounded-full bg-sky-500/12 blur-3xl" style={{ animationDelay: "1.6s" }} />
        <span className="floaty absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-teal-500/12 blur-3xl" style={{ animationDelay: "3s" }} />
      </div>

      <div className="relative w-full max-w-sm">
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
          <p className="mt-4 text-[10px] font-extrabold tracking-[0.22em] text-sun-600 uppercase">Langkah terakhir</p>
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">Halo, {me.name.split(" ")[0]}! 👋</h1>
          <p className="mt-1 max-w-xs text-[13px] leading-relaxed font-semibold text-ink-400">
            Ambil <b className="text-ink-700">foto tanda tangan</b> Anda — kunci untuk absensi wajah + GPS di {company.appName}.
          </p>
          <div className="mt-2.5 flex gap-1.5">
            <Chip tone={engine === "ai" ? "teal" : "warn"}><IconCpu size={11} /> {engine === "ai" ? "AI 128-D" : engine === "lite" ? "MODE LITE" : "MEMUAT…"}</Chip>
            <Chip tone="ink"><IconShield size={11} /> TERSIMPAN DI PERANGKAT</Chip>
          </div>
        </div>

        <div className="card anim-fade-up p-4">
          {!photo ? (
            <CameraCapture onCapture={(c, d) => void onCapture(c, d)} heightClass="h-60" captureLabel="Ambil Foto Tanda Tangan" />
          ) : (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-[22px]">
                <img src={photo} alt="Foto tanda tangan" className="h-56 w-full object-cover" />
                {sig?.faceFound && (
                  <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-extrabold text-white backdrop-blur">
                    <IconCheck size={11} /> WAJAH {(sig.faceScore * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              {busy ? (
                <Banner tone="info" title="Mengekstrak encoding…">Menghitung vektor wajah dari foto.</Banner>
              ) : sig?.descriptor ? (
                <Banner tone="ok" title="Encoding 128-D siap">Wajah terverifikasi — baseline tersimpan aman.</Banner>
              ) : engine === "ai" ? (
                <Banner tone="warn" title="Wajah tidak terdeteksi">Foto tetap bisa disimpan (mode dHash), namun ulangi jika ingin pencocokan AI.</Banner>
              ) : (
                <Banner tone="ok" title="Tanda tangan dHash siap">Mode lite aktif — absensi tetap berfungsi.</Banner>
              )}
              <div className="flex gap-2">
                <button className="btn-ghost flex-1 !py-3 text-sm" onClick={() => { setPhoto(null); setSig(null); }}>Ulangi</button>
                <button className="btn-sun flex-[1.6] !py-3 text-sm" onClick={saveAndEnter} disabled={busy}>
                  <IconCheck size={16} /> Simpan & Masuk
                </button>
              </div>
              <button className="w-full cursor-pointer text-center text-[11.5px] font-bold text-ink-400 underline decoration-dotted underline-offset-4 hover:text-sun-600" onClick={onDone}>
                Lewati untuk sekarang
              </button>
            </div>
          )}
        </div>
        <span className="hidden"><IconFace size={1} /></span>
      </div>
    </div>
  );
}
