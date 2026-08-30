/**
 * Live camera (getUserMedia) with capture-to-canvas.
 * Mirrored selfie preview, corner-bracket reticle, scanline, front/back flip,
 * and an optional 2-frame liveness capture (frame1 passed as 3rd arg).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { IconCamera, IconRefresh, IconScan } from "./icons";

type CamStatus = "idle" | "starting" | "live" | "denied" | "error";

interface Props {
  onCapture: (canvas: HTMLCanvasElement, dataUrl: string, frame1?: HTMLCanvasElement) => void;
  disabled?: boolean;
  heightClass?: string;
  captureLabel?: string;
  liveness?: boolean;
}

export default function CameraCapture({
  onCapture, disabled, heightClass = "h-64", captureLabel = "Ambil Foto & Verifikasi", liveness = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CamStatus>("idle");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [flash, setFlash] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async (mode: "user" | "environment") => {
    stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setErrMsg("Perangkat tidak mendukung akses kamera.");
      return;
    }
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: mode, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus("live");
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") setStatus("denied");
      else {
        setStatus("error");
        setErrMsg(name === "NotFoundError" ? "Kamera tidak ditemukan di perangkat ini." : "Gagal membuka kamera. Coba lagi.");
      }
    }
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  const flip = () => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    void start(next);
  };

  const snap = (): HTMLCanvasElement | null => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d")!;
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    return canvas;
  };

  const capture = () => {
    const c1 = snap();
    if (!c1) return;
    setFlash(true);
    window.setTimeout(() => setFlash(false), 260);
    if (!liveness) {
      onCapture(c1, c1.toDataURL("image/jpeg", 0.72));
      return;
    }
    /* 2-frame liveness: a live face always differs slightly between frames */
    setScanning(true);
    window.setTimeout(() => {
      const c2 = snap();
      setScanning(false);
      if (!c2) { onCapture(c1, c1.toDataURL("image/jpeg", 0.72)); return; }
      onCapture(c2, c2.toDataURL("image/jpeg", 0.72), c1);
    }, 650);
  };

  return (
    <div className="space-y-3">
      <div className={`relative overflow-hidden rounded-[22px] border border-ink-100 bg-ink-900 shadow-[inset_0_0_40px_rgba(0,0,0,0.4)] ${heightClass}`}>
        <video
          ref={videoRef} playsInline muted autoPlay
          className={`h-full w-full object-cover transition-opacity duration-300 ${status === "live" ? "opacity-100" : "opacity-0"} ${facing === "user" ? "-scale-x-100" : ""}`}
        />

        {status === "live" && (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-[68%] w-[62%]">
                {["-top-0.5 -left-0.5 border-t-[3px] border-l-[3px] rounded-tl-lg",
                  "-top-0.5 -right-0.5 border-t-[3px] border-r-[3px] rounded-tr-lg",
                  "-bottom-0.5 -left-0.5 border-b-[3px] border-l-[3px] rounded-bl-lg",
                  "-bottom-0.5 -right-0.5 border-b-[3px] border-r-[3px] rounded-br-lg"].map((c) => (
                  <span key={c} className={`absolute h-7 w-7 border-sun-400 ${c}`} />
                ))}
                <span className="scan-line" />
              </div>
            </div>
            <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-white backdrop-blur">
              <span className={`h-1.5 w-1.5 rounded-full ${scanning ? "anim-blink bg-sun-400" : "anim-blink bg-ok-500"}`} />
              {scanning ? "LIVENESS 2/2" : "LIVE"}
            </span>
            <button
              onClick={flip}
              className="absolute top-2 right-2 cursor-pointer rounded-xl bg-black/45 p-2.5 text-white backdrop-blur transition hover:bg-black/60 active:scale-95"
              title="Putar kamera" aria-label="Putar kamera"
            >
              <IconRefresh size={16} />
            </button>
          </>
        )}

        {status === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
            <IconScan size={28} className="text-sun-300" />
            <p className="text-xs font-extrabold tracking-widest uppercase">Membuka kamera…</p>
          </div>
        )}

        {(status === "idle" || status === "denied" || status === "error") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10">
              <IconCamera size={26} className="text-sun-300" />
            </span>
            <p className="max-w-xs text-[13px] font-medium text-white/75">
              {status === "denied"
                ? "Izin kamera ditolak. Aktifkan izin kamera di browser, lalu coba lagi."
                : status === "error"
                  ? errMsg
                  : "Kamera diperlukan untuk verifikasi wajah."}
            </p>
            <button onClick={() => void start(facing)} className="btn-sun !rounded-xl !px-4 !py-2.5 text-sm">
              <IconCamera size={16} /> {status === "idle" ? "Aktifkan Kamera" : "Coba Lagi"}
            </button>
          </div>
        )}

        {flash && <div className="anim-fade-in pointer-events-none absolute inset-0 bg-white/85" />}
      </div>

      <button onClick={capture} disabled={disabled || status !== "live" || scanning} className="btn-sun w-full !py-4 text-base">
        <IconCamera size={20} /> {scanning ? "Memindai liveness…" : captureLabel}
      </button>
    </div>
  );
}
