/**
 * GeofenceMap — true map (Leaflet + OpenStreetMap).
 * Edit mode: drag HQ pin + radius handle; reports drafts via onDraft.
 */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AttendanceLog } from "../lib/database";
import { destination, formatCoord, formatMeters, GeoPoint, GeoReading, haversineMeters } from "../lib/geoUtils";
import { wibShortDate, wibTime } from "../lib/format";
import { Chip } from "./bits";

export interface GeoDraft { lat: number; lon: number; radiusM: number; }

interface Props {
  hq: GeoPoint; radiusM: number; points?: AttendanceLog[]; live?: GeoReading | null;
  editable?: boolean; onDraft?: (d: GeoDraft) => void; heightClass?: string; fitPoints?: boolean;
}

const HQ_ICON = L.divIcon({ className: "", html: '<div class="hq-pin"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
const HANDLE_ICON = L.divIcon({ className: "", html: '<div class="radius-handle"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
const LIVE_ICON = L.divIcon({ className: "", html: '<div class="live-dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });

function dotIcon(status: "VERIFIED" | "REJECTED", inside: boolean): L.DivIcon {
  const color = status === "REJECTED" ? "#e5484d" : inside ? "#159a6d" : "#e0950f";
  return L.divIcon({ className: "", html: `<div class="map-dot" style="width:12px;height:12px;background:${color}"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] });
}

export default function GeofenceMap({ hq, radiusM, points = [], live = null, editable = false, onDraft, heightClass = "h-[340px]", fitPoints = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const hqRef = useRef<L.Marker | null>(null);
  const handleRef = useRef<L.Marker | null>(null);
  const fitRef = useRef(true);
  const radiusLatest = useRef(radiusM);
  radiusLatest.current = radiusM;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, { zoomControl: true, attributionControl: true }).setView([hq.lat, hq.lon], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    fitRef.current = true;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => {
      ro.disconnect(); map.remove();
      mapRef.current = null; layersRef.current = null; hqRef.current = null; handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hqRef.current) { hqRef.current.remove(); hqRef.current = null; }
    if (handleRef.current) { handleRef.current.remove(); handleRef.current = null; }
    if (!editable) return;

    const hqMarker = L.marker([hq.lat, hq.lon], { icon: HQ_ICON, draggable: true, zIndexOffset: 500 }).addTo(map);
    const handlePos = destination(hq, 90, radiusM);
    const handle = L.marker([handlePos.lat, handlePos.lon], { icon: HANDLE_ICON, draggable: true, zIndexOffset: 600 }).addTo(map);
    hqRef.current = hqMarker;
    handleRef.current = handle;

    hqMarker.on("drag", () => {
      const p = hqMarker.getLatLng();
      const cur = radiusLatest.current;
      const hp = destination({ lat: p.lat, lon: p.lng }, 90, cur);
      handle.setLatLng([hp.lat, hp.lon]);
      onDraft?.({ lat: p.lat, lon: p.lng, radiusM: cur });
    });
    handle.on("drag", () => {
      const p = hqMarker.getLatLng();
      const hp = handle.getLatLng();
      const dist = Math.round(haversineMeters({ lat: p.lat, lon: p.lng }, { lat: hp.lat, lon: hp.lng }));
      onDraft?.({ lat: p.lat, lon: p.lng, radiusM: Math.min(1000, Math.max(20, dist)) });
    });

    return () => { hqMarker.remove(); handle.remove(); hqRef.current = null; handleRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  useEffect(() => {
    if (!editable || !hqRef.current || !handleRef.current) return;
    const p = hqRef.current.getLatLng();
    const hp = destination({ lat: p.lat, lon: p.lng }, 90, radiusM);
    handleRef.current.setLatLng([hp.lat, hp.lon]);
  }, [radiusM, editable]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;
    layers.clearLayers();
    L.circle([hq.lat, hq.lon], { radius: radiusM, color: "#159a6d", weight: 2, dashArray: "7 5", fillColor: "#159a6d", fillOpacity: 0.1 }).addTo(layers);
    for (const p of points) {
      const inside = p.distanceM <= radiusM;
      L.marker([p.lat, p.lon], { icon: dotIcon(p.status, inside) })
        .bindTooltip(`<b>${p.name}</b> · ${p.type}${p.status === "REJECTED" ? " · DITOLAK" : ""}<br/>${wibShortDate(new Date(p.ts))} ${wibTime(new Date(p.ts))} · ${formatMeters(p.distanceM)}`)
        .addTo(layers);
    }
    if (live && (live.status === "locked" || live.status === "sim")) {
      L.circle([live.lat, live.lon], { radius: live.accuracy, color: "#2b9fe0", weight: 1, fillColor: "#2b9fe0", fillOpacity: 0.08 }).addTo(layers);
      L.marker([live.lat, live.lon], { icon: LIVE_ICON, zIndexOffset: 400 }).addTo(layers);
    }
    if (fitRef.current) {
      fitRef.current = false;
      const pts: L.LatLngExpression[] = [[hq.lat, hq.lon]];
      if (fitPoints) for (const p of points) pts.push([p.lat, p.lon]);
      if (live && (live.status === "locked" || live.status === "sim")) pts.push([live.lat, live.lon]);
      const bounds = L.latLngBounds(pts).pad(0.3);
      const rTop = destination(hq, 0, radiusM);
      const rBottom = destination(hq, 180, radiusM);
      bounds.extend([rTop.lat, rTop.lon]);
      bounds.extend([rBottom.lat, rBottom.lon]);
      map.fitBounds(bounds, { maxZoom: 17 });
    }
  }, [hq.lat, hq.lon, radiusM, points, live, fitPoints]);

  return (
    <div className="space-y-2.5">
      <div className={`card relative overflow-hidden ${heightClass}`}>
        <div ref={containerRef} className="absolute inset-0" />
        {editable && (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex justify-center">
            <span className="rounded-full bg-ink-950/80 px-3.5 py-1.5 text-[11px] font-extrabold text-white shadow-lg backdrop-blur">
              <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-sun-400 align-middle" />
              Geser pin & pegangan putih untuk mengatur area
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone="ok"><span className="h-2 w-2 rounded-full bg-ok-500" /> dalam radius</Chip>
        <Chip tone="warn"><span className="h-2 w-2 rounded-full bg-warn-500" /> di luar radius</Chip>
        <Chip tone="danger"><span className="h-2 w-2 rounded-full bg-danger-500" /> ditolak</Chip>
        <Chip tone="sky"><span className="h-2 w-2 rounded-full bg-sky-500" /> posisi live</Chip>
        <Chip tone="ink">{formatCoord(hq)} · {radiusM} m</Chip>
      </div>
    </div>
  );
}
