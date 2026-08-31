/** OrgChart — recursive vertical chart with connector lines. */
import { useMemo } from "react";
import { Employee, OrgNode } from "../lib/database";
import { Chip, InitialsAvatar, Tone } from "./bits";
import { IconEdit, IconPlus, IconTrash } from "./icons";

interface Props {
  nodes: OrgNode[]; employees: Employee[]; editable: boolean;
  onAddChild?: (parentId: string) => void; onEdit?: (node: OrgNode) => void;
  onDelete?: (node: OrgNode) => void; armedDeleteId?: string | null;
}

const DEPT_TONE: Record<string, Tone> = { Gudang: "sun", HR: "warn", Direksi: "ink" };

function NodeCard({ node, emp, editable, depth, onAddChild, onEdit, onDelete, armed }: {
  node: OrgNode; emp: Employee | null; editable: boolean; depth: number;
  onAddChild?: (id: string) => void; onEdit?: (n: OrgNode) => void; onDelete?: (n: OrgNode) => void; armed: boolean;
}) {
  const name = node.staffId ? emp?.name ?? node.name ?? "—" : node.name ?? "—";
  const dept = emp?.department ?? null;
  const tone = dept ? DEPT_TONE[dept] ?? "ink" : "ink";
  return (
    <div className="anim-fade-up flex flex-col items-center" style={{ animationDelay: `${Math.min(depth * 90, 360)}ms` }}>
      <div className={`card card-press relative w-44 px-3 pb-2.5 pt-3 text-center transition-shadow ${depth === 0 ? "border-sun-300 shadow-[0_14px_34px_rgba(240,115,0,0.18)]" : ""}`}>
        {depth === 0 && (
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-sun-400 to-sun-600 px-2.5 py-0.5 text-[8.5px] font-extrabold tracking-[0.14em] text-white shadow">PUCUK PIMPINAN</span>
        )}
        <div className="flex justify-center">
          <InitialsAvatar name={name} photo={emp?.photo ?? null} seedKey={node.staffId ?? node.id} size="h-12 w-12 text-[15px]" rounded="rounded-2xl" />
        </div>
        <p className="mt-2 font-display text-[13px] leading-tight font-extrabold text-ink-900">{node.title}</p>
        <p className="mt-0.5 truncate text-[11px] font-bold text-ink-500">{name}</p>
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
          {dept && <Chip tone={tone} className="!px-1.5 !py-0.5 !text-[8.5px]">{dept.toUpperCase()}</Chip>}
          {node.staffId ? <Chip tone="ok" className="!px-1.5 !py-0.5 !text-[8.5px]">TERDAFTAR</Chip> : <Chip tone="ink" className="!px-1.5 !py-0.5 !text-[8.5px]">POSISI</Chip>}
        </div>
        {node.note && <p className="mt-1.5 line-clamp-2 text-[9.5px] leading-snug font-semibold text-ink-300">{node.note}</p>}
      </div>
      {editable && (
        <div className="mt-1.5 flex items-center gap-1">
          <button onClick={() => onAddChild?.(node.id)} className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg bg-ok-100 text-ok-600 transition hover:bg-ok-500 hover:text-white active:scale-90" title="Tambah bawahan" aria-label={`Tambah bawahan ${node.title}`}><IconPlus size={13} /></button>
          <button onClick={() => onEdit?.(node)} className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg bg-sky-100 text-sky-600 transition hover:bg-sky-500 hover:text-white active:scale-90" title="Edit posisi" aria-label={`Edit ${node.title}`}><IconEdit size={13} /></button>
          <button onClick={() => onDelete?.(node)} className={`grid h-7 w-7 cursor-pointer place-items-center rounded-lg transition active:scale-90 ${armed ? "anim-pop bg-danger-500 text-white" : "bg-danger-100 text-danger-600 hover:bg-danger-500 hover:text-white"}`} title={armed ? "Ketuk lagi untuk hapus" : "Hapus posisi"} aria-label={`Hapus ${node.title}`}><IconTrash size={13} /></button>
        </div>
      )}
    </div>
  );
}

export default function OrgChart({ nodes, employees, editable, onAddChild, onEdit, onDelete, armedDeleteId }: Props) {
  const empById = useMemo(() => new Map(employees.map((e) => [e.staffId, e])), [employees]);
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, OrgNode[]>();
    for (const n of nodes) { const list = m.get(n.parentId) ?? []; list.push(n); m.set(n.parentId, list); }
    for (const list of m.values()) list.sort((a, b) => a.createdAt - b.createdAt);
    return m;
  }, [nodes]);

  const roots = childrenOf.get(null) ?? [];
  const renderSubtree = (node: OrgNode, depth: number): React.ReactNode => {
    const kids = childrenOf.get(node.id) ?? [];
    return (
      <div key={node.id} className="flex flex-col items-center">
        <NodeCard node={node} emp={node.staffId ? empById.get(node.staffId) ?? null : null} editable={editable} depth={depth} onAddChild={onAddChild} onEdit={onEdit} onDelete={onDelete} armed={armedDeleteId === node.id} />
        {kids.length > 0 && (
          <>
            <div className="h-5 w-px bg-ink-200" />
            <div className="relative flex items-start justify-center">
              {kids.length > 1 && (
                <div className="absolute top-0 h-px bg-ink-200" style={{ left: `calc(${(100 / kids.length) * 0.5}%)`, right: `calc(${(100 / kids.length) * 0.5}%)` }} />
              )}
              {kids.map((k) => (
                <div key={k.id} className="flex flex-col items-center px-2 pt-0">
                  <div className="h-5 w-px bg-ink-200" />
                  {renderSubtree(k, depth + 1)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  if (roots.length === 0) return null;
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-start justify-center gap-10 px-4 pt-4">
        {roots.map((r) => renderSubtree(r, 0))}
      </div>
    </div>
  );
}
