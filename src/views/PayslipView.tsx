/**
 * Gaji — employees see issued slips (view/print only); Admin HR computes
 * each month from live attendance and issues slips (with bonus/note).
 */
import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { computeSlip, downloadTextFile, monthLabel, Payslip } from "../lib/database";
import { idr, todayKey, uid, wibShortDate, wibTime } from "../lib/format";
import { Banner, Chip, InitialsAvatar, Modal } from "../components/bits";
import { IconCheck, IconDownload, IconFile, IconWallet } from "../components/icons";

export default function PayslipView() {
  const { session, employees, logs, breaks, leaves, company, payslips, issuePayslip, withdrawPayslip, audit } = useApp();
  const me = session!;
  const isHR = me.role === "companyadmin" || me.role === "superadmin";

  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [viewSlip, setViewSlip] = useState<Payslip | null>(null);
  const [issueFor, setIssueFor] = useState<string | null>(null);
  const [bonus, setBonus] = useState(0);
  const [note, setNote] = useState("");

  const mySlips = useMemo(
    () => payslips.filter((p) => p.staffId === me.staffId).sort((a, b) => b.month.localeCompare(a.month)),
    [payslips, me.staffId],
  );

  const drafts = useMemo(
    () =>
      employees
        .filter((e) => e.status === "active" && (e.role === "employee" || e.role === "manager"))
        .map((e) => {
          const calc = computeSlip(e, month, logs, breaks, leaves, company.holidays);
          const issued = payslips.find((p) => p.staffId === e.staffId && p.month === month);
          return { emp: e, calc, issued };
        }),
    [employees, month, logs, breaks, leaves, company.holidays, payslips],
  );

  const totalNet = drafts.reduce((a, d) => a + (d.issued?.net ?? d.calc.net), 0);

  const doIssue = (staffId: string) => {
    const d = drafts.find((x) => x.emp.staffId === staffId);
    if (!d) return;
    const slip: Payslip = {
      ...d.calc,
      id: uid("slip"),
      bonus,
      gross: d.calc.gross + bonus,
      net: d.calc.net + bonus,
      note: note.trim(),
      status: "issued",
      issuedAt: Date.now(),
      issuedBy: me.name,
    };
    issuePayslip(slip, me.name);
    audit("PAYSLIP_ISSUE", staffId, `Slip ${month} diterbitkan untuk ${d.emp.name}`);
    setIssueFor(null);
    setBonus(0);
    setNote("");
  };

  const exportCsv = () => {
    const head = "Staff;Departemen;Periode;Hadir;Cuti;Absen;JamKerja;Lembur;Telat;Pokok;Tunjangan;LemburRp;Bonus;Potongan;Bruto;Netto";
    const body = drafts.map((d) =>
      [d.emp.staffId, d.emp.department, month, d.calc.presentDays, d.calc.approvedLeaveDays, d.calc.absentDays,
        d.calc.workMin, d.calc.otMin, d.calc.lateMin, d.calc.basic, d.calc.transport + d.calc.meal,
        d.calc.overtime, d.issued?.bonus ?? 0, d.calc.lateDeduct + d.calc.absentDeduct, d.calc.gross, d.calc.net].join(";"),
    );
    downloadTextFile(`penggajian-${month}.csv`, "\uFEFF" + [head, ...body].join("\n"), "text/csv;charset=utf-8");
  };

  const deptOf = (staffId: string) => employees.find((e) => e.staffId === staffId)?.department ?? "—";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">Gaji</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-400">
            {isHR ? "Penggajian — dihitung otomatis dari absensi" : "Slip gaji yang diterbitkan HR"}
          </p>
        </div>
        <input type="month" className="input !w-auto !py-2 !px-2.5 text-[13px]" value={month} max={todayKey().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>

      {isHR ? (
        <>
          <div className="card flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-[10.5px] font-extrabold tracking-[0.12em] text-ink-400 uppercase">Proyeksi netto · {monthLabel(month)}</p>
              <p className="font-display text-[24px] leading-tight font-extrabold text-ink-900">{idr(totalNet)}</p>
            </div>
            <button className="btn-soft !rounded-xl !px-3.5 !py-2.5 text-[12px]" onClick={exportCsv}>
              <IconDownload size={14} /> CSV
            </button>
          </div>

          <p className="rounded-xl bg-ink-50 px-3.5 py-2.5 text-[11.5px] leading-relaxed font-semibold text-ink-400">
            Nominal dihitung otomatis: pokok prorata kehadiran, tunjangan per hari hadir, lembur dari shift, potongan telat/absen.
            Terbitkan untuk mengirim slip ke karyawan.
          </p>

          <div className="space-y-2.5">
            {drafts.map(({ emp, calc, issued }) => (
              <div key={emp.staffId} className="card flex items-center gap-3 p-3.5">
                <InitialsAvatar name={emp.name} photo={emp.photo} seedKey={emp.staffId} size="h-11 w-11 text-[14px]" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-extrabold text-ink-900">
                    <span className="truncate">{emp.name}</span>
                    {issued ? <Chip tone="ok"><IconCheck size={10} /> TERBIT</Chip> : <Chip tone="warn">DRAFT</Chip>}
                  </p>
                  <p className="text-[11px] font-semibold text-ink-400">
                    {calc.presentDays} hadir · {calc.workMin ? `${Math.floor(calc.workMin / 60)}j kerja` : "—"} · lembur {calc.otMin}m · telat {calc.lateMin}m
                  </p>
                  <p className="font-mono text-[13px] font-extrabold text-ink-900">{idr(issued?.net ?? calc.net)}</p>
                </div>
                {issued ? (
                  <button
                    className="btn-danger !rounded-xl !px-3 !py-2 !text-[11px]"
                    onClick={() => { withdrawPayslip(issued.id); audit("PAYSLIP_WITHDRAW", emp.staffId, `Slip ${month} ditarik`); }}
                  >
                    Tarik
                  </button>
                ) : (
                  <button className="btn-sun !rounded-xl !px-3.5 !py-2 !text-[12px]" onClick={() => setIssueFor(emp.staffId)}>
                    <IconFile size={13} /> Terbitkan
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <Banner tone="info" title="Diterbitkan oleh Admin HR">
            Nominal dihitung otomatis dari absensimu. Slip tampil di sini begitu HR menerbitkannya.
          </Banner>
          {mySlips.length === 0 ? (
            <p className="card px-4 py-8 text-center text-[13px] font-semibold text-ink-400">
              Belum ada slip diterbitkan untuk akun ini.
            </p>
          ) : (
            <div className="space-y-2.5">
              {mySlips.map((s) => (
                <button key={s.id} onClick={() => setViewSlip(s)} className="card card-press flex w-full items-center gap-3 p-4 text-left">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sun-400 to-sun-600 text-white">
                    <IconWallet size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-extrabold text-ink-900">{monthLabel(s.month)}</p>
                    <p className="text-[11px] font-semibold text-ink-400">
                      Diterbitkan {s.issuedAt ? wibShortDate(new Date(s.issuedAt)) : "—"} oleh {s.issuedBy}
                    </p>
                  </div>
                  <span className="font-mono text-[15px] font-extrabold text-ink-900">{idr(s.net)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* issue modal */}
      <Modal open={!!issueFor} onClose={() => setIssueFor(null)} title="Terbitkan Slip">
        {issueFor && (() => {
          const d = drafts.find((x) => x.emp.staffId === issueFor)!;
          return (
            <div className="space-y-3.5">
              <div className="rounded-2xl bg-ink-50 p-3.5">
                <p className="text-[13px] font-extrabold text-ink-900">{d.emp.name} · {monthLabel(month)}</p>
                <div className="mt-2 space-y-1 font-mono text-[12px] font-bold text-ink-600">
                  <p className="flex justify-between"><span>Gaji pokok (prorata)</span><span>{idr(d.calc.basic)}</span></p>
                  <p className="flex justify-between"><span>Tunjangan transport + makan</span><span>{idr(d.calc.transport + d.calc.meal)}</span></p>
                  <p className="flex justify-between"><span>Lembur ({d.calc.otMin} mnt)</span><span>{idr(d.calc.overtime)}</span></p>
                  <p className="flex justify-between text-danger-600"><span>Potongan telat + absen</span><span>−{idr(d.calc.lateDeduct + d.calc.absentDeduct)}</span></p>
                </div>
              </div>
              <div>
                <label className="label">Bonus / penyesuaian (Rp)</label>
                <input type="number" step={1000} className="input !py-2.5 font-mono text-sm" value={bonus} onChange={(e) => setBonus(Math.max(0, Number(e.target.value)))} />
              </div>
              <div>
                <label className="label">Catatan (opsional)</label>
                <input className="input !py-2.5 text-sm" placeholder="cth. Bonus kinerja Q3" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-ink-900 px-4 py-3 text-white">
                <span className="text-[12px] font-bold text-white/60">Terima bersih</span>
                <span className="font-display text-[19px] font-extrabold">{idr(d.calc.net + bonus)}</span>
              </div>
              <button className="btn-sun w-full" onClick={() => doIssue(issueFor)}>
                <IconCheck size={16} /> Terbitkan & Notifikasi Karyawan
              </button>
            </div>
          );
        })()}
      </Modal>

      {/* view slip modal (printable) */}
      <Modal open={!!viewSlip} onClose={() => setViewSlip(null)} title="Slip Gaji" wide>
        {viewSlip && (
          <div className="slip-print space-y-3">
            <div className="flex items-center justify-between rounded-2xl bg-ink-900 px-4 py-3.5 text-white">
              <div className="flex min-w-0 items-center gap-2.5">
                {company.logo && <img src={company.logo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-white/20" />}
                <div className="min-w-0">
                  <p className="truncate font-display text-[16px] font-extrabold">{company.name}</p>
                  <p className="truncate text-[10.5px] font-semibold text-white/55">{company.address}</p>
                </div>
              </div>
              <span className="shrink-0 font-mono text-[10px] font-bold text-white/40">{viewSlip.month}</span>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-ink-100 p-3.5">
              <InitialsAvatar name={viewSlip.name} seedKey={viewSlip.staffId} size="h-11 w-11 text-[14px]" />
              <div className="flex-1">
                <p className="text-[14px] font-extrabold text-ink-900">{viewSlip.name}</p>
                <p className="text-[11px] font-semibold text-ink-400">{viewSlip.staffId} · {deptOf(viewSlip.staffId)}</p>
              </div>
              <Chip tone="ok"><IconCheck size={10} /> DITERBITKAN</Chip>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                ["Hadir", `${viewSlip.presentDays}`],
                ["Cuti", `${viewSlip.approvedLeaveDays}`],
                ["Jam kerja", `${Math.floor(viewSlip.workMin / 60)}j ${viewSlip.workMin % 60}m`],
                ["Lembur", `${viewSlip.otMin}m`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-ink-50 px-1 py-2">
                  <p className="text-[9px] font-extrabold tracking-wide text-ink-400 uppercase">{k}</p>
                  <p className="font-mono text-[13px] font-extrabold text-ink-900">{v}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-ink-100">
              <p className="border-b border-ink-100 bg-ok-100/60 px-3.5 py-2 text-[10.5px] font-extrabold tracking-wide text-ok-600 uppercase">Penerimaan</p>
              <div className="divide-y divide-ink-100/70 px-3.5">
                {[
                  ["Gaji pokok", viewSlip.basic],
                  ["Tunjangan transport", viewSlip.transport],
                  ["Tunjangan makan", viewSlip.meal],
                  ["Lembur", viewSlip.overtime],
                  ["Bonus / penyesuaian", viewSlip.bonus],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex items-center justify-between py-2">
                    <span className="text-[12.5px] font-bold text-ink-600">{k}</span>
                    <span className="font-mono text-[12.5px] font-extrabold text-ink-900">{idr(Number(v))}</span>
                  </div>
                ))}
              </div>
              <p className="border-t border-ink-100 bg-danger-100/50 px-3.5 py-2 text-[10.5px] font-extrabold tracking-wide text-danger-600 uppercase">Potongan</p>
              <div className="space-y-1 px-3.5 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-bold text-ink-600">Keterlambatan ({viewSlip.lateMin} mnt)</span>
                  <span className="font-mono text-[12.5px] font-extrabold text-danger-600">−{idr(viewSlip.lateDeduct)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-bold text-ink-600">Absen ({viewSlip.absentDays} hari)</span>
                  <span className="font-mono text-[12.5px] font-extrabold text-danger-600">−{idr(viewSlip.absentDeduct)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-ink-900 px-4 py-3.5 text-white">
              <div>
                <p className="text-[10px] font-extrabold tracking-wide text-white/50 uppercase">Bruto {idr(viewSlip.gross)}</p>
                <p className="text-[10px] font-extrabold tracking-wide text-white/50 uppercase">Terima bersih</p>
              </div>
              <span className="font-display text-[24px] font-extrabold text-sun-300">{idr(viewSlip.net)}</span>
            </div>

            {viewSlip.note && (
              <p className="rounded-xl bg-sun-100/70 px-3.5 py-2.5 text-[11.5px] font-bold text-sun-700">Catatan: {viewSlip.note}</p>
            )}
            <p className="text-[10px] font-bold text-ink-300">
              Diterbitkan {viewSlip.issuedAt ? `${wibShortDate(new Date(viewSlip.issuedAt))} ${wibTime(new Date(viewSlip.issuedAt))}` : "—"} WIB oleh {viewSlip.issuedBy}.
              Dokumen internal — bukan slip gaji resmi perpajakan.
            </p>

            <button onClick={() => window.print()} className="btn-sun w-full print:hidden">
              <IconDownload size={16} /> Cetak / Simpan PDF
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
