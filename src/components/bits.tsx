/**
 * bits — shared UI primitives (light Greatday-style theme).
 */
import { ReactNode, useEffect, useRef, useState } from "react";
import { IconAlert, IconCheck, IconSignal, IconX } from "./icons";

export type Tone = "sun" | "sky" | "teal" | "coral" | "grape" | "ok" | "warn" | "danger" | "ink";

const chipCls: Record<Tone, string> = {
  sun: "chip-sun", sky: "chip-sky", teal: "chip-teal", coral: "chip-coral",
  grape: "chip-grape", ok: "chip-ok", warn: "chip-warn", danger: "chip-danger", ink: "chip-ink",
};

export function Chip({ tone = "ink", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`${chipCls[tone]} ${className}`}>{children}</span>;
}

const bannerCls: Record<string, { wrap: string; icon: ReactNode }> = {
  ok: { wrap: "border-ok-300 bg-ok-100 text-ok-600", icon: <IconCheck size={18} /> },
  danger: { wrap: "border-danger-300 bg-danger-100 text-danger-600", icon: <IconX size={18} /> },
  warn: { wrap: "border-warn-300 bg-warn-100 text-warn-600", icon: <IconAlert size={18} /> },
  info: { wrap: "border-sky-300 bg-sky-100 text-sky-600", icon: <IconSignal size={18} /> },
};

export function Banner({ tone, title, children }: { tone: keyof typeof bannerCls; title?: string; children?: ReactNode }) {
  const b = bannerCls[tone];
  return (
    <div className={`anim-fade-up flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 ${b.wrap}`}>
      <span className="mt-0.5 shrink-0">{b.icon}</span>
      <div className="text-[13.5px] leading-snug font-semibold">
        {title && <p className="font-display text-[15px] font-bold">{title}</p>}
        {children && <div className="mt-0.5 font-medium opacity-90">{children}</div>}
      </div>
    </div>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-2">
      <h2 className="font-display text-[17px] font-bold text-ink-900">{children}</h2>
      {right}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex cursor-pointer items-center gap-2.5">
      <span className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${checked ? "bg-sun-500" : "bg-ink-200"}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${checked ? "left-6" : "left-1"}`} />
      </span>
      {label && <span className="text-sm font-bold text-ink-700">{label}</span>}
    </button>
  );
}

export function ConfirmButton({
  label, icon, onConfirm, className = "btn-danger", confirmLabel = "Yakin? Ketuk lagi",
}: {
  label: string; icon?: ReactNode; onConfirm: () => void; className?: string; confirmLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  const t = useRef<number | null>(null);
  useEffect(() => () => { if (t.current) window.clearTimeout(t.current); }, []);
  return (
    <button
      className={`${armed ? "btn-danger !bg-danger-500 !text-white" : className}`}
      onClick={() => {
        if (armed) { setArmed(false); onConfirm(); }
        else { setArmed(true); t.current = window.setTimeout(() => setArmed(false), 2600); }
      }}
    >
      {icon} {armed ? confirmLabel : label}
    </button>
  );
}

const AVATAR_TONES = ["bg-sun-500", "bg-sky-500", "bg-teal-500", "bg-grape-500", "bg-coral-500", "bg-ink-600"];

export function InitialsAvatar({
  name, photo, seedKey, size = "h-11 w-11 text-[15px]", rounded = "rounded-2xl",
}: {
  name: string; photo?: string | null; seedKey: string; size?: string; rounded?: string;
}) {
  if (photo) return <img src={photo} alt={name} className={`${size} ${rounded} shrink-0 object-cover shadow-sm`} />;
  const idx = Math.abs([...seedKey].reduce((a, c) => a + c.charCodeAt(0), 0)) % AVATAR_TONES.length;
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <span className={`${size} ${rounded} ${AVATAR_TONES[idx]} grid shrink-0 place-items-center font-display font-bold text-white shadow-sm`}>
      {initials}
    </span>
  );
}

export function EmptyState({ icon, title, desc, action }: { icon: ReactNode; title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="card anim-fade-up flex flex-col items-center gap-2 border-dashed px-6 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-ink-50 text-ink-300">{icon}</span>
      <p className="font-display text-[16px] font-bold text-ink-800">{title}</p>
      <p className="max-w-xs text-[13px] leading-relaxed text-ink-400">{desc}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function StatTile({ label, value, tone = "sun", sub }: { label: string; value: ReactNode; tone?: Tone; sub?: string }) {
  const tint: Record<Tone, string> = {
    sun: "bg-sun-100 text-sun-700", sky: "bg-sky-100 text-sky-600", teal: "bg-teal-100 text-teal-600",
    coral: "bg-coral-100 text-coral-600", grape: "bg-grape-100 text-grape-600", ok: "bg-ok-100 text-ok-600",
    warn: "bg-warn-100 text-warn-600", danger: "bg-danger-100 text-danger-600", ink: "bg-ink-100 text-ink-600",
  };
  return (
    <div className="card card-press flex-1 px-3 py-2.5">
      <p className="text-[9.5px] font-extrabold tracking-[0.1em] text-ink-400 uppercase">{label}</p>
      <p className={`mt-1 inline-block rounded-xl px-2 py-0.5 font-display text-[20px] leading-tight font-bold ${tint[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] font-semibold text-ink-400">{sub}</p>}
    </div>
  );
}

/** Small friendly page header used by secondary tabs. */
export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">{title}</h1>
        {sub && <p className="mt-0.5 text-[13px] font-semibold text-ink-400">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Modal({
  open, onClose, title, children, wide,
}: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-ink-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`anim-pop max-h-[86dvh] w-full ${wide ? "max-w-lg" : "max-w-sm"} overflow-y-auto rounded-[24px] bg-white p-5 shadow-[0_40px_100px_rgba(0,0,0,0.4)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-[19px] font-extrabold text-ink-900">{title}</h3>
          <button onClick={onClose} className="cursor-pointer rounded-xl p-2 text-ink-400 transition hover:bg-ink-50" aria-label="Tutup">
            <IconX size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Radial celebration burst — fired on verified clocks & big successes. */
export function SuccessBurst() {
  const dots = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2 + 0.3;
    const dist = 62 + (i % 3) * 22;
    return {
      tx: `${Math.round(Math.cos(angle) * dist)}px`,
      ty: `${Math.round(Math.sin(angle) * dist)}px`,
      color: ["#f07300", "#159a6d", "#2b9fe0", "#ffb224", "#7a4fc0"][i % 5],
      delay: `${(i % 4) * 30}ms`,
      size: 5 + (i % 3) * 3,
    };
  });
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center overflow-hidden">
      <span className="burst-ring absolute h-24 w-24 rounded-full border-4 border-ok-500/80" />
      <span className="burst-ring absolute h-24 w-24 rounded-full border-2 border-sun-400/70" style={{ animationDelay: "90ms" }} />
      {dots.map((d, i) => (
        <span
          key={i}
          className="burst-dot absolute rounded-full"
          style={{
            width: d.size, height: d.size, background: d.color,
            ["--tx" as string]: d.tx, ["--ty" as string]: d.ty, animationDelay: d.delay,
          }}
        />
      ))}
      <span className="anim-pop-big grid h-16 w-16 place-items-center rounded-full bg-ok-500 text-white shadow-[0_16px_40px_rgba(21,154,109,0.5)]">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      </span>
    </div>
  );
}
