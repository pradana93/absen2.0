/**
 * Face engine — 128-D descriptors via face-api.js (euclidean distance,
 * accept Δ ≤ threshold, default 0.50). Offline → dHash "lite" fallback.
 */
export type EngineStatus = "boot" | "ai" | "lite";
type FaceApi = typeof import("@vladmandic/face-api");

let api: FaceApi | null = null;
let status: EngineStatus = "boot";
const listeners = new Set<(s: EngineStatus) => void>();

export function onEngineStatus(cb: (s: EngineStatus) => void): () => void {
  listeners.add(cb); cb(status);
  return () => { listeners.delete(cb); };
}
function setStatus(s: EngineStatus) { status = s; listeners.forEach((cb) => cb(s)); }

const WEIGHT_MIRRORS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model",
  "https://raw.githubusercontent.com/vladmandic/face-api/master/model",
];

async function getFaceApi(): Promise<FaceApi> {
  if (!api) api = await import("@vladmandic/face-api");
  return api;
}

async function loadWeights(): Promise<boolean> {
  const a = await getFaceApi();
  for (const base of WEIGHT_MIRRORS) {
    try {
      await Promise.all([
        a.nets.tinyFaceDetector.loadFromUri(base),
        a.nets.faceLandmark68Net.loadFromUri(base),
        a.nets.faceRecognitionNet.loadFromUri(base),
      ]);
      return true;
    } catch { /* next mirror */ }
  }
  return false;
}

export async function initFaceEngine(): Promise<EngineStatus> {
  if (status !== "boot") return status;
  try { setStatus((await loadWeights()) ? "ai" : "lite"); } catch { setStatus("lite"); }
  return status;
}

export interface FaceSignature { descriptor: number[] | null; hash: string | null; faceFound: boolean; faceScore: number; }
export interface MatchResult { staffId: string; distance: number; }

function hamming(a: string, b: string): number {
  let d = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
  return d / Math.max(1, n);
}

function downscale(canvas: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  c.getContext("2d")!.drawImage(canvas, 0, 0, size, size);
  return c;
}

function computeDHash(canvas: HTMLCanvasElement, w: number, h: number): string {
  const c = document.createElement("canvas");
  c.width = w + 1; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0, w + 1, h);
  const data = ctx.getImageData(0, 0, w + 1, h).data;
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  let out = "";
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out += gray[y * (w + 1) + x] > gray[y * (w + 1) + x + 1] ? "1" : "0";
  return out;
}

export function quickHash(canvas: HTMLCanvasElement): string {
  return computeDHash(downscale(canvas, 32), 32, 32);
}

export async function extractSignature(canvas: HTMLCanvasElement): Promise<FaceSignature> {
  const hash = computeDHash(downscale(canvas, 32), 32, 32);
  if (status !== "ai") return { descriptor: null, hash, faceFound: false, faceScore: 0 };
  try {
    const a = await getFaceApi();
    const res = await a.detectSingleFace(canvas, new a.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.25 }))
      .withFaceLandmarks().withFaceDescriptor();
    if (!res) return { descriptor: null, hash, faceFound: false, faceScore: 0 };
    return { descriptor: Array.from(res.descriptor), hash, faceFound: true, faceScore: res.detection.score };
  } catch {
    return { descriptor: null, hash, faceFound: false, faceScore: 0 };
  }
}

export interface RegisteredFace { staffId: string; descriptor: number[] | null; hash: string | null; }

export function identifyBest(sig: FaceSignature, registry: RegisteredFace[], threshold: number): { match: MatchResult; kind: "ai" | "lite" } | null {
  let best: MatchResult | null = null;
  if (sig.descriptor && status === "ai") {
    for (const r of registry) {
      if (!r.descriptor || r.descriptor.length !== 128) continue;
      let sum = 0;
      for (let i = 0; i < 128; i++) { const d = sig.descriptor[i] - r.descriptor[i]; sum += d * d; }
      const dist = Math.sqrt(sum);
      if (!best || dist < best.distance) best = { staffId: r.staffId, distance: dist };
    }
    if (best && best.distance <= threshold) return { match: best, kind: "ai" };
    if (best) return null;
  }
  if (sig.hash) {
    const liteThreshold = Math.min(0.18, threshold * 0.36);
    for (const r of registry) {
      if (!r.hash) continue;
      const dist = hamming(sig.hash, r.hash);
      if (!best || dist < best.distance) best = { staffId: r.staffId, distance: dist };
    }
    if (best && best.distance <= liteThreshold) return { match: best, kind: "lite" };
  }
  return null;
}
