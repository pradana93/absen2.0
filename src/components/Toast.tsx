/**
 * Toast system + haptic buzz — the feedback layer for every action.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { IconAlert, IconCheck, IconSignal, IconX } from "./icons";

export type ToastTone = "ok" | "danger" | "warn" | "info";
export interface ToastItem { id: number; tone: ToastTone; title: string; body?: string; }

interface ToastApi { push: (tone: ToastTone, title: string, body?: string) => void; }

const Ctx = createContext<ToastApi>({ push: () => undefined });
export const useToast = () => useContext(Ctx);

const toneWrap: Record<ToastTone, string> = {
  ok: "border-ok-300 bg-ok-100 text-ok-600",
  danger: "border-danger-300 bg-danger-100 text-danger-600",
  warn: "border-warn-300 bg-warn-100 text-warn-600",
  info: "border-sky-300 bg-sky-100 text-sky-600",
};
const toneIcon: Record<ToastTone, React.ReactNode> = {
  ok: <IconCheck size={17} />, danger: <IconX size={17} />,
  warn: <IconAlert size={17} />, info: <IconSignal size={17} />,
};

export function buzz(pattern: number | number[] = 14) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(1);

  const push = useCallback((tone: ToastTone, title: string, body?: string) => {
    const id = idRef.current++;
    setItems((prev) => [...prev.slice(-3), { id, tone, title, body }]);
    buzz(tone === "ok" ? [12, 40, 18] : tone === "danger" ? [40, 60, 40] : 14);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3600);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[90] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-2xl border px-3.5 py-3 shadow-[0_16px_40px_rgba(23,42,89,0.18)] backdrop-blur ${toneWrap[t.tone]}`}
          >
            <span className="mt-0.5 shrink-0">{toneIcon[t.tone]}</span>
            <div className="min-w-0">
              <p className="font-display text-[14px] leading-tight font-bold">{t.title}</p>
              {t.body && <p className="mt-0.5 text-[12px] leading-snug font-semibold opacity-85">{t.body}</p>}
            </div>
            <button
              className="ml-auto shrink-0 cursor-pointer rounded-lg p-1 opacity-60 transition hover:opacity-100"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              aria-label="Tutup notifikasi"
            >
              <IconX size={13} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
