/** Crash guard — a failure renders a recovery screen, never a blank page. */
import { Component, ErrorInfo, ReactNode } from "react";

interface State { error: Error | null; }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Vittoria HR crash:", error, info.componentStack);
    /* keep a forensic breadcrumb for the Master Data integrity panel */
    try {
      localStorage.setItem("vittoria:crashlog", JSON.stringify({
        ts: Date.now(),
        msg: String(error?.message ?? error).slice(0, 200),
        stack: String(info.componentStack ?? "").slice(0, 400),
      }));
    } catch { /* storage unavailable */ }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-bg grid min-h-dvh place-items-center px-6">
        <div className="anim-pop w-full max-w-sm rounded-[28px] border border-ink-100 bg-white p-8 text-center shadow-[0_30px_80px_rgba(23,42,89,0.18)]">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-danger-100 text-danger-600">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.5 2.5 20h19L12 3.5Z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.3" r="0.4" fill="currentColor" />
            </svg>
          </span>
          <h1 className="mt-5 font-display text-[24px] leading-tight font-extrabold text-ink-900">Terjadi kesalahan</h1>
          <p className="mt-2 text-[13px] leading-relaxed font-semibold text-ink-400">
            Jangan khawatir — data absensi Anda aman. Muat ulang aplikasi untuk melanjutkan.
          </p>
          <details className="mt-4 rounded-xl bg-ink-50 px-3 py-2 text-left">
            <summary className="cursor-pointer text-[11px] font-extrabold text-ink-400">Detail teknis</summary>
            <pre className="mt-1.5 overflow-x-auto font-mono text-[10px] leading-relaxed text-danger-600">{String(this.state.error)}</pre>
          </details>
          <div className="mt-5 flex gap-2">
            <button className="btn-ghost flex-1 !py-3 text-[13px]" onClick={() => { try { localStorage.removeItem("vittoria:session"); } catch { /* noop */ } window.location.reload(); }}>
              Muat Ulang
            </button>
            <button
              className="btn-danger flex-1 !py-3 text-[13px]"
              onClick={() => {
                try { Object.keys(localStorage).filter((k) => k.startsWith("vittoria:")).forEach((k) => localStorage.removeItem(k)); } catch { /* noop */ }
                window.location.reload();
              }}
            >
              Reset Data Lokal
            </button>
          </div>
          <p className="mt-4 text-[10.5px] font-bold tracking-wide text-ink-300">Vittoria HR · v6.2</p>
        </div>
      </div>
    );
  }
}
