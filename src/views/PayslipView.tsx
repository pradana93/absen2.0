/** Gaji — auto-computed slips from attendance; HR issues, staff views/prints. */
import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { computeSlip, monthLabel, Payslip } from "../lib/database";
import { idr, todayKey, wibShortDate } from "../lib/format";
import { useToast } from "../components/Toast";
import { Banner, Chip, SectionLabel } from "../components/bits";
import { IconCheck, IconDownload, IconWallet, IconX } from "../components/icons";

export default function PayslipView() {
  const { session, employees, logs, breaks, leaves, shifts, company, payslips, issuePayslip, withdrawPayslip, audit } = useApp();
  const toast = useToast();
  const me = session!;
  const isHR = me.role === "companyadmin" || me.role === "superadmin";

  const [month, setMonth] = useState(() => {
    const t = todayKey();
    return t.slice(0, 7);
  });
  const [selStaff, setSelStaff] = useState<string | null>(null);

  const months = useMemo(() => {
    const out: string[] = [];
    const [y, m] = month.split("-").map(Number);
    for (let i = 0; i < 6; i++) {
      const d = new Date(y, m - 1 - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, [month]);

  const staffList = useMemo(() => employees.filter((e) => e.status === "active" && (e.role === "employee" || e.role === "manager" || isHR)), [employees, isHR]);
  const targets = isHR ? staffList : staffList.filter((e) => e.staffId === me.staffId);
  const active = selStaff && isHR ? selStaff : me.staffId;

  const drafts = useMemo(
    () => targets.map((e) => computeSlip(e, month, logs, breaks, leaves, shifts, company.holidays)),
    [targets, month, logs, breaks, leaves, shifts, company.holidays],
  );
  const issuedFor = (staffId: string) => payslips.find((p) => p.staffId === staffId && p.month === month);

  const myIssued = useMemo(
    () => payslips.filter((p) => p.staffId === me.staffId).sort((a, b) => b.month.localeCompare(a.month)),
    [payslips, me.staffId],
  );

  const slipRows = (s: Payslip) => [
    ["Gaji pokok (prorata)", s.basicProrated, "+"],
    ["Tunjangan hadir", s.allowances, "+"],
    ["Lembur", s.overtimePay, "+"],
    ["Bonus", s.bonus, "+"],
    ["Potongan (telat/absen)", -s.deductions, "−"],
  ] as const;

  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">{isHR ? "Penggajian" : "Gaji"}</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-400">{monthLabel(month)}</p>
        </div>
        <select className="input !w-auto !py-2.5 text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      {isHR && (
        <select className="input !py-2.5 text-sm" value={active} onChange={(e) => setSelStaff(e.target.value)}>
          {targets.map((e) => <option key={e.staffId} value={e.staffId}>{e.name} · {e.staffId}</option>)}
        </select>
      )}

      {/* summary grid (HR) */}
      {isHR && (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50 px-4 py-2.5">
            <p className="text-[11px] font-extrabold tracking-[0.12em] text-ink-400 uppercase">Semua Staff · {monthLabel(month)}</p>
            <Chip tone="ink">{drafts.length} slip</Chip>
          </div>
          <div className="divide-y divide-ink-100/70">
            {drafts.map((d) => {
              const issued = issuedFor(d.staffId);
              return (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-extrabold text-ink-900">{d.name}</p>
                    <p className="text-[10.5px] font-semibold text-ink-400">{d.hadir} hari hadir · {d.lateMin} mnt telat · {d.overtimeMin} mnt lembur</p>
                  </div>
                  <p className="font-mono text-[14px] font-extrabold text-ink-900 tabular-nums">{idr(d.net)}</p>
                  {issued ? (
                    <div className="flex items-center gap-1.5">
                      <Chip tone="ok"><IconCheck size={10} /> TERBIT</Chip>
                      <button className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-danger-100 text-danger-600 transition hover:bg-danger-500 hover:text-white active:scale-90"
                        onClick={() => { withdrawPayslip(issued.id); audit("PAYSLIP_WITHDRAW", issued.staffId, `Slip ${issued.month} ditarik`); toast.push("info", "Slip ditarik"); }}
                        title="Tarik slip" aria-label="Tarik slip"><IconX size={14} /></button>
                    </div>
                  ) : (
                    <button className="btn-sun !rounded-xl !px-3.5 !py-2 !text-[12px]"
                      onClick={() => { issuePayslip(d, me.name); toast.push("ok", "Slip diterbitkan", `${d.name} · ${idr(d.net)}`); }}>
                      Terbitkan
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* my slips */}
      <section>
        <SectionLabel right={<Chip tone="ink">{myIssued.length} slip</Chip>}>Slip Saya</SectionLabel>
        {myIssued.length === 0 ? (
          <div className="card space-y-2 px-4 py-6 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ink-50 text-ink-300"><IconWallet size={22} /></span>
            <p className="text-[13px] font-bold text-ink-500">Belum ada slip diterbitkan untuk Anda.</p>
            <p className="text-[11.5px] font-semibold text-ink-300">Admin HR menerbitkan slip setiap bulan — Anda akan dinotifikasi.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myIssued.map((s) => (
              <div key={s.id} className="slip-print card overflow-hidden">
                <div className="flex items-center justify-between bg-ink-900 px-4 py-3 text-white">
                  <div>
                    <p className="font-display text-[15px] font-extrabold">{company.name}</p>
                    <p className="text-[10px] font-bold text-white/55">Slip Gaji · {monthLabel(s.month)}</p>
                  </div>
                  <Chip tone="ok"><IconCheck size={10} /> DITERBITKAN</Chip>
                </div>
                <div className="space-y-1.5 px-4 py-3">
                  <p className="text-[13px] font-extrabold text-ink-900">{s.name}</p>
                  {slipRows(s).map(([label, val, sign]) => (
                    <div key={label} className="flex items-center justify-between text-[12.5px]">
                      <span className="font-semibold text-ink-500">{label}</span>
                      <span className={`font-mono font-bold tabular-nums ${sign === "−" && val !== 0 ? "text-danger-600" : "text-ink-800"}`}>
                        {sign === "−" && val !== 0 ? "−" : ""}{idr(Math.abs(val))}
                      </span>
                    </div>
                  ))}
                  <div className="mt-2 flex items-center justify-between border-t border-dashed border-ink-200 pt-2.5">
                    <span className="font-display text-[14px] font-extrabold text-ink-900">Terima Bersih</span>
                    <span className="font-mono text-[17px] font-extrabold text-ok-600 tabular-nums">{idr(s.net)}</span>
                  </div>
                  <p className="pt-1 text-[10px] font-bold text-ink-300">
                    Diterbitkan {s.issuedAt ? wibShortDate(new Date(s.issuedAt)) : "—"} oleh {s.issuedBy ?? "Admin HR"} · {s.hadir} hari hadir{s.note ? ` · ${s.note}` : ""}
                  </p>
                </div>
                <div className="border-t border-ink-100 bg-ink-50/60 px-4 py-2.5 print:hidden">
                  <button className="btn-soft w-full !py-2 !text-[12px]" onClick={() => window.print()}><IconDownload size={13} /> Cetak / Simpan PDF</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {!isHR && (
        <Banner tone="info" title="Dihitung otomatis dari absensi">
          Komponen slip berasal dari check-in/out, lembur, dan keterlambatan Anda. Hanya Admin HR yang dapat menerbitkan slip resmi.
        </Banner>
      )}
    </div>
  );
}
