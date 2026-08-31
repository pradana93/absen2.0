/** Profil — identity card, base-photo (re)enrollment, password, device, logout. */
import { useState } from "react";
import { useApp } from "../lib/store";
import { ROLE_LABEL, shrinkPhoto } from "../lib/database";
import { extractSignature } from "../lib/faceEngine";
import { idr, relTime, wibShortDate } from "../lib/format";
import { shortDevice } from "../lib/device";
import CameraCapture from "../components/CameraCapture";
import { useToast } from "../components/Toast";
import { Banner, Chip, InitialsAvatar, Modal, SectionLabel } from "../components/bits";
import { IconCamera, IconCheck, IconCpu, IconEdit, IconFace, IconLock, IconLogoutIn, IconShield, IconSmartphone, IconStar } from "../components/icons";

export default function ProfileView() {
  const { session, company, engine, updateEmployee, logout, audit } = useApp();
  const toast = useToast();
  const me = session!;

  const [editOpen, setEditOpen] = useState(false);
  const [fName, setFName] = useState(me.name);
  const [fPhone, setFPhone] = useState(me.phone);
  const [fAddress, setFAddress] = useState(me.address);
  const [fEmergName, setFEmergName] = useState(me.emergencyName);
  const [fEmergPhone, setFEmergPhone] = useState(me.emergencyPhone);

  const [photoOpen, setPhotoOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [pwOld, setPwOld] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwErr, setPwErr] = useState("");

  const saveProfile = () => {
    if (fName.trim().length < 3) return toast.push("warn", "Nama terlalu pendek");
    updateEmployee(me.staffId, { name: fName.trim(), phone: fPhone, address: fAddress, emergencyName: fEmergName, emergencyPhone: fEmergPhone });
    audit("PROFILE_UPDATE", me.staffId, "Profil diperbarui sendiri");
    toast.push("ok", "Profil disimpan");
    setEditOpen(false);
  };

  const onPhoto = async (canvas: HTMLCanvasElement, dataUrl: string) => {
    setSaving(true);
    const sig = await extractSignature(canvas);
    const small = await shrinkPhoto(dataUrl, 360);
    updateEmployee(me.staffId, { photo: small, descriptor: sig.descriptor ?? me.descriptor, hash: sig.hash ?? me.hash });
    audit("FACE_ENROLL", me.staffId, sig.descriptor ? "Baseline 128-D diperbarui" : "Baseline dHash diperbarui");
    toast.push("ok", "Foto tanda tangan tersimpan", "Absensi wajah Anda aktif.");
    setSaving(false);
    setPhotoOpen(false);
  };

  const savePw = () => {
    if (pwOld !== me.password) return setPwErr("Kata sandi lama salah.");
    if (pwNew.length < 6) return setPwErr("Kata sandi baru minimal 6 karakter.");
    if (pwNew !== pwConfirm) return setPwErr("Konfirmasi kata sandi tidak sama.");
    updateEmployee(me.staffId, { password: pwNew });
    audit("PASSWORD_CHANGE", me.staffId, "Kata sandi diganti sendiri");
    toast.push("ok", "Kata sandi diganti");
    setPwOpen(false); setPwOld(""); setPwNew(""); setPwConfirm(""); setPwErr("");
  };

  return (
    <div className="space-y-5 pb-2">
      {/* identity card */}
      <section className="card relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -top-14 -right-14 h-44 w-44 rounded-full bg-sun-100 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <InitialsAvatar name={me.name} photo={me.photo} seedKey={me.staffId} size="h-20 w-20 text-[26px]" rounded="rounded-3xl" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 font-display text-[20px] leading-tight font-extrabold text-ink-900">
              <span className="truncate">{me.name}</span>
              <Chip tone={me.role === "superadmin" ? "grape" : me.role === "companyadmin" ? "sun" : me.role === "manager" ? "sky" : "ink"} className="!px-1.5 !py-0.5 !text-[9px]">{ROLE_LABEL[me.role].toUpperCase()}</Chip>
            </p>
            <p className="font-mono text-[11.5px] font-semibold text-ink-400">{me.staffId} · NIK {me.nik}</p>
            <p className="text-[11.5px] font-semibold text-ink-400">{me.position} · {me.department}</p>
            <p className="truncate font-mono text-[10.5px] font-semibold text-ink-300">{me.email}</p>
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-ink-50 px-3 py-2 text-center">
            <p className="font-display text-[13px] font-extrabold text-ink-900">{me.phone.split(" ").pop()}</p>
            <p className="text-[8.5px] font-extrabold tracking-wide text-ink-400 uppercase">Telepon</p>
          </div>
          <div className="rounded-xl bg-ink-50 px-3 py-2 text-center">
            <p className="font-display text-[13px] font-extrabold text-ink-900">{wibShortDate(new Date(me.createdAt))}</p>
            <p className="text-[8.5px] font-extrabold tracking-wide text-ink-400 uppercase">Bergabung</p>
          </div>
          <div className="rounded-xl bg-ink-50 px-3 py-2 text-center">
            <p className="font-display text-[13px] font-extrabold text-ink-900">{idr(me.salary.basic).replace("Rp", "").trim()}</p>
            <p className="text-[8.5px] font-extrabold tracking-wide text-ink-400 uppercase">Pokok</p>
          </div>
        </div>
        <button className="btn-soft relative mt-3 w-full !py-2.5 !text-[13px]" onClick={() => { setFName(me.name); setFPhone(me.phone); setFAddress(me.address); setFEmergName(me.emergencyName); setFEmergPhone(me.emergencyPhone); setEditOpen(true); }}>
          <IconEdit size={14} /> Edit Profil
        </button>
      </section>

      {/* face baseline */}
      <section className="card p-4">
        <SectionLabel right={<Chip tone={engine === "ai" ? "teal" : "warn"}><IconCpu size={11} /> {engine === "ai" ? "AI 128-D" : "LITE"}</Chip>}>Foto Tanda Tangan</SectionLabel>
        <div className="flex items-center gap-3.5">
          {me.photo ? <img src={me.photo} alt={me.name} className="h-16 w-16 rounded-2xl object-cover ring-2 ring-sun-300" />
            : <span className="grid h-16 w-16 place-items-center rounded-2xl bg-warn-100 text-warn-600"><IconFace size={26} /></span>}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold text-ink-900">{me.descriptor ? "Encoding 128-D tersimpan" : me.hash ? "Tanda tangan dHash tersimpan" : "Belum ada baseline"}</p>
            <p className="text-[11px] leading-snug font-semibold text-ink-400">Ambil ulang bila penampilan berubah signifikan.</p>
          </div>
          <button className="btn-sun !rounded-xl !px-3.5 !py-2.5 !text-[12.5px]" onClick={() => setPhotoOpen(true)}>
            <IconCamera size={14} /> {me.photo ? "Perbarui" : "Ambil"}
          </button>
        </div>
      </section>

      {/* device */}
      <section className="card flex items-center gap-3.5 p-4">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${me.deviceId ? "bg-teal-100 text-teal-600" : "bg-ink-100 text-ink-400"}`}><IconSmartphone size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-extrabold text-ink-900">Perangkat Terikat</p>
          <p className="truncate font-mono text-[11px] font-semibold text-ink-400">
            {me.deviceId ? `${shortDevice(me.deviceId)} · diikat ${me.deviceBoundAt ? relTime(me.deviceBoundAt) : ""}` : "Belum terikat"}
          </p>
        </div>
        {me.deviceId ? <Chip tone="ok">AMAN</Chip> : <Chip tone="warn">LEMAH</Chip>}
      </section>

      {/* security */}
      <section className="card p-4">
        <SectionLabel right={<IconShield size={16} className="text-ink-300" />}>Keamanan</SectionLabel>
        <button className="btn-ghost w-full !py-3 !text-[13px]" onClick={() => { setPwErr(""); setPwOpen(true); }}><IconLock size={15} /> Ganti Kata Sandi</button>
        <p className="mt-2.5 text-[10.5px] leading-relaxed font-semibold text-ink-300">Sesi JWT aktif 8 jam · perangkat diikat saat login pertama · data di mesin SQL lokal.</p>
      </section>

      <button className="btn-soft w-full !py-3 text-sm" onClick={() => window.dispatchEvent(new Event("vittoria:tour"))}><IconStar size={15} /> Lihat Tur Aplikasi</button>
      <button className="btn-danger w-full !py-4 text-[15px]" onClick={() => logout()}><IconLogoutIn size={18} /> Keluar dari Akun</button>

      {/* edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Profil">
        <div className="space-y-3">
          <div>
            <label className="label">Nama</label>
            <input className="input !py-2.5 text-sm" value={fName} onChange={(e) => setFName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Telepon</label>
              <input className="input !py-2.5 font-mono text-sm" value={fPhone} onChange={(e) => setFPhone(e.target.value)} />
            </div>
            <div>
              <label className="label">Telp. darurat</label>
              <input className="input !py-2.5 font-mono text-sm" value={fEmergPhone} onChange={(e) => setFEmergPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Alamat</label>
            <input className="input !py-2.5 text-sm" value={fAddress} onChange={(e) => setFAddress(e.target.value)} />
          </div>
          <div>
            <label className="label">Kontak darurat</label>
            <input className="input !py-2.5 text-sm" value={fEmergName} onChange={(e) => setFEmergName(e.target.value)} />
          </div>
          <button className="btn-sun w-full" onClick={saveProfile}><IconCheck size={16} /> Simpan</button>
        </div>
      </Modal>

      {/* photo modal */}
      <Modal open={photoOpen} onClose={() => setPhotoOpen(false)} title="Foto Tanda Tangan">
        {saving ? <Banner tone="info" title="Menyimpan encoding…">Menghitung vektor wajah dari foto.</Banner>
          : <CameraCapture onCapture={(c, d) => void onPhoto(c, d)} heightClass="h-56" captureLabel="Simpan Foto" />}
      </Modal>

      {/* password modal */}
      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Ganti Kata Sandi">
        <div className="space-y-3">
          <div>
            <label className="label">Kata sandi lama</label>
            <input type="password" className="input !py-2.5 text-sm" value={pwOld} onChange={(e) => setPwOld(e.target.value)} />
          </div>
          <div>
            <label className="label">Kata sandi baru (min. 6)</label>
            <input type="password" className="input !py-2.5 text-sm" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
          </div>
          <div>
            <label className="label">Ulangi kata sandi baru</label>
            <input type="password" className="input !py-2.5 text-sm" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} />
          </div>
          {pwErr && <Banner tone="warn">{pwErr}</Banner>}
          <button className="btn-sun w-full" onClick={savePw} disabled={!pwOld || !pwNew || !pwConfirm}><IconLock size={15} /> Ganti Kata Sandi</button>
        </div>
      </Modal>
    </div>
  );
}
