/**
 * Pengguna (Admin) — directory with search/filter, account wizard with
 * credential handoff, edit modal (full CRUD incl. salary & status),
 * password reset, device unbind (Super Admin), delete.
 *
 * IMPORTANT: new accounts are NOT pre-bound to any device — the binding
 * happens at the account's FIRST login (see store.login). Pre-binding here
 * would lock new staff out of their own phones.
 */
import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import {
  EMAIL_DOMAIN, EMAIL_RE, Employee, EmpStatus, genPassword, nextStaffId,
  ROLE_LABEL, Role, SalaryStructure, Shift, seedShifts, STATUS_LABEL,
} from "../lib/database";

import { idr, relTime, todayKey, wibDayKey } from "../lib/format";
import { useToast } from "../components/Toast";
import { Banner, Chip, ConfirmButton, EmptyState, InitialsAvatar, Modal } from "../components/bits";
import {
  IconCheck, IconEdit, IconFace, IconLock, IconMail, IconPlus, IconRefresh, IconShield, IconSmartphone, IconTrash, IconUsers, IconX,
} from "../components/icons";

const ROLE_OPTIONS: Role[] = ["employee", "manager", "companyadmin", "superadmin"];
const STATUS_OPTIONS: EmpStatus[] = ["active", "inactive", "resigned"];
type ShiftId = string;

export default function EmployeesView() {
  const { session, employees, logs, shifts, sites, activeSite, engine, departments, salaryDefaults, addEmployee, updateEmployee, removeEmployee, unbindDevice, audit } = useApp();
  const toast = useToast();
  const isSuper = session?.role === "superadmin";

  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("Semua");
  const filtered = useMemo(
    () =>
      employees.filter(
        (e) =>
          (dept === "Semua" || e.department === dept) &&
          (e.name.toLowerCase().includes(search.toLowerCase()) ||
            e.staffId.toLowerCase().includes(search.toLowerCase()) ||
            e.email.toLowerCase().includes(search.toLowerCase())),
      ),
    [employees, search, dept],
  );

  const today = todayKey();
  const presentToday = (staffId: string) =>
    logs.some((l) => l.staffId === staffId && l.type === "IN" && l.status === "VERIFIED" && wibDayKey(new Date(l.ts)) === today);

  /* ------------------------------ cred modal ------------------------------ */
  const [credModal, setCredModal] = useState<{ name: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const copyCred = async () => {
    if (!credModal) return;
    const txt = `Login ${credModal.name}\nEmail: ${credModal.email}\nKata sandi: ${credModal.password}`;
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  /* ------------------------------- wizard -------------------------------- */
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [staffId, setStaffId] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState(genPassword());
  const [department, setDepartment] = useState(departments[0] ?? "Gudang");
  const [role, setRole] = useState<Role>("employee");
  const [shift, setShift] = useState<ShiftId>("sh-pagi");
  const [fSite, setFSite] = useState<string | null>(activeSite?.id ?? null);
  const [err, setErr] = useState("");
  const startWizard = () => {
    setOpen(true); setStep(1);
    setName(""); setStaffId(nextStaffId(employees));
    setEmail(""); setEmailTouched(false); setPassword(genPassword());
    setDepartment(departments[0] ?? "Gudang"); setRole("employee"); setShift("sh-pagi");
    setFSite(activeSite?.id ?? null);
    setErr("");
  };

  const suggestedEmail = emailTouched ? email : name.trim() ? `${name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, "").split(/\s+/).slice(0, 2).join(".")}@${EMAIL_DOMAIN}` : "";

  const submitData = () => {
    if (name.trim().length < 3) return setErr("Nama minimal 3 karakter.");
    if (!/^[\w-]{3,}$/.test(staffId.trim())) return setErr("Staff ID minimal 3 karakter (huruf/angka).");
    if (employees.some((e) => e.staffId.toLowerCase() === staffId.trim().toLowerCase())) return setErr(`Staff ID "${staffId.trim()}" sudah terdaftar.`);
    if (!EMAIL_RE.test(suggestedEmail)) return setErr("Email tidak valid.");
    if (employees.some((e) => e.email.toLowerCase() === suggestedEmail.toLowerCase())) return setErr("Email sudah terdaftar.");
    setErr("");
    saveEmployee();
  };

  const saveEmployee = () => {
    const emp: Employee = {
      staffId: staffId.trim(),
      nik: `3171${String(Math.floor(100000000 + Math.random() * 899999999))}`,
      name: name.trim(),
      email: suggestedEmail.toLowerCase(),
      password,
      phone: "+62 812-0000-0000",
      address: "—",
      emergencyName: "—",
      emergencyPhone: "—",
      department,
      position: role === "employee" ? "Staff" : ROLE_LABEL[role],
      role,
      shiftId: shift,
      siteId: role === "superadmin" || role === "companyadmin" ? null : fSite,
      status: "active",
      salary: {
        basic: role === "employee" ? 5_200_000 : role === "manager" ? 8_000_000 : 9_500_000,
        transport: 20_000, meal: 15_000, otPerHour: role === "employee" ? 30_000 : 45_000,
      },
      // base photo dikosongkan — karyawan mengambilnya sendiri saat login pertama
      photo: null, descriptor: null, hash: null,
      createdAt: Date.now(),
      deviceId: null, deviceBoundAt: null, // bound at first login — never here
    };
    addEmployee(emp);
    audit("USER_CREATE", emp.staffId, `Akun ${emp.name} (${department} · ${ROLE_LABEL[role]}) dibuat`);
    setCredModal({ name: emp.name, email: emp.email, password });
    toast.push("ok", "Akun berhasil dibuat", `Kredensial ${emp.name} siap diserahkan.`);
    setOpen(false);
    startWizard();
  };

  /* ------------------------------ edit modal ------------------------------ */
  const [edit, setEdit] = useState<Employee | null>(null);
  const [eForm, setEForm] = useState<Partial<Omit<Employee, "salary">> & { salary?: Partial<SalaryStructure> }>({});
  const openEdit = (e: Employee) => {
    setEdit(e);
    setEForm({
      name: e.name, nik: e.nik, phone: e.phone, address: e.address,
      emergencyName: e.emergencyName, emergencyPhone: e.emergencyPhone,
      department: e.department, position: e.position, shiftId: e.shiftId,
      status: e.status, role: e.role, siteId: e.siteId,
      salary: { ...e.salary },
    });
  };
  const saveEdit = () => {
    if (!edit) return;
    const { salary, ...rest } = eForm;
    const mergedSalary: SalaryStructure = {
      basic: salary?.basic ?? edit.salary.basic,
      transport: salary?.transport ?? edit.salary.transport,
      meal: salary?.meal ?? edit.salary.meal,
      otPerHour: salary?.otPerHour ?? edit.salary.otPerHour,
    };
    updateEmployee(edit.staffId, { ...rest, salary: mergedSalary } as Partial<Employee>);
    audit("USER_UPDATE", edit.staffId, `Profil ${edit.name} diperbarui`);
    toast.push("ok", "Profil disimpan", `${edit.name} diperbarui.`);
    setEdit(null);
  };

  const shiftList: Shift[] = shifts.length ? shifts : seedShifts();

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">Pengguna</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-400">{employees.length} akun terdaftar</p>
        </div>
        <button className="btn-sun !rounded-xl !px-4 !py-2.5 text-sm" onClick={startWizard}>
          <IconPlus size={16} /> Akun
        </button>
      </div>

      {/* wizard */}
      {open && (
        <section className="card anim-fade-up overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-sun-400 to-sun-600 text-white shadow-[0_4px_12px_rgba(240,115,0,0.35)]">
                <IconPlus size={16} />
              </span>
              <div>
                <p className="font-display text-[15px] leading-tight font-extrabold text-ink-900">Buat Akun Karyawan</p>
                <p className="text-[10.5px] font-bold text-ink-400">Data diri & kredensial — foto menyusul saat login pertama</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="cursor-pointer rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Tutup">
              <IconX size={15} />
            </button>
          </div>

          <div className="p-4">
            {step === 1 && (
              <div className="anim-fade-up space-y-3.5">
                <div>
                  <label className="label">Nama Lengkap</label>
                  <input className="input" placeholder="cth. Siti Rahma" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Staff ID</label>
                    <input className="input font-mono" value={staffId} onChange={(e) => setStaffId(e.target.value.toUpperCase())} />
                  </div>
                  <div>
                    <label className="label">Peran</label>
                    <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                      {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Email Login</label>
                  <div className="field-wrap">
                    <IconMail size={16} className="field-ico" />
                    <input
                      type="email" className="input !py-3 font-mono !text-[13.5px]"
                      placeholder={`nama@${EMAIL_DOMAIN}`} value={suggestedEmail}
                      onChange={(e) => { setEmail(e.target.value); setEmailTouched(true); }}
                    />
                  </div>
                  <p className="mt-1 text-[10.5px] font-semibold text-ink-300">Otomatis disarankan dari nama — bisa diubah.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Departemen</label>
                    <select className="input" value={department} onChange={(e) => setDepartment(e.target.value)}>
                      {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Shift</label>
                    <select className="input" value={shift} onChange={(e) => setShift(e.target.value as ShiftId)}>
                      {shiftList.map((s) => <option key={s.id} value={s.id}>{s.name}{s.id !== "sh-fleks" ? ` (${s.start})` : ""}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Gudang / Area</label>
                  <select className="input !py-3 text-sm" value={fSite ?? ""} onChange={(e) => setFSite(e.target.value || null)}>
                    <option value="">Semua Area (Kantor Pusat)</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Kata Sandi Awal</label>
                  <div className="flex items-center gap-2">
                    <input className="input !py-3 font-mono !text-[13.5px]" value={password} readOnly />
                    <button
                      className="grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-xl border border-ink-100 bg-white text-ink-500 transition active:scale-90"
                      onClick={() => setPassword(genPassword())} aria-label="Acak ulang kata sandi" title="Acak ulang"
                    >
                      <IconRefresh size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 rounded-xl bg-sky-100/70 px-3 py-2.5">
                  <IconFace size={16} className="mt-0.5 shrink-0 text-sky-600" />
                  <p className="text-[11.5px] leading-relaxed font-semibold text-sky-600">
                    <b>Foto tanda tangan tidak diminta di sini.</b> Karyawan akan mengambilnya sendiri saat login pertama —
                    begitu wajah tersimpan, absensi wajah langsung aktif.
                  </p>
                </div>
                <p className="rounded-xl bg-grape-100/70 px-3 py-2 text-[11.5px] leading-relaxed font-semibold text-grape-600">
                  Kredensial ditampilkan sekali setelah akun dibuat. Perangkat karyawan akan diikat otomatis saat login pertamanya.
                </p>
                {err && <Banner tone="warn">{err}</Banner>}
                <button className="btn-sun w-full" onClick={submitData}><IconCheck size={17} /> Buat Akun</button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* filters */}
      <div className="space-y-2.5">
        <input className="input !py-2.5 text-sm" placeholder="Cari nama, staff ID, atau email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {["Semua", ...departments].map((d) => (
            <button key={d} onClick={() => setDept(d)} className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-[12px] font-extrabold transition ${
              dept === d ? "bg-ink-900 text-white shadow" : "border border-ink-100 bg-white text-ink-500 hover:border-ink-200"
            }`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* directory */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={26} />}
          title="Tidak ada pengguna ditemukan"
          desc={employees.length === 0 ? "Buat akun pertama beserta foto tanda tangan wajahnya." : "Coba ubah kata kunci atau filter departemen."}
          action={employees.length === 0 ? <button className="btn-sun !px-4 !py-2.5 text-sm" onClick={startWizard}><IconPlus size={15} /> Buat Akun</button> : undefined}
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((e, i) => (
            <div key={e.staffId} className={`tile-pop card card-press flex items-center gap-3 p-3.5 ${e.status !== "active" ? "opacity-60" : ""}`} style={{ animationDelay: `${i * 40}ms` }}>
              <div className="relative">
                <InitialsAvatar name={e.name} photo={e.photo} seedKey={e.staffId} size="h-12 w-12 text-[16px]" />
                <span
                  className={`absolute -right-1 -bottom-1 h-3.5 w-3.5 rounded-full border-2 border-white ${presentToday(e.staffId) ? "bg-ok-500" : "bg-ink-200"}`}
                  title={presentToday(e.staffId) ? "Hadir hari ini" : "Belum hadir"}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[14.5px] font-extrabold text-ink-900">
                  <span className="truncate">{e.name}</span>
                  <Chip tone={e.role === "superadmin" ? "grape" : e.role === "companyadmin" ? "sun" : e.role === "manager" ? "sky" : "ink"} className="!px-1.5 !py-0.5 !text-[9px]">
                    {ROLE_LABEL[e.role].toUpperCase()}
                  </Chip>
                  {e.status !== "active" && <Chip tone="danger" className="!px-1.5 !py-0.5 !text-[9px]">{STATUS_LABEL[e.status].toUpperCase()}</Chip>}
                  {e.deviceId && <Chip tone="teal" className="!px-1.5 !py-0.5 !text-[9px]"><IconSmartphone size={9} /> TERIKAT</Chip>}
                </p>
                <p className="font-mono text-[11px] font-semibold text-ink-400">{e.staffId} · {e.department} · {relTime(e.createdAt)}</p>
                <p className="truncate font-mono text-[10.5px] font-semibold text-ink-300">{e.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {isSuper && e.deviceId && (
                  <button
                    className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl bg-teal-100/70 text-teal-600 transition hover:bg-teal-100 active:scale-90"
                    onClick={() => { unbindDevice(e.staffId); toast.push("info", "Ikatan perangkat dilepas", `${e.name} dapat login dari perangkat baru.`); }}
                    aria-label={`Lepas perangkat ${e.name}`} title="Lepas ikatan perangkat"
                  >
                    <IconSmartphone size={15} />
                  </button>
                )}
                <button
                  className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl bg-ink-50 text-ink-400 transition hover:bg-grape-100 hover:text-grape-600 active:scale-90"
                  onClick={() => {
                    const p = genPassword();
                    updateEmployee(e.staffId, { password: p });
                    audit("PASSWORD_RESET", e.staffId, `Kata sandi ${e.name} di-reset admin`);
                    setCredModal({ name: e.name, email: e.email, password: p });
                    toast.push("ok", "Kata sandi direset", `Sandi baru ${e.name} siap diserahkan.`);
                  }}
                  aria-label={`Reset kata sandi ${e.name}`} title="Reset kata sandi"
                >
                  <IconLock size={15} />
                </button>
                <button
                  className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl bg-ink-50 text-ink-400 transition hover:bg-sky-100 hover:text-sky-600 active:scale-90"
                  onClick={() => openEdit(e)} aria-label={`Edit ${e.name}`} title="Edit profil"
                >
                  <IconEdit size={15} />
                </button>
                <ConfirmButton
                  label="" icon={<IconTrash size={15} />} confirmLabel="Hapus?"
                  className="btn-ghost !rounded-xl !border-0 !bg-ink-50 !p-2.5 !text-ink-400 hover:!bg-danger-100 hover:!text-danger-600"
                  onConfirm={() => { removeEmployee(e.staffId); audit("USER_DELETE", e.staffId, `Akun ${e.name} dihapus`); toast.push("info", "Akun dihapus", e.name); }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* credential handoff modal */}
      <Modal open={!!credModal} onClose={() => setCredModal(null)} title="Kredensial Login">
        {credModal && (
          <div className="space-y-3">
            <Banner tone="warn" title="Tampilkan sekali!">
              Serahkan kredensial ini langsung ke {credModal.name}. Kata sandi tidak ditampilkan lagi.
            </Banner>
            <div className="space-y-2 rounded-2xl bg-ink-900 p-4 font-mono text-[13px] text-white">
              <p className="flex justify-between gap-3"><span className="text-white/50">Email</span><span className="font-bold break-all">{credModal.email}</span></p>
              <p className="flex justify-between gap-3"><span className="text-white/50">Sandi</span><span className="font-bold tracking-wider">{credModal.password}</span></p>
            </div>
            <button className="btn-sun w-full" onClick={() => void copyCred()}>
              {copied ? <><IconCheck size={16} /> Tersalin!</> : "Salin Kredensial"}
            </button>
          </div>
        )}
      </Modal>

      {/* edit modal */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Edit — ${edit?.name ?? ""}`} wide>
        {edit && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Nama</label>
                <input className="input !py-2.5 text-sm" value={eForm.name ?? ""} onChange={(e) => setEForm({ ...eForm, name: e.target.value })} />
              </div>
              <div>
                <label className="label">NIK</label>
                <input className="input !py-2.5 font-mono text-sm" value={eForm.nik ?? ""} onChange={(e) => setEForm({ ...eForm, nik: e.target.value })} />
              </div>
              <div>
                <label className="label">Telepon</label>
                <input className="input !py-2.5 font-mono text-sm" value={eForm.phone ?? ""} onChange={(e) => setEForm({ ...eForm, phone: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="label">Alamat</label>
                <input className="input !py-2.5 text-sm" value={eForm.address ?? ""} onChange={(e) => setEForm({ ...eForm, address: e.target.value })} />
              </div>
              <div>
                <label className="label">Kontak darurat</label>
                <input className="input !py-2.5 text-sm" value={eForm.emergencyName ?? ""} onChange={(e) => setEForm({ ...eForm, emergencyName: e.target.value })} />
              </div>
              <div>
                <label className="label">Telp. darurat</label>
                <input className="input !py-2.5 font-mono text-sm" value={eForm.emergencyPhone ?? ""} onChange={(e) => setEForm({ ...eForm, emergencyPhone: e.target.value })} />
              </div>
              <div>
                <label className="label">Departemen</label>
                <select className="input !py-2.5 text-sm" value={eForm.department} onChange={(e) => setEForm({ ...eForm, department: e.target.value })}>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Jabatan</label>
                <input className="input !py-2.5 text-sm" value={eForm.position ?? ""} onChange={(e) => setEForm({ ...eForm, position: e.target.value })} />
              </div>
              <div>
                <label className="label">Shift</label>
                <select className="input !py-2.5 text-sm" value={eForm.shiftId} onChange={(e) => setEForm({ ...eForm, shiftId: e.target.value })}>
                  {shiftList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Gudang / Area</label>
                <select className="input !py-2.5 text-sm" value={eForm.siteId ?? ""} onChange={(e) => setEForm({ ...eForm, siteId: e.target.value || null })}>
                  <option value="">Semua Area (Pusat)</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.shortName}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input !py-2.5 text-sm" value={eForm.status} onChange={(e) => setEForm({ ...eForm, status: e.target.value as EmpStatus })}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
              {isSuper && (
                <div>
                  <label className="label">Peran</label>
                  <select className="input !py-2.5 text-sm" value={eForm.role} onChange={(e) => setEForm({ ...eForm, role: e.target.value as Role })}>
                    {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* salary structure */}
            <div className="rounded-2xl border border-ink-100 bg-ink-50 p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide text-ink-500 uppercase">
                <IconShield size={13} /> Struktur Gaji (untuk slip otomatis)
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {([
                  ["basic", "Gaji pokok / bulan"],
                  ["transport", "Transport / hari hadir"],
                  ["meal", "Makan / hari hadir"],
                  ["otPerHour", "Upah lembur / jam"],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <label className="label">{label}</label>
                    <input
                      type="number" step={1000} className="input !py-2 font-mono text-[13px]"
                      value={eForm.salary?.[key] ?? 0}
                      onChange={(e) => setEForm({ ...eForm, salary: { ...eForm.salary, [key]: Math.max(0, Number(e.target.value)) } as Partial<SalaryStructure> })}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10.5px] font-bold text-ink-400">Pratinjau pokok: {idr(eForm.salary?.basic ?? 0)} / bulan</p>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-ink-100 px-3.5 py-2.5">
              <p className="text-[12px] font-extrabold text-ink-700">Foto tanda tangan tersimpan?</p>
              <Chip tone={edit.descriptor || edit.hash ? "ok" : "warn"}>
                <IconFace size={11} /> {edit.descriptor ? "128-D" : edit.hash ? "dHash" : "BELUM"}
              </Chip>
            </div>

            <button className="btn-sun w-full" onClick={saveEdit}><IconCheck size={16} /> Simpan Perubahan</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
