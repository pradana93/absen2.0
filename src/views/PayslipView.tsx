/**
 * Gaji — staff see issued slips (read-only, printable); HR/Super Admin
 * compute drafts from live attendance, adjust bonus/note, issue & withdraw.
 */
import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { computeSlip, monthLabel, Payslip } from "../lib/database";
import { idr, todayKey, wibShortDate } from "../lib/format";
import { useToast } from "../components/Toast";
import { Banner, Chip, Modal, SectionLabel } from "../components/bits";
import { IconCheck, IconDownload, IconLock, IconWallet, IconX } from "../components/icons";

function SlipBody({ slip }: { slip: Payslip }) {
  const { company } = useApp();
  return (
    <div className="slip-print space-y-4">
      <div className="flex items-center justify-between rounded-2xl bg-ink-900 px-4 py-3.5 text-white">
        <div className="flex min-w-0 items-center gap-2.5">
          {company.logo && <img src={company.logo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-white/20" />}
          <div className="min-w-0">
            <p className="truncate font-display text-[16px] font-extrabold">{company.name}</p>
            <p className="truncate text-[10.5px] font-semibold text-white/55">{company.address}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-extrabold tracking-[0.16em] text-white/50 uppercase">Slip Gaji</p>
          <p className="font-display text-[15px] font-extrabold capitalize">{monthLabel(slip.month)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-ink-50 px-3 py-2.5">
          <p className="text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">Karyawan</p>
          <p className="text-[13px] font-extrabold text-ink-900">{slip.name}</p>
          <p className="text-[10.5px] font-semibold text-ink-400">{slip.staffId} · {slip.position}</p>
        </div>
        <div className="rounded-xl bg-ink-50 px-3 py-2.5">
          <p className="text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">Departemen</p>
          <p className="text-[13px] font-extrabold text-ink-900">{slip.department}</p>
          <p className="text-[10.5px] font-semibold text-ink-400">
            {slip.hadir} hadir · {slip.cuti} cuti · {slip.libur} libur{slip.terlambat ? ` · ${slip.terlambat}× telat` : ""}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-extrabold tracking-[0.14em] text-ink-400 uppercase">Pendapatan</p>
        <div className="divide-y divide-dashed divide-ink-100 rounded-xl border border-ink-100 px-3.5">
          {[
            ["Gaji pokok (prorata)", slip.gajiPokok],
            ["Tunjangan transport", slip.transport],
            ["Tunjangan makan", slip.meal],
            [`Lembur (${Math.round(slip.lemburMin)} mnt)`, slip.lembur],
            ...(slip.bonus ? [["Bonus / penyesuaian", slip.bonus] as [string, number]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2">
              <span className="text-[12px] font-bold text-ink-600">{k}</span>
              <span className="font-mono text-[12.5px] font-extrabold text-ink-900">{idr(v as number)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between py-2">
            <span className="text-[12px] font-extrabold text-ink-900">Bruto</span>
            <span className="font-mono text-[13px] font-extrabold text-ink-900">{idr(slip.bruto)}</span>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-extrabold tracking-[0.14em] text-ink-400 uppercase">Potongan</p>
        <div className="divide-y divide-dashed divide-ink-100 rounded-xl border border-danger-200 px-3.5">
          {[
            [`Keterlambatan (${slip.totalLateMin} mnt)`, slip.potongTelat],
            ["Tidak hadir", slip.potongAbsen],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2">
              <span className="text-[12px] font-bold text-ink-600">{k}</span>
              <span className="font-mono text-[12.5px] font-extrabold text-danger-600">−{idr(v as number)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-sun-500 to-sun-600 px-4 py-3.5 text-white shadow-[0_12px_28px_rgba(240,115,0,0.35)]">
        <div>
          <p className="text-[10px] font-extrabold tracking-[0.14em] text-white/70 uppercase">Diterima Bersih</p>
          <p className="font-display text-[24px] leading-tight font-extrabold">{idr(slip.net)}</p>
        </div>
        <IconWallet size={34} className="text-white/70" />
      </div>

      {slip.note && (
        <p className="rounded-xl bg-sky-100/70 px-3.5 py-2.5 text-[11.5px] leading-relaxed font-semibold text-sky-600">
          Catatan HR: {slip.note}
        </p>
      )}

      <p className="text-center text-[9.5px] font-bold text-ink-300">
        {slip.status === "issued" && slip.issuedAt
          ? `Diterbitkan ${wibShortDate(new Date(slip.issuedAt))} oleh ${slip.issuedBy} · dihitung otomatis dari data absensi`
          : "Draf — belum diterbitkan"}
      </p>
    </div>
  );
}

export default function PayslipView() {
  const { session, employees, logs, breaks, leaves, shifts, company, payslips, issuePayslip, withdrawPayslip, audit } = useApp();
  const toast = useToast();
  const me = session!;
  const isHR = me.role === "companyadmin" || me.role === "superadmin";

  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [viewSlip, setViewSlip] = useState<Payslip | null>(null);
  const [bonusMap, setBonusMap] = useState<Record<string, number>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [confirmIssue, setConfirmIssue] = useState<Payslip | null>(null);

  const staffList = useMemo(
    () => employees.filter((e) => e.status === "active" && (e.role === "employee" || e.role === "manager")),
    [employees],
  );

  const drafts = useMemo(
    () =>
      staffList.map((emp) => ({
        emp,
        slip: computeSlip(emp, month, logs, breaks, leaves, shifts, company, bonusMap[emp.staffId] ?? 0, noteMap[emp.staffId] ?? ""),
      })),
    [staffList, month, logs, breaks, leaves, shifts, company, bonusMap, noteMap],
  );

  const issuedFor = (staffId: string) => payslips.find((p) => p.staffId === staffId && p.month === month && p.status === "issued");

  /* ------------------------------ staff view ------------------------------ */
  if (!isHR) {
    const mine = payslips.filter((p) => p.staffId === me.staffId && p.status === "issued").sort((a, b) => b.month.localeCompare(a.month));
    return (
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">Gaji</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-400">Slip diterbitkan oleh Admin HR setiap bulan</p>
        </div>

        {mine.length === 0 ? (
          <div className="card anim-fade-up flex flex-col items-center gap-2 border-dashed px-6 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-ink-50 text-ink-300"><IconWallet size={26} /></span>
            <p className="font-display text-[16px] font-bold text-ink-800">Belum ada slip diterbitkan</p>
            <p className="max-w-xs text-[13px] leading-relaxed text-ink-400">
              Nominal dihitung otomatis dari absensi — Admin HR yang menerbitkan slip bulanan Anda.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {mine.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setViewSlip(p)}
                className="tile-pop card card-press flex w-full cursor-pointer items-center gap-3.5 p-4 text-left"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sun-400 to-sun-600 text-white shadow-[0_8px_20px_rgba(240,115,0,0.35)]">
                  <IconWallet size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[15px] font-extrabold text-ink-900 capitalize">{monthLabel(p.month)}</p>
                  <p className="text-[11px] font-semibold text-ink-400">
                    {p.hadir} hari hadir{p.terlambat ? ` · ${p.terlambat}× telat` : ""} · terbit {p.issuedAt ? wibShortDate(new Date(p.issuedAt)) : "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-[17px] font-extrabold text-ok-600">{idr(p.net)}</p>
                  <p className="text-[9px] font-extrabold tracking-wide text-ink-300 uppercase">bersih</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <Modal open={!!viewSlip} onClose={() => setViewSlip(null)} title={`Slip — ${viewSlip ? monthLabel(viewSlip.month) : ""}`} wide>
          {viewSlip && (
            <div className="space-y-3">
              <SlipBody slip={viewSlip} />
              <button className="btn-sun w-full print:hidden" onClick={() => window.print()}>
                <IconDownload size={16} /> Cetak / Simpan PDF
              </button>
            </div>
          )}
        </Modal>
      </div>
    );
  }

  /* ------------------------------- HR view -------------------------------- */
  const totalNet = drafts.reduce((a, d) => a + d.slip.net, 0);
  const issuedCount = staffList.filter((e) => issuedFor(e.staffId)).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">Penggajian</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-400">{monthLabel(month)} · dihitung dari absensi</p>
        </div>
        <input type="month" className="input !w-auto !py-2.5 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      <div className="card flex items-center justify-between bg-ink-900 px-4 py-3.5 text-white">
        <div>
          <p className="text-[10px] font-extrabold tracking-[0.14em] text-white/55 uppercase">Total gaji bersih</p>
          <p className="font-display text-[24px] leading-tight font-extrabold">{idr(totalNet)}</p>
        </div>
        <Chip tone="sun">{issuedCount}/{staffList.length} terbit</Chip>
      </div>

      <div className="space-y-3">
        {drafts.map(({ emp, slip }, i) => {
          const issued = issuedFor(emp.staffId);
          return (
            <div key={emp.staffId} className="tile-pop card p-4" style={{ animationDelay: `${i * 45}ms` }}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-extrabold text-ink-900">
                    <span className="truncate">{emp.name}</span>
                    {issued ? <Chip tone="ok"><IconCheck size={10} /> TERBIT</Chip> : <Chip tone="ink">DRAF</Chip>}
                  </p>
                  <p className="text-[11px] font-semibold text-ink-400">
                    {emp.department} · {slip.hadir} hadir · {slip.terlambat}× telat · lembur {Math.round(slip.lemburMin)}m
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-[18px] leading-tight font-extrabold text-ok-600">{idr(slip.net)}</p>
                  <p className="text-[9px] font-extrabold tracking-wide text-ink-300 uppercase">bruto {idr(slip.bruto)}</p>
                </div>
              </div>

              {issued ? (
                <div className="mt-3 flex gap-2">
                  <button className="btn-soft flex-1 !py-2.5 !text-[12.5px]" onClick={() => setViewSlip(issued)}>
                    Lihat Slip
                  </button>
                  <button
                    className="btn-danger !py-2.5 !text-[12.5px]"
                    onClick={() => { withdrawPayslip(issued.id); toast.push("info", "Slip ditarik", `${emp.name} · ${monthLabel(month)}`); }}
                  >
                    <IconX size={13} /> Tarik
                  </button>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Bonus (Rp)</label>
                      <input
                        type="number" step={50000} min={0} className="input !py-2 font-mono text-[13px]"
                        value={bonusMap[emp.staffId] ?? 0}
                        onChange={(e) => setBonusMap({ ...bonusMap, [emp.staffId]: Math.max(0, Number(e.target.value)) })}
                      />
                    </div>
                    <div>
                      <label className="label">Catatan</label>
                      <input
                        className="input !py-2 text-[13px]" placeholder="opsional"
                        value={noteMap[emp.staffId] ?? ""}
                        onChange={(e) => setNoteMap({ ...noteMap, [emp.staffId]: e.target.value })}
                      />
                    </div>
                  </div>
                  <button className="btn-sun w-full !py-2.5 !text-[13px]" onClick={() => setConfirmIssue(slip)}>
                    <IconCheck size={15} /> Terbitkan Slip
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Banner tone="info" title="Hitung otomatis">
        Prorata kehadiran, tunjangan per hari hadir, lembur dari shift, potongan telat & absen — semua dari data absensi live.
      </Banner>

      {/* issue confirm */}
      <Modal open={!!confirmIssue} onClose={() => setConfirmIssue(null)} title="Terbitkan slip?">
        {confirmIssue && (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed font-semibold text-ink-500">
              Slip <b>{confirmIssue.name}</b> periode <b className="capitalize">{monthLabel(confirmIssue.month)}</b> akan dikirim
              sebagai notifikasi dan tampil di menu Gaji karyawan.
            </p>
            <div className="rounded-2xl bg-ink-900 px-4 py-3 text-white">
              <p className="text-[10px] font-extrabold tracking-wide text-white/55 uppercase">Diterima bersih</p>
              <p className="font-display text-[22px] font-extrabold">{idr(confirmIssue.net)}</p>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1 !py-3 text-sm" onClick={() => setConfirmIssue(null)}>Batal</button>
              <button
                className="btn-sun flex-[1.6] !py-3 text-sm"
                onClick={() => {
                  issuePayslip(confirmIssue, me.name);
                  audit("PAYSLIP_ISSUE", confirmIssue.staffId, `Slip ${confirmIssue.month} · net ${confirmIssue.net}`);
                  toast.push("ok", "Slip diterbitkan", `${confirmIssue.name} · ${idr(confirmIssue.net)}`);
                  setConfirmIssue(null);
                }}
              >
                <IconCheck size={15} /> Ya, Terbitkan
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* view issued slip */}
      <Modal open={!!viewSlip} onClose={() => setViewSlip(null)} title={`Slip — ${viewSlip ? monthLabel(viewSlip.month) : ""}`} wide>
        {viewSlip && (
          <div className="space-y-3">
            <SlipBody slip={viewSlip} />
            <button className="btn-sun w-full print:hidden" onClick={() => window.print()}>
              <IconDownload size={16} /> Cetak / Simpan PDF
            </button>
          </div>
        )}
      </Modal>
      <span className="hidden"><IconLock size={1} /></span>
    </div>
  );
}
