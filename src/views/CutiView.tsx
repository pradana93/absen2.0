/**
 * Cuti — leave balances, request form with attachment, two-stage workflow
 * (Manajer → HR) with SLA chips and batch approvals, personal history.
 */
import { useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store";
import { LEAVE_QUOTAS, LEAVE_TYPES, LeaveRequest, LeaveType, leaveUsed } from "../lib/database";
import { todayKey, uid, wibShortDate } from "../lib/format";
import { useToast } from "../components/Toast";
import { Banner, Chip, SectionLabel, Tone } from "../components/bits";
import { IconBriefcase, IconCheck, IconDoc, IconPlus, IconX } from "../components/icons";

const toneFor: Record<LeaveType, Tone> = { Tahunan: "sun", Sakit: "sky", Darurat: "coral", Melahirkan: "grape" };

export default function CutiView() {
  const { session, employees, leaves, addLeave, decideLeave, audit } = useApp();
  const toast = useToast();
  const me = session!;
  const isManager = me.role === "manager";
  const isHR = me.role === "companyadmin" || me.role === "superadmin";

  const [formOpen, setFormOpen] = useState(false);
  const [lvType, setLvType] = useState<LeaveType>("Tahunan");
  const [lvDate, setLvDate] = useState("");
  const [lvDays, setLvDays] = useState(1);
  const [lvReason, setLvReason] = useState("");
  const [lvFile, setLvFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [lvErr, setLvErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const year = new Date().getFullYear();
  const myLeaves = useMemo(() => leaves.filter((l) => l.staffId === me.staffId).sort((a, b) => b.createdAt - a.createdAt), [leaves, me.staffId]);
  const mgrQueue = useMemo(() => leaves.filter((l) => l.status === "pending").sort((a, b) => b.createdAt - a.createdAt), [leaves]);
  const hrQueue = useMemo(() => leaves.filter((l) => l.status === "pending_hr").sort((a, b) => b.createdAt - a.createdAt), [leaves]);
  const allRequests = useMemo(() => (isHR || isManager ? [...leaves].sort((a, b) => b.createdAt - a.createdAt) : []), [leaves, isHR, isManager]);

  const remaining = (t: LeaveType) => Math.max(0, LEAVE_QUOTAS[t] - leaveUsed(leaves, me.staffId, year, t));

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 300_000) return setLvErr("Lampiran maksimal 300 KB (penyimpanan perangkat).");
    const reader = new FileReader();
    reader.onload = () => setLvFile({ name: f.name, dataUrl: String(reader.result) });
    reader.readAsDataURL(f);
    setLvErr("");
  };

  const submit = () => {
    if (!lvDate) return setLvErr("Pilih tanggal cuti terlebih dahulu.");
    if (lvDate < todayKey()) return setLvErr("Tanggal cuti tidak boleh di masa lalu.");
    if (!lvReason.trim()) return setLvErr("Isi alasan pengajuan terlebih dahulu.");
    if (lvDays < 1 || lvDays > 10) return setLvErr("Durasi 1–10 hari per pengajuan.");
    if (lvType !== "Melahirkan" && lvDays > remaining(lvType)) return setLvErr(`Sisa ${lvType.toLowerCase()} Anda ${remaining(lvType)} hari.`);
    addLeave({
      id: uid("lv"), staffId: me.staffId, name: me.name, type: lvType, date: lvDate,
      days: lvDays, reason: lvReason.trim(), attachment: lvFile, status: "pending",
      managerDecision: null, hrDecision: null, createdAt: Date.now(),
    });
    audit("LEAVE_REQUEST", me.staffId, `${lvType} · ${lvDays} hari · ${lvDate}`);
    toast.push("ok", "Pengajuan cuti terkirim", `${lvType} · ${lvDays} hari — menunggu Manajer.`);
    setFormOpen(false);
    setLvType("Tahunan"); setLvDate(""); setLvDays(1); setLvReason(""); setLvFile(null); setLvErr("");
  };

  const empName = (id: string) => employees.find((e) => e.staffId === id)?.name ?? id;

  const SlaChip = ({ createdAt }: { createdAt: number }) => {
    const h = Math.floor((Date.now() - createdAt) / 3600000);
    if (h >= 24) return <Chip tone="danger" className="!px-1.5 !py-0.5 !text-[9.5px]">SLA {Math.floor(h / 24)}h+</Chip>;
    if (h >= 12) return <Chip tone="warn" className="!px-1.5 !py-0.5 !text-[9.5px]">SLA {h} jam</Chip>;
    return <Chip tone="ok" className="!px-1.5 !py-0.5 !text-[9.5px]">BARU</Chip>;
  };

  const QueueCard = ({ lv, stage }: { lv: LeaveRequest; stage: "manager" | "hr" }) => (
    <div className="card anim-fade-up flex items-start gap-3 p-3.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-extrabold text-ink-900">
          {lv.name}
          <Chip tone={toneFor[lv.type]} className="!px-1.5 !py-0.5 !text-[9.5px]">{lv.type.toUpperCase()}</Chip>
          {lv.attachment && <Chip tone="ink" className="!px-1.5 !py-0.5 !text-[9.5px]"><IconDoc size={9} /> LAMPIRAN</Chip>}
          <SlaChip createdAt={lv.createdAt} />
        </p>
        <p className="mt-0.5 text-[11.5px] font-semibold text-ink-400">
          {lv.days} hari · {wibShortDate(new Date(lv.date + "T00:00:00"))} · “{lv.reason}”
        </p>
        {stage === "hr" && lv.managerDecision && (
          <p className="mt-0.5 text-[10.5px] font-bold text-sky-600">✓ Disetujui Manajer: {lv.managerDecision.by}</p>
        )}
      </div>
      <div className="flex shrink-0 gap-1.5 pt-0.5">
        <button
          onClick={() => { decideLeave(lv.id, true, stage); toast.push("ok", "Pengajuan disetujui", `${lv.name} · ${lv.type} ${lv.days} hari${stage === "manager" ? " → lanjut ke HR" : ""}`); }}
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl bg-ok-100 text-ok-600 transition hover:bg-ok-500 hover:text-white active:scale-90" aria-label="Setujui"
        >
          <IconCheck size={16} />
        </button>
        <button
          onClick={() => { decideLeave(lv.id, false, stage); toast.push("danger", "Pengajuan ditolak", `${lv.name} · ${lv.type} ${lv.days} hari`); }}
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl bg-danger-100 text-danger-600 transition hover:bg-danger-500 hover:text-white active:scale-90" aria-label="Tolak"
        >
          <IconX size={16} />
        </button>
      </div>
    </div>
  );

  const batchBtn = (queue: LeaveRequest[], stage: "manager" | "hr") =>
    queue.length > 1 && (
      <button
        className="btn-sun !rounded-lg !px-2.5 !py-1.5 !text-[11px]"
        onClick={() => {
          queue.forEach((lv) => decideLeave(lv.id, true, stage));
          toast.push("ok", "Semua disetujui", `${queue.length} pengajuan ${stage === "manager" ? "diteruskan ke HR" : "final"}.`);
        }}
      >
        Setujui Semua
      </button>
    );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">Cuti</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-400">Alur: Karyawan → Manajer → HR</p>
        </div>
        <button className="btn-sun !rounded-xl !px-4 !py-2.5 text-sm" onClick={() => setFormOpen(!formOpen)}>
          {formOpen ? <IconX size={15} /> : <IconPlus size={15} />} Ajukan
        </button>
      </div>

      {/* balances */}
      <div className="grid grid-cols-2 gap-2.5">
        {LEAVE_TYPES.map((t) => (
          <div key={t} className="card card-press p-3.5">
            <div className="flex items-center justify-between">
              <Chip tone={toneFor[t]}>{t.toUpperCase()}</Chip>
              <span className="font-display text-[17px] font-extrabold text-ink-900">{remaining(t)}<span className="text-[11px] text-ink-400">/{LEAVE_QUOTAS[t]}</span></span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div className="bar-grow-x h-full rounded-full bg-sun-500" style={{ width: `${(remaining(t) / LEAVE_QUOTAS[t]) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* form */}
      {formOpen && (
        <div className="card anim-fade-up space-y-3.5 p-4">
          <SectionLabel>Form Pengajuan</SectionLabel>
          <div className="flex gap-1.5 overflow-x-auto">
            {LEAVE_TYPES.map((t) => (
              <button key={t} onClick={() => setLvType(t)} className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-[12px] font-extrabold transition ${lvType === t ? "bg-sun-500 text-white shadow" : "border border-ink-100 bg-white text-ink-500"}`}>{t}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tanggal mulai</label>
              <input type="date" className="input !py-2.5 text-sm" value={lvDate} min={todayKey()} onChange={(e) => setLvDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Durasi (hari)</label>
              <input type="number" min={1} max={10} className="input !py-2.5 text-sm" value={lvDays} onChange={(e) => setLvDays(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label className="label">Alasan</label>
            <input className="input !py-2.5 text-sm" placeholder="cth. Acara keluarga di luar kota" value={lvReason} onChange={(e) => setLvReason(e.target.value)} />
          </div>
          <div>
            <label className="label">Lampiran (opsional — surat dokter, dsb.)</label>
            <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            {lvFile ? (
              <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2.5">
                <IconDoc size={15} className="text-sky-600" />
                <span className="flex-1 truncate text-[12px] font-bold text-ink-700">{lvFile.name}</span>
                <button className="cursor-pointer text-ink-400 hover:text-danger-600" onClick={() => setLvFile(null)} aria-label="Hapus lampiran"><IconX size={14} /></button>
              </div>
            ) : (
              <button className="btn-soft w-full !py-2.5 !text-[13px]" onClick={() => fileRef.current?.click()}>Pilih file (maks 300 KB)</button>
            )}
          </div>
          {lvErr && <Banner tone="warn">{lvErr}</Banner>}
          <button className="btn-sun w-full" onClick={submit}>Kirim Pengajuan</button>
        </div>
      )}

      {/* manager queue */}
      {isManager && (
        <section>
          <SectionLabel right={<div className="flex items-center gap-1.5">{batchBtn(mgrQueue, "manager")}<Chip tone={mgrQueue.length ? "warn" : "ok"}>{mgrQueue.length} antre</Chip></div>}>
            Persetujuan Manajer (Tahap 1)
          </SectionLabel>
          {mgrQueue.length === 0 ? (
            <p className="card px-4 py-5 text-center text-[13px] font-semibold text-ink-400">Tidak ada pengajuan menunggu.</p>
          ) : (
            <div className="space-y-2.5">{mgrQueue.map((lv) => <QueueCard key={lv.id} lv={lv} stage="manager" />)}</div>
          )}
        </section>
      )}

      {/* HR queue */}
      {isHR && (
        <section>
          <SectionLabel right={<div className="flex items-center gap-1.5">{batchBtn(hrQueue, "hr")}<Chip tone={hrQueue.length ? "warn" : "ok"}>{hrQueue.length} antre</Chip></div>}>
            Persetujuan HR (Tahap 2)
          </SectionLabel>
          {hrQueue.length === 0 ? (
            <p className="card px-4 py-5 text-center text-[13px] font-semibold text-ink-400">Tidak ada pengajuan menunggu.</p>
          ) : (
            <div className="space-y-2.5">{hrQueue.map((lv) => <QueueCard key={lv.id} lv={lv} stage="hr" />)}</div>
          )}
        </section>
      )}

      {/* history */}
      <section className="pb-2">
        <SectionLabel right={<Chip tone="ink">{(isHR || isManager ? allRequests : myLeaves).length} pengajuan</Chip>}>
          {isHR || isManager ? "Semua Pengajuan" : "Pengajuan Saya"}
        </SectionLabel>
        {(isHR || isManager ? allRequests : myLeaves).length === 0 ? (
          <p className="card px-4 py-5 text-center text-[13px] font-semibold text-ink-400">Belum ada pengajuan.</p>
        ) : (
          <div className="card divide-y divide-ink-100/80">
            {(isHR || isManager ? allRequests : myLeaves).map((lv, i) => (
              <div key={lv.id} className="tile-pop flex items-center gap-3 px-3.5 py-3" style={{ animationDelay: `${i * 40}ms` }}>
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                  lv.status === "approved" ? "bg-ok-100 text-ok-600" : lv.status === "rejected" ? "bg-danger-100 text-danger-600" : "bg-sky-100 text-sky-600"
                }`}>
                  {lv.status === "approved" ? <IconCheck size={17} /> : lv.status === "rejected" ? <IconX size={17} /> : <IconBriefcase size={17} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-extrabold text-ink-900">
                    {(isHR || isManager) && <span className="truncate">{empName(lv.staffId)}</span>}
                    <Chip tone={toneFor[lv.type]} className="!px-1.5 !py-0.5 !text-[9px]">{lv.type.toUpperCase()}</Chip>
                    <Chip tone={lv.status === "approved" ? "ok" : lv.status === "rejected" ? "danger" : lv.status === "pending_hr" ? "sky" : "warn"} className="!px-1.5 !py-0.5 !text-[9px]">
                      {lv.status === "pending" ? "MENUNGGU MGR" : lv.status === "pending_hr" ? "MENUNGGU HR" : lv.status === "approved" ? "DISETUJUI" : "DITOLAK"}
                    </Chip>
                  </p>
                  <p className="truncate text-[11px] font-semibold text-ink-400">
                    {lv.days} hari · {wibShortDate(new Date(lv.date + "T00:00:00"))} · “{lv.reason}”
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
