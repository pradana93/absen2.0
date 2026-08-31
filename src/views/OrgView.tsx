/**
 * Struktur Organisasi — HR/Super Admin build & maintain the hierarchy;
 * managers & staff see a polished read-only chart.
 */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { OrgNode } from "../lib/database";
import { uid } from "../lib/format";
import OrgChart from "../components/OrgChart";
import { useToast } from "../components/Toast";
import { Banner, Chip, EmptyState, Modal } from "../components/bits";
import { IconCheck, IconEdit, IconLock, IconPlus, IconUsers, IconX } from "../components/icons";

export default function OrgView() {
  const { session, company, employees, org, addOrgNode, updateOrgNode, removeOrgNode, audit } = useApp();
  const toast = useToast();
  const me = session!;
  const isAdmin = me.role === "companyadmin" || me.role === "superadmin";

  const [modal, setModal] = useState<{ mode: "add" | "edit"; parentId: string | null; node?: OrgNode } | null>(null);
  const [fTitle, setFTitle] = useState("");
  const [fStaffId, setFStaffId] = useState("");
  const [fName, setFName] = useState("");
  const [fNote, setFNote] = useState("");
  const [fErr, setFErr] = useState("");

  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  useEffect(() => {
    if (!armedDelete) return;
    const t = window.setTimeout(() => setArmedDelete(null), 2600);
    return () => window.clearTimeout(t);
  }, [armedDelete]);

  const linkedCount = useMemo(() => org.filter((n) => n.staffId).length, [org]);
  const depthCount = useMemo(() => {
    const byParent = new Map<string | null, OrgNode[]>();
    org.forEach((n) => byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n]));
    let max = 0;
    const walk = (id: string | null, d: number) => {
      max = Math.max(max, d);
      (byParent.get(id) ?? []).forEach((n) => walk(n.id, d + 1));
    };
    (byParent.get(null) ?? []).forEach((n) => walk(n.id, 1));
    return max;
  }, [org]);

  const openAdd = (parentId: string | null) => {
    setModal({ mode: "add", parentId });
    setFTitle(""); setFStaffId(""); setFName(""); setFNote(""); setFErr("");
  };
  const openEdit = (node: OrgNode) => {
    setModal({ mode: "edit", parentId: node.parentId, node });
    setFTitle(node.title); setFStaffId(node.staffId ?? ""); setFName(node.name ?? ""); setFNote(node.note ?? ""); setFErr("");
  };

  const onStaffPick = (staffId: string) => {
    setFStaffId(staffId);
    const emp = employees.find((e) => e.staffId === staffId);
    if (emp) {
      setFName(emp.name);
      if (!fTitle) setFTitle(emp.position);
    }
  };

  const submit = () => {
    if (!modal) return;
    if (fTitle.trim().length < 2) return setFErr("Judul posisi minimal 2 karakter.");
    if (!fStaffId && fName.trim().length < 3) return setFErr("Pilih karyawan atau isi nama penghuni posisi.");
    if (modal.mode === "add") {
      addOrgNode({
        id: uid("org"), parentId: modal.parentId, title: fTitle.trim(),
        staffId: fStaffId || null, name: fStaffId ? null : fName.trim(),
        note: fNote.trim() || null, createdAt: Date.now(),
      });
      audit("ORG_CREATE", modal.parentId ?? "root", `Posisi "${fTitle.trim()}" ditambahkan`);
      toast.push("ok", "Posisi ditambahkan", fTitle.trim());
    } else if (modal.node) {
      updateOrgNode(modal.node.id, {
        title: fTitle.trim(),
        staffId: fStaffId || null,
        name: fStaffId ? null : fName.trim(),
        note: fNote.trim() || null,
      });
      audit("ORG_UPDATE", modal.node.id, `Posisi "${fTitle.trim()}" diperbarui`);
      toast.push("ok", "Posisi diperbarui", fTitle.trim());
    }
    setModal(null);
  };

  const handleDelete = (node: OrgNode) => {
    if (armedDelete !== node.id) {
      setArmedDelete(node.id);
      return;
    }
    const kids = org.filter((n) => n.parentId === node.id).length;
    removeOrgNode(node.id);
    audit("ORG_DELETE", node.id, `Posisi "${node.title}" dihapus${kids ? ` · ${kids} bawahan dipindah ke atas` : ""}`);
    toast.push("info", "Posisi dihapus", kids ? `${kids} bawahan dipindahkan satu tingkat ke atas.` : node.title);
    setArmedDelete(null);
  };

  const parentTitle = modal?.parentId ? org.find((n) => n.id === modal.parentId)?.title : null;

  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-ink-900">Struktur Organisasi</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-400">{company.name}</p>
        </div>
        {isAdmin ? (
          <button className="btn-sun !rounded-xl !px-4 !py-2.5 text-sm" onClick={() => openAdd(null)}>
            <IconPlus size={15} /> Posisi
          </button>
        ) : (
          <Chip tone="ink" className="mt-1.5"><IconLock size={10} /> READ-ONLY</Chip>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip tone="sun">{org.length} posisi</Chip>
        <Chip tone="ok">{linkedCount} terhubung ke karyawan</Chip>
        <Chip tone="sky">{depthCount} level</Chip>
        {isAdmin ? <Chip tone="warn"><IconEdit size={10} /> MODE EDITOR</Chip> : <Chip tone="ink">dikelola Admin HR</Chip>}
      </div>

      {isAdmin && (
        <Banner tone="info" title="Cara menyusun struktur">
          Ketuk <b>＋</b> pada kartu untuk menambah bawahan, <b>pensil</b> untuk mengubah posisi atau menautkan karyawan,
          dan <b>tempat sampah</b> (dua ketukan) untuk menghapus — bawahannya otomatis naik satu tingkat.
        </Banner>
      )}

      <div className="card overflow-hidden">
        {org.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<IconUsers size={26} />}
              title="Struktur masih kosong"
              desc="Mulai dari posisi teratas perusahaan, lalu tambah bawahan di bawahnya."
              action={isAdmin ? <button className="btn-sun !px-4 !py-2.5 text-sm" onClick={() => openAdd(null)}><IconPlus size={15} /> Buat Posisi Puncak</button> : undefined}
            />
          </div>
        ) : (
          <OrgChart
            nodes={org}
            employees={employees}
            editable={isAdmin}
            onAddChild={(pid) => openAdd(pid)}
            onEdit={openEdit}
            onDelete={handleDelete}
            armedDeleteId={armedDelete}
          />
        )}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === "add" ? "Tambah Posisi" : "Edit Posisi"}>
        {modal && (
          <div className="space-y-3.5">
            {modal.mode === "add" && (
              <p className="rounded-xl bg-ink-50 px-3 py-2 text-[11.5px] font-bold text-ink-500">
                {parentTitle ? <>Bawahan langsung dari <span className="text-sun-700">{parentTitle}</span></> : "Posisi puncak (level teratas)"}
              </p>
            )}
            <div>
              <label className="label">Judul Posisi</label>
              <input className="input !py-2.5 text-sm" placeholder="cth. Supervisor Gudang" value={fTitle} onChange={(e) => setFTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Tautkan ke Karyawan (opsional)</label>
              <select className="input !py-2.5 text-sm" value={fStaffId} onChange={(e) => onStaffPick(e.target.value)}>
                <option value="">— Tanpa tautan (posisi saja) —</option>
                {employees.map((e) => (
                  <option key={e.staffId} value={e.staffId}>{e.name} · {e.staffId} · {e.department}</option>
                ))}
              </select>
              <p className="mt-1 text-[10.5px] font-semibold text-ink-300">
                Saat ditautkan, nama, foto, dan departemen mengikuti data karyawan secara otomatis.
              </p>
            </div>
            {!fStaffId && (
              <div className="anim-fade-up">
                <label className="label">Nama Penghuni Posisi</label>
                <input className="input !py-2.5 text-sm" placeholder="cth. Dewi Anggraini" value={fName} onChange={(e) => setFName(e.target.value)} />
              </div>
            )}
            <div>
              <label className="label">Catatan (opsional)</label>
              <input className="input !py-2.5 text-sm" placeholder="cth. Shift pagi · gudang A" value={fNote} onChange={(e) => setFNote(e.target.value)} />
            </div>
            {fErr && <Banner tone="warn">{fErr}</Banner>}
            <div className="flex gap-2">
              <button className="btn-ghost flex-1 !py-3 text-sm" onClick={() => setModal(null)}><IconX size={14} /> Batal</button>
              <button className="btn-sun flex-[1.6] !py-3 text-sm" onClick={submit}>
                <IconCheck size={15} /> {modal.mode === "add" ? "Tambahkan" : "Simpan"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {!isAdmin && (
        <p className="pb-2 text-center text-[11px] font-bold text-ink-300">
          Perubahan struktur hanya dapat dilakukan oleh Admin HR / Super Admin.
        </p>
      )}
    </div>
  );
}
