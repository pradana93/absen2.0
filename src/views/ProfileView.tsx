/**
 * Profil — identity card, full self-service edit, signature photo
 * enrollment, password change, device binding card, JWT session card,
 * tour re-open, logout.
 */
import { useState } from "react";
import { useApp } from "../lib/store";
import { fmtExpLeft } from "../lib/jwt";
import { shortDevice } from "../lib/device";
import { extractSignature } from "../lib/faceEngine";
import { idr, relTime } from "../lib/format";
import CameraCapture from "../components/CameraCapture";
import { useToast } from "../components/Toast";
import { Banner, Chip, InitialsAvatar, Modal, SectionLabel } from "../components/bits";
import {
  IconCamera, IconCheck, IconCpu, IconEdit, IconFace, IconLock, IconLogoutIn, IconShield, IconSmartphone, IconStar,
} from "../components/icons";

export default function ProfileView() {
  const { session, updateEmployee, logout, audit, tokenExp, engine } = useApp();
  const toast = useToast();
  const me = session!;

  /* edit form */
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    name: me.name, phone: me.phone, address: me.address,
    emergencyName: me.emergencyName, emergencyPhone: me.emergencyPhone,
  });
  const [editErr, setEditErr] = useState("");

  /* photo enrollment */
  const [photoOpen, setPhotoOpen] = useState(false);
  const [encoding, setEncoding] = useState(false);

  /* password */
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwErr, setPwErr] = useState("");

  const saveProfile = () => {
    if (form.name.trim().length < 3) return setEditErr("Nama minimal 3 karakter.");
    updateEmployee(me.staffId, { ...form, name: form.name.trim() });
    audit("PROFILE_UPDATE", me.staffId, "Profil diperbarui mandiri");
    toast.push("ok", "Profil disimpan", "Perubahan langsung berlaku.");
    setEditOpen(false);
    setEditErr("");
  };

  const onPhoto = async (canvas: HTMLCanvasElement, dataUrl: string) => {
    setEncoding(true);
    const sig = await extractSignature(canvas);
    updateEmployee(me.staffId, { photo: dataUrl, descriptor: sig.descriptor, hash: sig.hash });
    audit("FACE_ENROLL", me.staffId, sig.descriptor ? "Baseline 128-D diperbarui" : "Baseline dHash diperbarui");
    toast.push("ok", "Foto tanda tangan tersimpan", sig.descriptor ? "Encoding 128-D siap untuk absensi." : "Mode lite aktif untuk profil ini.");
    setEncoding(false);
    setPhotoOpen(false);
  };

  const changePw = () => {
    if (pw.current !== me.password) return setPwErr("Kata sandi saat ini salah.");
    if (pw.next.length < 6) return setPwErr("Kata sandi baru minimal 6 karakter.");
    if (pw.next !== pw.confirm) return setPwErr("Konfirmasi kata sandi tidak cocok.");
    updateEmployee(me.staffId, { password: pw.next });
    audit("PASSWORD_CHANGE", me.staffId, "Kata sandi diubah mandiri");
    toast.push("ok", "Kata sandi diganti", "Gunakan kata sandi baru saat login berikutnya.");
    setPwOpen(false);
    setPw({ current: "", next: "", confirm: "" });
    setPwErr("");
  };

  return (
    <div className="space-y-5">
      {/* identity card */}
      <section className="card overflow-hidden">
        <div className="grad-morning relative px-5 pb-12 pt-5 text-white">
          <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
          <p className="text-[11px] font-extrabold tracking-[0.16em] text-white/70 uppercase">Kartu Karyawan</p>
          <p className="mt-0.5 font-mono text-[12px] font-bold text-white/80">{companyName(me)}</p>
        </div>
        <div className="-mt-8 flex items-end gap-3.5 px-5">
          <div className="relative">
            <InitialsAvatar name={me.name} photo={me.photo} seedKey={me.staffId} size="h-20 w-20 text-[26px] rounded-[22px]" />
            <span className={`absolute -right-1 -bottom-1 grid h-6 w-6 place-items-center rounded-full border-2 border-white ${me.descriptor ? "bg-ok-500" : me.hash ? "bg-warn-500" : "bg-ink-300"}`}>
              <IconFace size={12} className="text-white" />
            </span>
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="truncate font-display text-[22px] leading-tight font-extrabold text-ink-900">{me.name}</h1>
            <p className="text-[12px] font-bold text-ink-400">{me.position} · {me.department}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-5 py-4">
          {[
            ["Staff ID", me.staffId],
            ["NIK", me.nik],
            ["Email", me.email],
            ["Telepon", me.phone],
            ["Shift", me.shiftId.replace("sh-", "").toUpperCase()],
            ["Gaji pokok", idr(me.salary.basic)],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <p className="text-[9.5px] font-extrabold tracking-wide text-ink-400 uppercase">{k}</p>
              <p className="truncate font-mono text-[12.5px] font-bold text-ink-800">{v}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t border-ink-100 px-5 py-3.5">
          <button className="btn-ghost flex-1 !py-2.5 !text-[13px]" onClick={() => { setForm({ name: me.name, phone: me.phone, address: me.address, emergencyName: me.emergencyName, emergencyPhone: me.emergencyPhone }); setEditOpen(true); }}>
            <IconEdit size={15} /> Edit Profil
          </button>
          <button className="btn-sun flex-1 !py-2.5 !text-[13px]" onClick={() => setPhotoOpen(true)}>
            <IconCamera size={15} /> Foto Tanda Tangan
          </button>
        </div>
      </section>

      {/* face status */}
      <section className="card flex items-center gap-3.5 p-4">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${me.descriptor ? "bg-teal-100 text-teal-600" : "bg-warn-100 text-warn-600"}`}>
          <IconCpu size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-extrabold text-ink-900">Baseline Wajah</p>
          <p className="text-[11.5px] font-semibold text-ink-400">
            {me.descriptor ? `Encoding 128-D tersimpan · mesin ${engine === "ai" ? "AI aktif" : "lite"}` : me.hash ? "Tanda tangan dHash (mode lite)" : "Belum ada — absensi wajah belum aktif"}
          </p>
        </div>
        <Chip tone={me.descriptor ? "teal" : me.hash ? "warn" : "danger"}>{me.descriptor ? "128-D" : me.hash ? "dHash" : "KOSONG"}</Chip>
      </section>

      {/* device binding */}
      <section className="card flex items-center gap-3.5 p-4">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${me.deviceId ? "bg-teal-100 text-teal-600" : "bg-ink-100 text-ink-400"}`}>
          <IconSmartphone size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-extrabold text-ink-900">Perangkat Terikat</p>
          <p className="truncate font-mono text-[11px] font-semibold text-ink-400">
            {me.deviceId ? `${shortDevice(me.deviceId)} · diikat ${me.deviceBoundAt ? relTime(me.deviceBoundAt) : ""}` : "Belum terikat ke perangkat mana pun"}
          </p>
        </div>
        {me.deviceId ? <Chip tone="ok">AMAN</Chip> : <Chip tone="warn">LEMAH</Chip>}
      </section>

      {/* session */}
      <section className="card flex items-center gap-3.5 p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-grape-100 text-grape-600"><IconShield size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-extrabold text-ink-900">Sesi JWT</p>
          <p className="text-[11.5px] font-semibold text-ink-400">Access token berlaku {fmtExpLeft(tokenExp)} lagi</p>
        </div>
        <button className="btn-soft !rounded-xl !px-3 !py-2 !text-[12px]" onClick={() => setPwOpen(true)}>
          <IconLock size={13} /> Ganti Sandi
        </button>
      </section>

      <button className="btn-soft w-full !py-3 text-sm" onClick={() => window.dispatchEvent(new Event("vittoria:tour"))}>
        <IconStar size={15} /> Lihat Tur Aplikasi
      </button>

      <button className="btn-danger w-full !py-4 text-[15px]" onClick={() => logout()}>
        <IconLogoutIn size={18} /> Keluar dari Akun
      </button>

      {/* edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Profil">
        <div className="space-y-3">
          <div>
            <label className="label">Nama Lengkap</label>
            <input className="input !py-2.5 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Telepon</label>
            <input className="input !py-2.5 font-mono text-sm" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Alamat</label>
            <input className="input !py-2.5 text-sm" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Kontak darurat</label>
              <input className="input !py-2.5 text-sm" value={form.emergencyName} onChange={(e) => setForm({ ...form, emergencyName: e.target.value })} />
            </div>
            <div>
              <label className="label">Telp. darurat</label>
              <input className="input !py-2.5 font-mono text-sm" value={form.emergencyPhone} onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })} />
            </div>
          </div>
          {editErr && <Banner tone="warn">{editErr}</Banner>}
          <button className="btn-sun w-full" onClick={saveProfile}><IconCheck size={16} /> Simpan</button>
        </div>
      </Modal>

      {/* photo modal */}
      <Modal open={photoOpen} onClose={() => setPhotoOpen(false)} title="Foto Tanda Tangan" wide>
        <div className="space-y-3">
          <Banner tone="info" title="Baseline absensi wajah">
            Foto ini menjadi pembanding saat kamu absen. Ambil dengan pencahayaan baik dan wajah menghadap kamera.
          </Banner>
          <CameraCapture onCapture={(c, d) => void onPhoto(c, d)} disabled={encoding} heightClass="h-56" captureLabel={encoding ? "Menyimpan…" : "Ambil & Simpan"} />
        </div>
      </Modal>

      {/* password modal */}
      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Ganti Kata Sandi">
        <div className="space-y-3">
          <div>
            <label className="label">Kata sandi saat ini</label>
            <input type="password" className="input !py-2.5 text-sm" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </div>
          <div>
            <label className="label">Kata sandi baru (min. 6)</label>
            <input type="password" className="input !py-2.5 text-sm" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </div>
          <div>
            <label className="label">Ulangi kata sandi baru</label>
            <input type="password" className="input !py-2.5 text-sm" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </div>
          {pwErr && <Banner tone="warn">{pwErr}</Banner>}
          <button className="btn-sun w-full" onClick={changePw}><IconLock size={15} /> Ganti Kata Sandi</button>
        </div>
      </Modal>
      <span className="hidden"><SectionLabel>{""}</SectionLabel></span>
    </div>
  );
}

function companyName(me: { department: string }): string {
  void me;
  return "PT Vittoria Logistik Indonesia";
}
