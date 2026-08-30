/**
 * Geofence radar — SVG map of HQ radius, distance rings, sweep beam,
 * check-in plots (selectable) and the live pulsing position.
 */
import { useMemo, useState } from "react";
import { AttendanceLog } from "../lib/database";
import { bearingDeg, GeoPoint, GeoReading, haversineMeters, formatMeters, formatCoord } from "../lib/geoUtils";
import { wibShortDate, wibTime } from "../lib/format";
import { Chip, InitialsAvatar } from "./bits";
import { IconPin } from "./icons";

interface Props {
  hq: GeoPoint;
  radiusM: number;
  points: AttendanceLog[];
  live: GeoReading | null;
}

const SIZE = 320;
const C = SIZE / 2;

export default function Radar({ hq, radiusM, points, live }: Props) {
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<AttendanceLog | null>(null);

  const maxDist = useMemo(() => {
    let m = radiusM * 1.6;
    for (const p of points) m = Math.max(m, p.distanceM * 1.25);
    if (live && (live.status === "locked" || live.status === "sim")) {
      m = Math.max(m, haversineMeters(live, hq) * 1.25);
    }
    return m;
  }, [points, live, hq, radiusM]);

  const scale = ((SIZE / 2 - 26) / maxDist) * zoom;
  const toXY = (pt: GeoPoint): [number, number] => {
    const d = haversineMeters(hq, pt);
    const b = (bearingDeg(hq, pt) * Math.PI) / 180;
    return [C + Math.sin(b) * d * scale, C - Math.cos(b) * d * scale];
  };
  const rPx = radiusM * scale;

  const livePos: [number, number] | null =
    live && (live.status === "locked" || live.status === "sim") ? toXY(live) : null;
  const liveDist = live && (live.status === "locked" || live.status === "sim") ? haversineMeters(live, hq) : null;

  return (
    <div className="space-y-3">
      <div className="card relative overflow-hidden p-3">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto block w-full max-w-[380px]">
          <rect x="0" y="0" width={SIZE} height={SIZE} rx="20" fill="#101826" />
          <g stroke="rgba(122,143,196,0.14)" strokeWidth="1">
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <circle key={f} cx={C} cy={C} r={(SIZE / 2 - 20) * f} fill="none" />
            ))}
            <line x1={C} y1="14" x2={C} y2={SIZE - 14} />
            <line x1="14" y1={C} x2={SIZE - 14} y2={C} />
          </g>

          <g className="radar-sweep">
            <path
              d={`M ${C} ${C} L ${C + (SIZE / 2 - 20) * Math.cos(-1.15)} ${C + (SIZE / 2 - 20) * Math.sin(-1.15)} A ${SIZE / 2 - 20} ${SIZE / 2 - 20} 0 0 1 ${C + (SIZE / 2 - 20) * Math.cos(-0.55)} ${C + (SIZE / 2 - 20) * Math.sin(-0.55)} Z`}
              fill="url(#sweepGrad)" opacity="0.55"
            />
          </g>
          <defs>
            <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--color-sun-500, #f07300)" stopOpacity="0.5" />
              <stop offset="1" stopColor="var(--color-sun-500, #f07300)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <circle cx={C} cy={C} r={Math.max(8, rPx)} fill="rgba(21,154,109,0.10)" stroke="var(--color-ok-500, #159a6d)" strokeWidth="2" strokeDasharray="7 5" />
          <text x={C} y={C - Math.max(8, rPx) - 7} textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#7fdcb0">{radiusM} m</text>

          <circle cx={C} cy={C} r="9" fill="var(--color-sun-500, #f07300)" />
          <circle cx={C} cy={C} r="3.5" fill="#101826" />
          <text x={C} y={C + 24} textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#ffc684">HQ GUDANG</text>

          {points.map((p) => {
            const [x, y] = toXY({ lat: p.lat, lon: p.lon });
            const ok = p.distanceM <= radiusM;
            const color = p.status === "REJECTED" ? "var(--color-danger-500, #e5484d)" : ok ? "var(--color-ok-300, #7fdcb0)" : "var(--color-warn-300, #f7cf7e)";
            return (
              <g key={p.id} className="cursor-pointer" onClick={() => setSel(p)}>
                <circle cx={x} cy={y} r={sel?.id === p.id ? 9 : 6} fill={color} stroke="#101826" strokeWidth="2" opacity="0.95" />
                {sel?.id === p.id && <circle cx={x} cy={y} r="13" fill="none" stroke={color} strokeWidth="1.5" />}
              </g>
            );
          })}

          {livePos && (
            <g>
              <circle className="radar-pulse" cx={livePos[0]} cy={livePos[1]} r="10" fill="none" stroke="var(--color-sky-300, #8fd0f7)" strokeWidth="2" />
              <circle cx={livePos[0]} cy={livePos[1]} r="6" fill="var(--color-sky-300, #8fd0f7)" stroke="#101826" strokeWidth="2" />
            </g>
          )}
        </svg>

        <div className="absolute right-3 top-3 flex flex-col gap-1.5">
          {[
            { l: "+", f: () => setZoom((z) => Math.min(3, z + 0.5)) },
            { l: "−", f: () => setZoom((z) => Math.max(0.5, z - 0.5)) },
          ].map((b) => (
            <button
              key={b.l} onClick={b.f}
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl bg-white/10 font-display text-lg font-bold text-white backdrop-blur transition hover:bg-white/20 active:scale-90"
              aria-label={b.l === "+" ? "Perbesar" : "Perkecil"}
            >
              {b.l}
            </button>
          ))}
        </div>
      </div>

      {sel ? (
        <div className="card anim-fade-up flex items-center gap-3 p-3">
          <InitialsAvatar name={sel.name} seedKey={sel.staffId} size="h-10 w-10 text-[13px]" rounded="rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink-900">
              <span className="truncate">{sel.name}</span>
              <Chip tone={sel.status === "REJECTED" ? "danger" : "ok"} className="!px-1.5 !py-0.5 !text-[9px]">
                {sel.status === "REJECTED" ? "DITOLAK" : sel.type}
              </Chip>
            </p>
            <p className="text-[11px] font-semibold text-ink-400">
              {wibShortDate(new Date(sel.ts))} · {wibTime(new Date(sel.ts))} · {formatMeters(sel.distanceM)} dari HQ
            </p>
          </div>
          <button onClick={() => setSel(null)} className="cursor-pointer rounded-lg p-1.5 text-ink-300 hover:bg-ink-50" aria-label="Tutup detail">✕</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="teal"><IconPin size={11} /> {formatCoord(hq)}</Chip>
          {liveDist !== null && (
            <Chip tone={liveDist <= radiusM ? "ok" : "danger"}>
              Anda {formatMeters(liveDist)}{live?.simulated ? " · SIM" : ""}
            </Chip>
          )}
          <Chip tone="ink">{points.length} titik absen</Chip>
        </div>
      )}
    </div>
  );
}
