/**
 * First-login onboarding — role-adaptive walkthrough, skippable,
 * re-openable from Profil (window event "vittoria:tour").
 */
import { useMemo, useState } from "react";
import { Role } from "../lib/database";
import { IconArrowRight, IconCamera, IconCheck, IconClock, IconGear, IconPin, IconShield, IconUsers, IconWallet } from "./icons";

interface Step { icon: React.ReactNode; title: string; body: string; }

const COMMON: Step[] = [
  {
    icon: <IconCamera size={22} />,
    title: "Absen dengan Wajah + GPS",
    body: "Buka tab Absen lewat tombol oranye di tengah. Foto wajahmu diverifikasi (encoding 128-D) dan posisimu harus berada di dalam radius gudang — dua-duanya harus lolos.",
  },
  {
    icon: <IconPin size={22} />,
    title: "Geofencing Otomatis",
    body: "Jarak ke HQ dihitung real-time dengan rumus Haversine. Di luar radius? Absensi otomatis ditolak dan tercatat di audit — tanpa perlu lapor siapa pun.",
  },
];

const EMPLOYEE_STEPS: Step[] = [
  ...COMMON,
  {
    icon: <IconClock size={22} />,
    title: "Istirahat & Jam Kerja",
    body: "Tekan Mulai Istirahat saat rehat — timer berjalan di Beranda. Jam kerja bersih dihitung otomatis: check-out dikurangi check-in dikurangi istirahat.",
  },
  {
    icon: <IconWallet size={22} />,
    title: "Cuti & Slip Gaji",
    body: "Ajukan cuti dengan lampiran dan pantau persetujuan Manajer → HR. Slip gaji diterbitkan Admin HR tiap bulan dan bisa kamu cetak dari menu Gaji.",
  },
  {
    icon: <IconShield size={22} />,
    title: "Akunmu Terlindungi",
    body: "Login memakai JWT, dan perangkat ini akan diikat ke akunmu saat login pertama — orang lain tidak bisa memakai akunmu dari HP lain.",
  },
];

const MANAGER_STEPS: Step[] = [
  ...COMMON,
  {
    icon: <IconUsers size={22} />,
    title: "Persetujuan Cuti Tim",
    body: "Pengajuan cuti anggota tim masuk ke tab Cuti sebagai Tahap 1. Setujui untuk meneruskan ke HR, atau tolak dengan satu ketukan — karyawan otomatis dinotifikasi.",
  },
  {
    icon: <IconShield size={22} />,
    title: "Akunmu Terlindungi",
    body: "Sesi memakai JWT dan perangkat ini diikat ke akunmu saat login pertama.",
  },
];

const ADMIN_STEPS: Step[] = [
  {
    icon: <IconUsers size={22} />,
    title: "Kelola Pengguna",
    body: "Buat akun staff di menu Pengguna — email disarankan otomatis, kata sandi awal dibuat acak dan ditampilkan sekali untuk diserahkan ke karyawan.",
  },
  {
    icon: <IconClock size={22} />,
    title: "Dashboard & Persetujuan",
    body: "Pantau kehadiran hari ini, keterlambatan, dan tren 7 hari. Pengajuan cuti tahap HR menunggu persetujuanmu di tab Cuti.",
  },
  {
    icon: <IconGear size={22} />,
    title: "Atur Geofence di Peta",
    body: "Geser pin oranye untuk memilih area gudang dan seret pegangan putih untuk mengatur radius — semua dari menu Aturan.",
  },
  {
    icon: <IconShield size={22} />,
    title: "Jejak Audit Lengkap",
    body: "Setiap login, absensi, perubahan aturan, dan penerbitan slip tercatat di audit — transparan dan bisa diekspor.",
  },
];

const SUPER_STEPS: Step[] = [
  {
    icon: <IconGear size={22} />,
    title: "Kendali Perusahaan",
    body: "Ganti nama aplikasi, logo, warna merek, pengumuman global, hingga mode pemeliharaan — semua dari menu Sistem, dan tersinkron ke semua perangkat lewat kode identitas.",
  },
  {
    icon: <IconShield size={22} />,
    title: "Keamanan Perangkat",
    body: "Akun terikat ke perangkat login pertamanya. Jika karyawan ganti HP, lepaskan ikatannya dari menu Pengguna (ikon ponsel) agar bisa login di perangkat baru.",
  },
  {
    icon: <IconUsers size={22} />,
    title: "Audit & Cadangan",
    body: "Tab Audit menampilkan seluruh jejak aksi. Di menu Sistem kamu juga bisa ekspor/impor cadangan JSON seluruh tenant.",
  },
];

export default function OnboardingTour({ role, name, onDone }: { role: Role; name: string; onDone: () => void }) {
  const steps = useMemo(() => {
    if (role === "superadmin") return SUPER_STEPS;
    if (role === "companyadmin") return ADMIN_STEPS;
    if (role === "manager") return MANAGER_STEPS;
    return EMPLOYEE_STEPS;
  }, [role]);

  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-ink-950/60 p-5 backdrop-blur-sm">
      <div className="anim-pop w-full max-w-sm rounded-[28px] bg-white p-6 shadow-[0_40px_100px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sun-400 to-sun-600 text-white shadow-[0_12px_28px_rgba(240,115,0,0.4)]">
            {step.icon}
          </span>
          <button onClick={onDone} className="cursor-pointer rounded-full px-3 py-1.5 text-[11px] font-extrabold text-ink-400 transition hover:bg-ink-50">
            Lewati
          </button>
        </div>

        <p key={i} className="anim-fade-up">
          <span className="mt-4 block text-[10.5px] font-extrabold tracking-[0.16em] text-sun-600 uppercase">
            Tur singkat · {i + 1}/{steps.length}
          </span>
          <span className="mt-1 block font-display text-[22px] leading-tight font-extrabold text-ink-900">{step.title}</span>
          <span className="mt-2 block text-[13.5px] leading-relaxed font-semibold text-ink-500">{step.body}</span>
        </p>

        <div className="mt-5 flex gap-1.5">
          {steps.map((_, d) => (
            <span key={d} className={`h-1.5 rounded-full transition-all duration-300 ${d === i ? "w-7 bg-sun-500" : d < i ? "w-3 bg-sun-300" : "w-3 bg-ink-100"}`} />
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          {i > 0 && <button className="btn-ghost flex-1 !py-3 text-[13px]" onClick={() => setI(i - 1)}>Kembali</button>}
          <button className="btn-sun flex-[2] !py-3 text-[14px]" onClick={() => (last ? onDone() : setI(i + 1))}>
            {last ? <><IconCheck size={17} /> Mulai, {name.split(" ")[0]}!</> : <>Lanjut <IconArrowRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
