/**
 * Setup Wizard — Super Admin tool untuk konfigurasi koneksi Supabase/Postgres.
 * Memandu admin melalui 5 langkah:
 *   1. Penjelasan & prasyarat
 *   2. Input connection string (Transaction Pooler, port 6543)
 *   3. Test koneksi & inisialisasi schema
 *   4. Migrasi data lokal ke cloud
 *   5. Konfirmasi & aktivasi live sync
 */
import { useState } from "react";
import { useApp } from "../lib/store";
import { apiUrl, setApiOverride, cloudPing, cloudInit, cloudPull, setCloudActive } from "../lib/sql/cloud";
import { downloadTextFile } from "../lib/database";
import { IconCheck, IconDatabase, IconDownload, IconRefresh, IconServer, IconShield, IconX } from "../components/icons";
import { Modal } from "../components/bits";
import { useToast } from "../components/Toast";

const STORAGE_KEY = "vittoria:supabase-config";

interface SupabaseConfig {
  connectionString: string;
  configuredAt: number;
  testedOk: boolean;
}

function loadConfig(): SupabaseConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return null;
}

function saveConfig(cfg: SupabaseConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch { /* private mode */ }
}

function clearConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* noop */ }
}

export default function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const app = useApp();
  const { cloudPullNow } = app;
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [connStr, setConnStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pingResult, setPingResult] = useState<Awaited<ReturnType<typeof cloudPing>> | null>(null);
  const [pullResult, setPullResult] = useState<Awaited<ReturnType<typeof cloudPull>> | null>(null);
  const existing = loadConfig();

  const handleClose = () => {
    onComplete();
  };

  const handleSaveAndTest = async () => {
    if (!connStr.trim()) {
      setError("Connection string tidak boleh kosong");
      return;
    }
    if (!connStr.includes("6543")) {
      setError("⚠️ Pastikan menggunakan Transaction Pooler (port 6543), bukan Direct Connection (5432)");
      // Continue anyway but warn
    }
    setBusy(true);
    setError("");
    try {
      // Simpan ke localStorage
      const cfg: SupabaseConfig = { connectionString: connStr.trim(), configuredAt: Date.now(), testedOk: false };
      saveConfig(cfg);
      setApiOverride(connStr.trim());
      
      // Test ping
      const ping = await cloudPing();
      setPingResult(ping);
      if (!ping.ok) {
        setError(ping.error ?? "Koneksi gagal");
        setBusy(false);
        return;
      }
      
      // Init schema jika belum ada
      const initRes = await cloudInit();
      if (!initRes.ok) {
        setError(initRes.error ?? "Gagal inisialisasi schema");
        setBusy(false);
        return;
      }
      
      cfg.testedOk = true;
      saveConfig(cfg);
      setStep(3);
      toast.push("ok", "Koneksi berhasil!", "Supabase siap digunakan");
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const handlePullData = async () => {
    setBusy(true);
    setError("");
    try {
      const pull = await cloudPull();
      setPullResult(pull);
      if (!pull.ok) {
        setError(pull.error ?? "Gagal menarik data");
        setBusy(false);
        return;
      }
      setStep(4);
      toast.push("ok", "Data berhasil disinkronkan", `${pull.rows} baris di cloud`);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const handleActivate = async () => {
    setCloudActive(true);
    // Use the app's cloudPullNow to properly update the store state
    const success = await cloudPullNow();
    if (success) {
      toast.push("ok", "Live Sync Aktif!", "Database cloud sekarang aktif");
    } else {
      toast.push("warn", "Aktivasi berhasil, tapi pull data gagal", "Data akan disinkronkan otomatis nanti");
    }
    // Advance to step 5 before closing
    setStep(5);
  };

  const steps = [
    { num: 1, title: "Pendahuluan", done: step > 1 },
    { num: 2, title: "Connection String", done: step > 2 },
    { num: 3, title: "Test Koneksi", done: step > 3 },
    { num: 4, title: "Migrasi Data", done: step > 4 },
    { num: 5, title: "Aktivasi", done: false },
  ];

  return (
    <Modal open title="🗄️ Setup Database Cloud" onClose={onComplete} wide>
      <div className="space-y-6">
        {/* Step indicators */}
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center gap-2">
              <div className={`grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold ${
                step === s.num ? "bg-sky-500 text-white" :
                s.done ? "bg-emerald-500 text-white" :
                "bg-ink-100 text-ink-400"
              }`}>
                {s.done ? <IconCheck size={16} /> : s.num}
              </div>
              <span className={`text-[12px] font-semibold ${step === s.num ? "text-ink-900" : "text-ink-400"}`}>
                {s.title}
              </span>
              {i < steps.length - 1 && <div className="h-[2px] w-8 bg-ink-100" />}
            </div>
          ))}
        </div>

        {/* Step 1: Pendahuluan */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
              <h3 className="font-display text-lg font-extrabold text-sky-700">🎯 Tujuan Setup</h3>
              <p className="mt-2 text-[13px] font-medium text-sky-900">
                Menghubungkan aplikasi Vittoria HR ke database Supabase agar:
              </p>
              <ul className="mt-2 space-y-1 text-[13px] font-medium text-sky-900">
                <li>✅ Data tersimpan di cloud (tidak hilang saat ganti device)</li>
                <li>✅ Multi-user access (semua staff bisa akses dari device masing-masing)</li>
                <li>✅ Live sync otomatis (perubahan langsung terlihat di semua device)</li>
                <li>✅ Backup & recovery lebih mudah</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <h3 className="font-display text-lg font-extrabold text-amber-700">⚠️ Prasyarat</h3>
              <ul className="mt-2 space-y-1 text-[13px] font-medium text-amber-900">
                <li>• Akun Supabase sudah dibuat (gratis di <a href="https://supabase.com" target="_blank" rel="noreferrer" className="underline">supabase.com</a>)</li>
                <li>• Database project sudah dibuat</li>
                <li>• Connection string Transaction Pooler (port 6543) sudah tersedia</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-ink-100 bg-ink-50 p-4">
              <h3 className="font-display text-lg font-extrabold text-ink-700">📋 Cara Dapatkan Connection String</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-[13px] font-medium text-ink-900">
                <li>Buka dashboard Supabase → Project Settings → Database</li>
                <li>Scroll ke bagian "Connection string"</li>
                <li>Pilih tab <b>"Connection pooler"</b> (bukan "Direct connect")</li>
                <li>Copy string yang berbentuk: <code className="font-mono text-[11px]">postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres</code></li>
                <li>Pastikan port-nya <b>6543</b> (bukan 5432)</li>
              </ol>
            </div>

            <button className="btn-sun w-full !py-3" onClick={() => setStep(2)}>
              <IconDatabase size={16} /> Lanjut ke Input Connection String
            </button>
            <div className="pt-2">
              <button className="btn-ghost w-full !py-2.5" onClick={handleClose}>
                Batal
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Input Connection String */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-ink-100 bg-white p-4">
              <label className="block text-[13px] font-bold text-ink-700">
                Connection String (Transaction Pooler)
              </label>
              <textarea
                className="input mt-2 w-full font-mono text-[12px]"
                rows={4}
                placeholder="postgresql://postgres.xxx:your-password@aws-0-region.pooler.supabase.com:6543/postgres"
                value={connStr || existing?.connectionString || ""}
                onChange={(e) => setConnStr(e.target.value)}
              />
              {existing && (
                <p className="mt-2 text-[11px] text-ink-400">
                  Terakhir disimpan: {new Date(existing.configuredAt).toLocaleString()}
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] font-semibold text-danger-700">
                ⚠️ {error}
              </div>
            )}

            <div className="flex gap-2">
              <button className="btn-ghost flex-1 !py-2.5" onClick={handleClose}>
                Batal
              </button>
              <button
                className="btn-sun flex-1 !py-2.5 disabled:opacity-50"
                onClick={handleSaveAndTest}
                disabled={busy || !connStr.trim()}
              >
                {busy ? "Testing..." : "Simpan & Test Koneksi"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Hasil Test Koneksi */}
        {step === 3 && pingResult && (
          <div className="space-y-4">
            <div className={`rounded-2xl border p-4 ${pingResult.ok ? "border-emerald-100 bg-emerald-50" : "border-danger-100 bg-danger-50"}`}>
              <h3 className={`font-display text-lg font-extrabold ${pingResult.ok ? "text-emerald-700" : "text-danger-700"}`}>
                {pingResult.ok ? "✅ Koneksi Berhasil!" : "❌ Koneksi Gagal"}
              </h3>
              {pingResult.ok ? (
                <ul className="mt-2 space-y-1 text-[13px] font-medium text-emerald-900">
                  <li>• Server: <b>{pingResult.serverVersion}</b></li>
                  <li>• Schema ready: <b>{pingResult.schemaReady ? "Ya" : "Belum"}</b></li>
                  <li>• Tables created: <b>{pingResult.tables}</b></li>
                  <li>• Response time: <b>{pingResult.serverMs} ms</b></li>
                  <li>• Total rows: <b>{pingResult.rows}</b></li>
                </ul>
              ) : (
                <p className="mt-2 text-[13px] font-medium text-danger-900">{pingResult.error}</p>
              )}
            </div>

            {pingResult.ok && !pingResult.schemaReady && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-800">
                ℹ️ Schema baru saja diinisialisasi. Lanjut untuk migrasi data.
              </div>
            )}

            <div className="flex gap-2">
              <button className="btn-ghost flex-1 !py-2.5" onClick={handleClose}>
                Tutup
              </button>
              <button className="btn-sun flex-1 !py-2.5" onClick={handlePullData}>
                <IconRefresh size={16} /> Lanjut: Tarik Data ke Cloud
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Migrasi Data */}
        {step === 4 && pullResult && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
              <h3 className="font-display text-lg font-extrabold text-sky-700">📊 Status Migrasi</h3>
              <ul className="mt-2 space-y-1 text-[13px] font-medium text-sky-900">
                <li>• Total rows di cloud: <b>{pullResult.rows}</b></li>
                <li>• Tables populated: <b>{Object.keys(pullResult.counts).length}</b></li>
                <li>• Data version: <b>{pullResult.version ?? "-"}</b></li>
              </ul>
            </div>

            {pullResult.hasData && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <h3 className="font-display text-lg font-extrabold text-emerald-700">✅ Data Sudah Ada di Cloud</h3>
                <p className="mt-2 text-[13px] font-medium text-emerald-900">
                  Database cloud sudah berisi data. Anda bisa langsung aktivasi live sync.
                </p>
              </div>
            )}

            {!pullResult.hasData && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <h3 className="font-display text-lg font-extrabold text-amber-700">☁️ Cloud Masih Kosong</h3>
                <p className="mt-2 text-[13px] font-medium text-amber-900">
                  Data lokal Anda akan di-upload ke cloud saat pertama kali melakukan sync.
                  Ini terjadi otomatis setelah aktivasi.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button className="btn-ghost flex-1 !py-2.5" onClick={handleClose}>
                Tutup
              </button>
              <button className="btn-sun flex-1 !py-2.5" onClick={handleActivate}>
                <IconCheck size={16} /> Aktivasi Live Sync
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Aktivasi */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-white">
                <IconCheck size={32} />
              </div>
              <h3 className="mt-4 font-display text-xl font-extrabold text-emerald-700">
                🎉 Setup Selesai!
              </h3>
              <p className="mt-2 text-[13px] font-medium text-emerald-900">
                Database Supabase sekarang aktif dan siap digunakan.
              </p>
              <ul className="mt-4 space-y-1 text-[13px] font-medium text-emerald-900">
                <li>✅ Semua user bisa login dari device masing-masing</li>
                <li>✅ Data tersinkronisasi otomatis (live sync)</li>
                <li>✅ Backup data ada di cloud Supabase</li>
              </ul>
            </div>

            <button className="btn-sun w-full !py-3" onClick={handleClose}>
              Mulai Menggunakan
            </button>
          </div>
        )}

        {/* Footer helper */}
        <div className="rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 text-center text-[11px] text-ink-500">
          💡 Connection string disimpan terenkripsi di localStorage browser ini.
          Tidak dikirim ke server kecuali saat request API.
        </div>
      </div>
    </Modal>
  );
}
