// Shared world layout and helpers. Physics runs on flat ground inside DRIVE_RADIUS; beyond it the island falls into the sea.
import * as THREE from "three";
import { rules as c } from "@nearverse/economy";

export const HOME: [number, number] = [0, 0];
export const PLOT: [number, number] = [0, -14];
export const DRIVE_RADIUS = 1000;
export const WORLD_SIZE = 2240; // the painted ground maps cover -1120..1120
export const truck = { pos: new THREE.Vector3(0, 2, 0), yaw: 0, speed: 0, cameraYaw: 0 };
export const keys = new Set<string>();
/** How far back the camera sits: 1 is normal, higher is a wider view. */
export const view = { zoom: 1 };
/** The phone thumb stick. x is the vehicle's right, y is its forward, each from -1 to 1. */
export const stick = { x: 0, y: 0 };
/** Written straight to the page, so loading a spot doesn't re-render the interface every frame. */
export const gatherBar: { el: HTMLElement | null; note: HTMLElement | null } = { el: null, note: null };

export const PAL = {
  bark: "#5a3a2b", plank: "#b9794a", plankDark: "#7d4c30", stone: "#a0988e", stoneDark: "#6f6a70", iron: "#3d4656", paint: "#c8372b", ink: "#1b2230", cream: "#f6e6c8",
  lamp: "#ffd27a", awning: ["#2f6db0", "#c8372b", "#2e7d57"],
};
export const ITEM_COLOR: Record<string, string> = { ...Object.fromEntries(c.items.map((it) => [it.id, it.color])), fuel: "#2f8f7e" };

/** Coastline radius at an angle. The same formula is in the ground and ocean shaders. */
export const coast = (a: number) => 1030 + Math.sin(a * 3 + 1.2) * 12 + Math.sin(a * 7 + 0.4) * 7 + Math.sin(a * 13 + 2.2) * 4;
export const COAST_GLSL = "float coastR(float a){ return 1030.+sin(a*3.+1.2)*12.+sin(a*7.+.4)*7.+sin(a*13.+2.2)*4.; }";

const smooth = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const wobble = (x: number, z: number) => Math.sin(x * 0.0065 + Math.sin(z * 0.004) * 2) * 50 + Math.sin(z * 0.008 + 1.3) * 38;
export const REGIONS = [{ name: "Snowfields", x: 30, z: 770 }, { name: "Desert", x: -620, z: -430 }, { name: "City", x: 630, z: -230 }, { name: "Forest", x: -420, z: 300 }, { name: "Wilds", x: 120, z: -760 }];
/** How much a spot belongs to each region. Anywhere else is forest and meadow. */
export function biomeAt(x: number, z: number) {
  const w = wobble(x, z);
  return {
    snow: 1 - smooth(300, 430, Math.hypot(x - 30, z - 770) + w),
    desert: 1 - smooth(340, 470, Math.hypot(x + 620, z + 430) + w),
    city: 1 - smooth(290, 360, Math.hypot(x - 630, z + 230) + w * 0.4),
  };
}
export const biomeName = (x: number, z: number) => {
  const b = biomeAt(x, z);
  if (b.snow > 0.5) return "Snowfields";
  if (b.desert > 0.5) return "Desert";
  if (b.city > 0.5) return "City";
  if (Math.hypot(x, z) < 40) return "Home";
  return z < -520 ? "Wilds" : "Forest";
};

export function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

export interface Place { x: number; z: number }
const HUBS: Place[] = [{ x: 0, z: 0 }, { x: 450, z: -180 }, { x: 50, z: 520 }, { x: -430, z: -340 }, { x: -380, z: 200 }, { x: 80, z: -480 }];
// Roads reach merchants and stall locations. They never lead to resources: those have to be found.
const stops: Place[] = [...c.merchants, ...c.lots];
export const ROADS: [Place, Place][] = [
  ...HUBS.slice(1).map((h) => [HUBS[0], h] as [Place, Place]),
  ...stops.map((s) => {
    let best = HUBS[0], d = 1e9;
    for (const h of HUBS) { const k = Math.hypot(h.x - s.x, h.z - s.z); if (k < d) { d = k; best = h; } }
    return [best, s] as [Place, Place];
  }),
];
const distToSeg = (x: number, z: number, a: Place, b: Place) => {
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
};
/** True where nothing solid should be placed, so roads and work areas stay drivable. */
export function reserved(x: number, z: number, margin = 3) {
  if (Math.hypot(x, z) < 34 + margin) return true;
  for (const s of stops) if (Math.hypot(x - s.x, z - s.z) < 11 + margin) return true;
  for (const n of c.nodes) if (Math.abs(x - n.x) < 9 + margin && Math.abs(z - n.z) < 9 + margin) return true;
  for (const [a, b] of ROADS) if (distToSeg(x, z, a, b) < 4 + margin) return true;
  return false;
}

/** Fast "is anything too close" lookups while placing thousands of objects. */
export function spacing(gap: number) {
  const cells = new Map<string, Place[]>();
  const key = (x: number, z: number) => `${Math.floor(x / gap)},${Math.floor(z / gap)}`;
  return {
    free(x: number, z: number) {
      const cx = Math.floor(x / gap), cz = Math.floor(z / gap);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of cells.get(`${cx + i},${cz + j}`) ?? []) if (Math.hypot(p.x - x, p.z - z) < gap) return false;
      return true;
    },
    add(x: number, z: number) { const k = key(x, z); const l = cells.get(k); if (l) l.push({ x, z }); else cells.set(k, [{ x, z }]); },
  };
}

export function canvasText(text: string, opts: { bg: string; fg: string; w?: number; h?: number; size?: number; planks?: boolean }) {
  const { w = 384, h = 96, size = 54 } = opts;
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d")!; g.fillStyle = opts.bg; g.fillRect(0, 0, w, h);
  if (opts.planks) { g.strokeStyle = "rgba(40,20,10,.35)"; g.lineWidth = Math.max(2, h / 48); const n = 4; for (let i = 1; i < n; i++) { g.beginPath(); g.moveTo(0, (h * i) / n); g.lineTo(w, (h * i) / n); g.stroke(); } }
  g.fillStyle = opts.fg; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `${size}px "Bowlby One", Impact, sans-serif`;
  g.fillText(text, w / 2, h / 2 + size * 0.04, w - 16);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
