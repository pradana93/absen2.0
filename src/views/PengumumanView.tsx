/**
 * Papan Pengumuman — HR posts site-wide or per-area notices; staff tap
 * "Mengerti" and HR watches the acknowledgment bar fill up.
 */
import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { BoardPost } from "../lib/database";
import { relTime } from "../lib/format";
import { useToast } from "../components/Toast";
import { Banner, Chip, EmptyState, SectionLabel } from "../components/bits";
import { IconAlert, IconBell, IconCheck, IconInfo, IconPlus, IconTrash, IconX } from "../components/icons";

const TONE: Record<BoardPost["tone"], { chip: string; bar: string; icon: React.ReactNode; label: string }> = {
  info: { chip: "bg-sky-100 text-sky-600", bar: "bg-sky-500", icon: <IconInfo size={16} />, label: "Info" },
  ok: { chip: "bg-ok-100 text-ok-600", bar: "bg-ok-500", icon: <IconCheck size={16} />, label: "Positif" },
  warn: { chip: "bg-warn-100 text-warn-600", bar: "bg-warn-500", icon: <IconAlert size={16} />, label: "Perhatian" },
  danger: { chip: "bg-danger-100 text-danger-600", bar: "bg-danger-500", icon: <IconAlert size={16} />, label: "Penting" },
};

export default function PengumumanView() {
  const { session, employees, board, sites, activeSite, postBoard, ackBoard, deleteBoard, audit } = useApp();
  const toast = useToast();
  const me = session!;
  const isAdmin = me.role === "companyadmin" || me.role === "superadmin";

  const [compose, setCompose] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState<BoardPost["tone"]>("info");
  const [scope, setScope] = useState<string>(activeSite.id);
  const [err, setErr] = useState("");
  const [armed, setArmed] = useState<string | null>(null);

  const visible = useMemo(
    () => board.filter((p) => p.siteId === null || p.siteId === activeSite.id).sort((a, b) => b.createdAt - a.createdAt),
    [board, activeSite.id],
  );

  const targetsOf = (p: BoardPost) =>
    employees.filter((e) => e.status === "active" && (e.role === "employee" || e.role === "manager") && (p.siteId === null || e.siteId === p.siteId));

  const submit = () => {
    if (title.trim().length < 4) return setErr("Judul minimal 4 karakter.");
    if (body.trim().length < 10) return setErr("Isi pengumuman minimal 10 karakter.");
    postBoard({ siteId: scope === "all" ? null : scope, title, body, tone });
    audit("BOARD_POST_UI", scope, `"${title.trim()}"`);
    toast.push("ok", "Pengumuman terkirim", "Semua staf yang bersangkutan dinotifikasi.");
    setCompose(false); setTitle(""); setBody(""); setTone("info"); setErr("");
  };

  const handleDelete = (id: string) => {
    if (armed !== id) { setArmed(id); window.setTimeout(() => setArmed(null), 2600); return; }
    deleteBoard(id);
    toast.push("info", "Pengumuman dihapus");
    setArmed(null);
  };

  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">Papan Pengumuman</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-400">
            {isAdmin ? "Kelola informasi untuk seluruh tim" : `Informasi untuk ${activeSite.name}`}
          </p>
        </div>
        {isAdmin && (
          <button className="btn-sun !rounded-xl !px-4 !py-2.5 text-sm" onClick={() => setCompose((c) => !c)}>
            {compose ? <IconX size={15} /> : <IconPlus size={15} />} {compose ? "Tutup" : "Buat"}
          </button>
        )}
      </div>

      {/* composer */}
      {isAdmin && compose && (
        <div className="card anim-fade-up space-y-3.5 border-sun-300 p-4">
          <SectionLabel>Pengumuman Baru</SectionLabel>
          <div>
            <label className="label">Judul</label>
            <input className="input !py-2.5 text-sm" placeholder="cth. Jadwal lembur akhir pekan" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Isi</label>
            <textarea className="input !py-2.5 text-sm" rows={3} placeholder="Tulis detail pengumuman…" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nada</label>
              <div className="flex gap-1.5">
                {(Object.keys(TONE) as BoardPost["tone"][]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTone(t)}
                    className={`flex-1 cursor-pointer rounded-xl px-2 py-2 text-[10.5px] font-extrabold transition active:scale-95 ${TONE[t].chip} ${tone === t ? "ring-2 ring-ink-900/60" : "opacity-55 hover:opacity-90"}`}
                  >
                    {TONE[t].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Cakupan</label>
              <select className="input !py-2.5 text-sm" value={scope} onChange={(e) => setScope(e.target.value)}>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="all">Semua Area</option>
              </select>
            </div>
          </div>
          {err && <Banner tone="warn">{err}</Banner>}
          <button className="btn-sun w-full" onClick={submit}><IconBell size={16} /> Kirim & Notifikasi Staf</button>
        </div>
      )}

      {/* posts */}
      {visible.length === 0 ? (
        <EmptyState
          icon={<IconBell size={26} />}
          title="Belum ada pengumuman"
          desc={isAdmin ? "Buat pengumuman pertama untuk tim Anda." : "Pengumuman dari HR akan muncul di sini."}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((p, i) => {
            const t = TONE[p.tone];
            const targets = targetsOf(p);
            const acked = p.acks.includes(me.staffId);
            const pct = targets.length ? Math.round((p.acks.length / targets.length) * 100) : 0;
            return (
              <article key={p.id} className="card tile-pop overflow-hidden" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-start gap-3.5 p-4">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${t.chip}`}>{t.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2 className="text-[15px] leading-tight font-extrabold text-ink-900">{p.title}</h2>
                      <Chip tone={p.tone === "ok" ? "ok" : p.tone === "info" ? "sky" : p.tone === "warn" ? "warn" : "danger"} className="!px-1.5 !py-0.5 !text-[9px]">
                        {t.label.toUpperCase()}
                      </Chip>
                      {p.siteId === null && <Chip tone="ink" className="!px-1.5 !py-0.5 !text-[9px]">SEMUA AREA</Chip>}
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed font-semibold text-ink-500">{p.body}</p>
                    <p className="mt-1.5 text-[10.5px] font-bold text-ink-300">
                      {p.createdBy} · {relTime(p.createdAt)}
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(p.id)}
                      className={`grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl transition active:scale-90 ${
                        armed === p.id ? "anim-pop bg-danger-500 text-white" : "bg-ink-50 text-ink-400 hover:bg-danger-100 hover:text-danger-600"
                      }`}
                      aria-label="Hapus pengumuman"
                    >
                      <IconTrash size={15} />
                    </button>
                  )}
                </div>

                {/* ack strip */}
                <div className="border-t border-ink-100 bg-ink-50/60 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    {!isAdmin ? (
                      acked ? (
                        <span className="anim-pop inline-flex items-center gap-1.5 text-[12px] font-extrabold text-ok-600">
                          <IconCheck size={14} /> Anda sudah mengerti
                        </span>
                      ) : (
                        <button
                          onClick={() => { ackBoard(p.id); toast.push("ok", "Tercatat", "Konfirmasi Anda tersimpan."); }}
                          className="btn-sun !rounded-xl !px-4 !py-2 !text-[12.5px]"
                        >
                          <IconCheck size={14} /> Mengerti
                        </button>
                      )
                    ) : (
                      <span className="text-[11.5px] font-extrabold text-ink-500">
                        {p.acks.length}/{targets.length} staf sudah mengerti
                      </span>
                    )}
                    <span className="font-mono text-[11px] font-bold text-ink-400 tabular-nums">{pct}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
                    <div className={`prog-fill h-full rounded-full ${t.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
