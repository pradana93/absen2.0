/**
 * Audit — full action trail with search, action-type filter and CSV export.
 */
import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { downloadTextFile } from "../lib/database";
import { relTime, wibShortDate, wibTime } from "../lib/format";
import { Chip, EmptyState, SectionLabel, Tone } from "../components/bits";
import { IconClipboard, IconDownload } from "../components/icons";

const actionTone = (a: string): Tone =>
  a.includes("REJECT") || a.includes("FAIL") || a.includes("BLOCK") ? "danger"
    : a.includes("LOGIN") || a.includes("APPROVE") || a.includes("ISSUE") ? "ok"
    : a.includes("UPDATE") || a.includes("RESET") || a.includes("UNBIND") || a.includes("WITHDRAW") ? "warn"
    : "ink";

export default function AuditView() {
  const { audits } = useApp();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("Semua");

  const kinds = useMemo(() => {
    const s = new Set<string>();
    for (const a of audits) s.add(a.action.split("_")[0]);
    return ["Semua", ...[...s].sort()];
  }, [audits]);

  const filtered = useMemo(
    () =>
      audits.filter((a) => {
        if (kind !== "Semua" && !a.action.startsWith(kind)) return false;
        const t = q.toLowerCase();
        return !t || a.actorName.toLowerCase().includes(t) || a.action.toLowerCase().includes(t) || a.detail.toLowerCase().includes(t) || a.target.toLowerCase().includes(t);
      }),
    [audits, q, kind],
  );

  const exportCsv = () => {
    const head = "Waktu;Aktor;Role;Aksi;Target;Detail";
    const body = filtered.map((a) =>
      [new Date(a.ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }), a.actorName, a.role, a.action, a.target, a.detail].join(";"),
    );
    downloadTextFile(`audit-${new Date().toISOString().slice(0, 10)}.csv`, "\uFEFF" + [head, ...body].join("\n"), "text/csv;charset=utf-8");
  };

  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">Audit</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-400">{audits.length} aksi tercatat</p>
        </div>
        <button className="btn-soft !rounded-xl !px-3.5 !py-2.5 text-[12px]" onClick={exportCsv} disabled={!filtered.length}>
          <IconDownload size={14} /> CSV
        </button>
      </div>

      <div className="space-y-2.5">
        <input className="input !py-2.5 text-sm" placeholder="Cari aktor, aksi, atau detail…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {kinds.map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-[12px] font-extrabold transition ${
              kind === k ? "bg-ink-900 text-white shadow" : "border border-ink-100 bg-white text-ink-500"
            }`}>
              {k}
            </button>
          ))}
        </div>
      </div>

      <SectionLabel right={<Chip tone="ink">{filtered.length} entri</Chip>}>Jejak Aksi</SectionLabel>

      {filtered.length === 0 ? (
        <EmptyState icon={<IconClipboard size={26} />} title="Tidak ada entri" desc="Ubah kata kunci atau filter untuk melihat jejak aksi." />
      ) : (
        <div className="card divide-y divide-ink-100/80">
          {filtered.map((a) => (
            <div key={a.id} className="flex items-start gap-3 px-3.5 py-3">
              <Chip tone={actionTone(a.action)} className="mt-0.5 shrink-0 !px-2 !py-1 !text-[9px]">{a.action}</Chip>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-extrabold text-ink-900">
                  {a.actorName} <span className="font-mono text-[10.5px] font-bold text-ink-300">({a.role})</span>
                </p>
                <p className="text-[11.5px] leading-snug font-semibold text-ink-500">{a.detail}</p>
                <p className="mt-0.5 font-mono text-[10px] font-bold text-ink-300">
                  target: {a.target} · {wibShortDate(new Date(a.ts))} {wibTime(new Date(a.ts))} · {relTime(a.ts)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
