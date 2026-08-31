/** Papan Pengumuman — HR posts (per gudang or all), staff acknowledge. */
import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { BoardPost } from "../lib/database";
import { relTime, wibShortDate, wibTime } from "../lib/format";
import { useToast } from "../components/Toast";
import { Banner, Chip, EmptyState, Modal, SectionLabel } from "../components/bits";
import { IconBell, IconCheck, IconInfo, IconPlus, IconTrash, IconX } from "../components/icons";

const toneCls: Record<BoardPost["tone"], { border: string; badge: string }> = {
  info: { border: "border-l-sky-500", badge: "chip-sky" },
  warn: { border: "border-l-warn-500", badge: "chip-warn" },
  danger: { border: "border-l-danger-500", badge: "chip-danger" },
  ok: { border: "border-l-ok-500", badge: "chip-ok" },
};

export default function PengumumanView() {
  const { session, sites, activeSite, employees, board, postBoard, ackBoard, deleteBoard, audit } = useApp();
  const toast = useToast();
  const me = session!;
  const isAdmin = me.role === "companyadmin" || me.role === "superadmin";
  const isStaff = me.role === "employee" || me.role === "manager";

  const [composeOpen, setComposeOpen] = useState(false);
  const [cTitle, setCTitle] = useState("");
  const [cBody, setCBody] = useState("");
  const [cTone, setCTone] = useState<BoardPost["tone"]>("info");
  const [cSite, setCSite] = useState<string | "all">("all");
  const [cErr, setCErr] = useState("");

  const visible = useMemo(
    () => board.filter((p) => p.siteId === null || p.siteId === activeSite.id).sort((a, b) => b.createdAt - a.createdAt),
    [board, activeSite.id],
  );

  const recipients = (p: BoardPost) =>
    employees.filter((e) => e.status === "active" && (e.role === "employee" || e.role === "manager") && (p.siteId === null || e.siteId === p.siteId));

  const publish = () => {
    if (cTitle.trim().length < 5) return setCErr("Judul minimal 5 karakter.");
    if (cBody.trim().length < 10) return setCErr("Isi pengumuman minimal 10 karakter.");
    postBoard({ siteId: cSite === "all" ? null : cSite, title: cTitle, body: cBody, tone: cTone });
    toast.push("ok", "Pengumuman dipublikasikan", cSite === "all" ? "Semua gudang" : sites.find((s) => s.id === cSite)?.name ?? "");
    setComposeOpen(false); setCTitle(""); setCBody(""); setCErr("");
  };

  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">Pengumuman</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-400">Papan kabar {activeSite.shortName} & seluruh area</p>
        </div>
        {isAdmin && (
          <button className="btn-sun !rounded-xl !px-4 !py-2.5 text-sm" onClick={() => setComposeOpen(!composeOpen)}>
            {composeOpen ? <IconX size={15} /> : <IconPlus size={15} />} Buat
          </button>
        )}
      </div>

      {/* composer */}
      {isAdmin && composeOpen && (
        <div className="card anim-fade-up space-y-3.5 p-4">
          <SectionLabel>Pengumuman Baru</SectionLabel>
          <input className="input !py-2.5 text-sm" placeholder="Judul (min. 5 karakter)" value={cTitle} onChange={(e) => setCTitle(e.target.value)} />
          <textarea className="input !py-2.5 text-sm" rows={3} placeholder="Isi pengumuman (min. 10 karakter)" value={cBody} onChange={(e) => setCBody(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nada</label>
              <div className="flex gap-1.5">
                {(["info", "warn", "danger", "ok"] as const).map((t) => (
                  <button key={t} onClick={() => setCTone(t)} className={`flex-1 cursor-pointer rounded-lg py-2 text-[10.5px] font-extrabold uppercase transition ${cTone === t ? toneCls[t].badge : "bg-ink-50 text-ink-400"}`}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Target</label>
              <select className="input !py-2.5 text-sm" value={cSite} onChange={(e) => setCSite(e.target.value)}>
                <option value="all">Semua Gudang</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          {cErr && <Banner tone="warn">{cErr}</Banner>}
          <button className="btn-sun w-full" onClick={publish}><IconBell size={16} /> Publikasikan</button>
        </div>
      )}

      {/* posts */}
      {visible.length === 0 ? (
        <EmptyState icon={<IconBell size={26} />} title="Belum ada pengumuman" desc={isAdmin ? "Publikasikan pengumuman pertama untuk tim gudang." : "Pengumuman dari Admin HR akan muncul di sini."} />
      ) : (
        <div className="space-y-3">
          {visible.map((p, i) => {
            const rcpts = recipients(p);
            const acked = p.acks.length;
            const pct = rcpts.length ? Math.round((acked / rcpts.length) * 100) : 0;
            const mine = p.acks.includes(me.staffId);
            return (
              <article key={p.id} className={`tile-pop card border-l-4 p-4 ${toneCls[p.tone].border}`} style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 font-display text-[16px] leading-tight font-extrabold text-ink-900">
                      <span>{p.title}</span>
                      <span className={toneCls[p.tone].badge}>{p.tone.toUpperCase()}</span>
                      {p.siteId === null ? <Chip tone="ink">SEMUA AREA</Chip> : <Chip tone="teal">{sites.find((s) => s.id === p.siteId)?.shortName ?? "—"}</Chip>}
                    </p>
                    <p className="mt-1.5 text-[13px] leading-relaxed font-semibold text-ink-500">{p.body}</p>
                    <p className="mt-2 text-[10.5px] font-bold text-ink-300">
                      {p.createdBy} · {wibShortDate(new Date(p.createdAt))} {wibTime(new Date(p.createdAt))} · {relTime(p.createdAt)}
                    </p>
                  </div>
                  {isAdmin && (
                    <button className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg bg-danger-100 text-danger-600 transition hover:bg-danger-500 hover:text-white active:scale-90"
                      onClick={() => { deleteBoard(p.id); toast.push("info", "Pengumuman dihapus", p.title); }} title="Hapus" aria-label="Hapus pengumuman"><IconTrash size={14} /></button>
                  )}
                </div>

                {isStaff && (
                  <div className="mt-3">
                    {mine ? (
                      <p className="flex items-center gap-1.5 text-[12px] font-extrabold text-ok-600"><IconCheck size={14} /> Anda sudah mengonfirmasi</p>
                    ) : (
                      <button className="btn-sun w-full !py-2.5 !text-[13px]" onClick={() => { ackBoard(p.id); audit("BOARD_ACK", p.id, `Konfirmasi "${p.title}"`); toast.push("ok", "Konfirmasi tercatat", "Admin dapat melihat Anda sudah membaca."); }}>
                        <IconCheck size={15} /> Mengerti
                      </button>
                    )}
                  </div>
                )}

                {isAdmin && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10.5px] font-extrabold text-ink-400">
                      <span>Konfirmasi dibaca</span>
                      <span className="font-mono">{acked}/{rcpts.length} · {pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div className={`bar-grow-x h-full rounded-full ${pct === 100 ? "bg-ok-500" : "bg-sun-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <span className="hidden"><IconInfo size={1} /></span>
    </div>
  );
}
