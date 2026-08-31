/**
 * FaceEnrollGate — shown on a user's FIRST login, before the app shell.
 * HR no longer captures the base photo at account creation; the employee
 * takes it themselves here. Saving it activates face-based attendance.
 */
import { useState } from "react";
import { useApp } from "../lib/store";
import { extractSignature, FaceSignature } from "../lib/faceEngine";
import CameraCapture from "./CameraCapture";
import { useToast } from "./Toast";
import { Banner, Chip, InitialsAvatar } from "./bits";
import { IconCheck, IconCpu, IconFace, IconLogo, IconRefresh, IconShield } from "./icons";

export default function FaceEnrollGate({ onDone }: { onDone: () => void }) {
  const { session, company, engine, updateEmployee, audit } = useApp();
  const toast = useToast();
  const me = session!;

  const [photo, setPhoto] = useState<string | null>(null);
  const [sig, setSig] = useState<FaceSignature | null>(null);
  const [busy, setBusy] = useState(false);

  const onCapture = async (canvas: HTMLCanvasElement, dataUrl: string) => {
    setPhoto(dataUrl);
    setBusy(true);
    setSig(await extractSignature(canvas));
    setBusy(false);
  };

  const saveAndEnter = () => {
    if (!photo || !sig) return;
    updateEmployee(me.staffId, {
      photo,
      descriptor: sig.descriptor ?? null,
      hash: sig.hash ?? null,
    });
    audit("FACE_ENROLL", me.staffId, sig.descriptor ? "Baseline 128-D disimpan saat login pertama" : "Baseline dHash disimpan saat login pertama");
    toast.push("ok", "Foto tanda tangan tersimpan", "Absensi wajah Anda sekarang aktif.");
    onDone();
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
        {/* header */}
        <div className="anim-fade-up mb-4 flex flex-col items-center text-center">
          <div className="relative">
            <span className="halo-pulse absolute inset-2 rounded-[28px] bg-sun-400/45" aria-hidden />
            <span className="orbit absolute -inset-3.5 rounded-full border-2 border-dashed border-sun-300/60" aria-hidden />
            <div className="ring-dots relative grid h-24 w-24 place-items-center rounded-[28px]">
              <IconLogo size={80} className="anim-pop drop-shadow-[0_18px_30px_rgba(240,115,0,0.35)]" />
            </div>
          </div>
          <p className="mt-4 text-[11px] font-extrabold tracking-[0.18em] text-sun-600 uppercase">{company.appName ?? "Vittoria HR"}</p>
          <h1 className="mt-1 font-display text-[26px] leading-tight font-extrabold text-ink-900">Satu langkah lagi, {me.name.split(" ")[0]}!</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed font-semibold text-ink-400">
            Ambil <b className="text-ink-600">foto tanda tangan</b> wajahmu. Foto ini jadi kunci verifikasi absensi —
            cepat, aman, dan hanya disimpan untuk akunmu.
          </p>
        </div>

        {/* identity chip */}
        <div className="anim-fade-up mb-4 flex items-center justify-center">
          <div className="card card-press flex items-center gap-2.5 px-3.5 py-2">
            <InitialsAvatar name={me.name} photo={me.photo} seedKey={me.staffId} size="h-8 w-8 text-[12px]" rounded="rounded-xl" />
            <div className="text-left">
              <p className="text-[12.5px] leading-tight font-extrabold text-ink-900">{me.name}</p>
              <p className="font-mono text-[10px] font-bold text-ink-400">{me.staffId} · {me.department}</p>
            </div>
          </div>
        </div>

        {/* capture card */}
        <div className="card anim-fade-up space-y-3.5 p-4">
          <div className="flex items-center justify-between">
            <Chip tone={engine === "ai" ? "teal" : "warn"}>
              <IconCpu size={12} /> {engine === "ai" ? "Encoding 128-D" : "Mode lite — dHash"}
            </Chip>
            <Chip tone="ink"><IconShield size={11} /> PRIVASI</Chip>
          </div>

          {!photo ? (
            <CameraCapture onCapture={(c, d) => void onCapture(c, d)} heightClass="h-56" captureLabel="Ambil Foto Tanda Tangan" />
          ) : (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-[22px]">
                <img src={photo} alt="Foto tanda tangan" className="h-52 w-full object-cover" />
                {sig?.faceFound && (
                  <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-extrabold text-white backdrop-blur">
                    <IconCheck size={11} /> WAJAH {(sig.faceScore * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              {busy ? (
                <Banner tone="info" title="Mengekstrak encoding…">Menghitung vektor wajah dari foto.</Banner>
              ) : engine === "ai" && sig && !sig.faceFound ? (
                <Banner tone="warn" title="Wajah tidak terdeteksi">
                  Pastikan wajahmu terlihat jelas & cukup cahaya, lalu coba lagi.
                </Banner>
              ) : (
                <Banner tone="ok" title="Wajah terverifikasi">
                  Foto siap disimpan sebagai kunci absensi wajahmu.
                </Banner>
              )}
              <div className="flex gap-2">
                <button className="btn-ghost flex-1 !py-3 text-sm" onClick={() => { setPhoto(null); setSig(null); }} disabled={busy}>
                  <IconRefresh size={15} /> Ulangi
                </button>
                <button className="btn-sun flex-[1.4] !py-3 text-sm" onClick={saveAndEnter} disabled={busy}>
                  <IconCheck size={16} /> Simpan & Masuk
                </button>
              </div>
            </div>
          )}
        </div>

        {/* skip */}
        <div className="anim-fade-up mt-4 text-center">
          <button
            onClick={onDone}
            className="cursor-pointer text-[12px] font-extrabold text-ink-400 underline decoration-dotted underline-offset-4 transition hover:text-sun-600"
          >
            Lewati untuk sekarang
          </button>
          <p className="mt-1.5 flex items-center justify-center gap-1 text-[10.5px] font-bold text-ink-300">
            <IconFace size={12} /> Absensi wajah butuh foto — bisa diambil kapan saja di menu Profil.
          </p>
        </div>
      </div>
    </div>
  );
}
