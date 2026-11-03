// Builds each vehicle once as a few merged meshes. Used by the game and by the shop's pictures.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Vehicle } from "@nearverse/economy";

const INK = "#1b2230", GLASS = "#21354a", CREAM = "#f6e6c8";
function part(size: [number, number, number], pos: [number, number, number], color: string, radius = 0.08, rotX = 0) {
  const g = new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(radius, Math.min(...size) / 2 - 0.001)).toNonIndexed();
  if (rotX) g.rotateX(rotX);
  g.translate(pos[0], pos[1], pos[2]);
  g.deleteAttribute("uv");
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}

const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.06 });
const lightMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: "#ffc98a", emissiveIntensity: 0.9, roughness: 0.4 });
const tireMat = new THREE.MeshLambertMaterial({ color: "#1c1a20", flatShading: true });
const rimMat = new THREE.MeshStandardMaterial({ color: "#d8d2c6", metalness: 0.4, roughness: 0.4 });

const tireGeo = (() => {
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.6, 0.6, 0.5, 18).rotateZ(Math.PI / 2).toNonIndexed()];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const lug = new THREE.BoxGeometry(0.54, 0.1, 0.17).toNonIndexed(); lug.rotateX(a); lug.translate(0, Math.cos(a) * 0.61, Math.sin(a) * 0.61); parts.push(lug); }
  return mergeGeometries(parts)!;
})();
const rimGeo = (() => {
  const parts: THREE.BufferGeometry[] = [];
  for (const sd of [-1, 1]) {
    parts.push(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 12).rotateZ(Math.PI / 2).translate(sd * 0.26, 0, 0).toNonIndexed());
    for (let k = 0; k < 2; k++) parts.push(new THREE.BoxGeometry(0.03, 0.08, 0.56).toNonIndexed().rotateX((k * Math.PI) / 2).translate(sd * 0.285, 0, 0));
  }
  return mergeGeometries(parts)!;
})();

export interface VehicleModel { root: THREE.Group; lean: THREE.Group; spins: THREE.Group[]; steers: THREE.Group[]; scale: number; bed: { z: number; width: number; length: number; floor: number } }
const cache = new Map<string, { body: THREE.BufferGeometry; lights: THREE.BufferGeometry; bed: VehicleModel["bed"]; wheelZ: number; wheelScale: number }>();

function geometryFor(v: Vehicle) {
  const hit = cache.get(v.id); if (hit) return hit;
  // Proportions follow stats: more capacity means a longer bed, more endurance means plating and bigger wheels.
  const bedLen = 1.3 + (v.capacity / 60) * 1.8, cabZ = 0.05 + (bedLen - 2) * 0.3, frontZ = cabZ + 1.15, rearZ = cabZ - 0.68 - bedLen;
  const length = frontZ + 0.85 - rearZ, midZ = (frontZ + 0.85 + rearZ) / 2, bedZ = rearZ + bedLen / 2;
  const armored = v.endurance >= 200, paint = v.paint;
  const b: THREE.BufferGeometry[] = [
    part([1.7, 0.28, length], [0, 0.82, midZ], INK, 0.06),
    part([1.95, 0.42, 1.65], [0, 1.15, frontZ], paint, 0.14),
    part([1.86, 0.92, 1.35], [0, 1.55, cabZ], paint, 0.16),
    part([1.5, 0.48, 0.05], [0, 1.72, cabZ + 0.69], GLASS, 0.02, -0.22),
    part([0.05, 0.46, 0.92], [-0.94, 1.72, cabZ], GLASS, 0.02), part([0.05, 0.46, 0.92], [0.94, 1.72, cabZ], GLASS, 0.02),
    part([1.95, 0.5, bedLen], [0, 1.05, bedZ], paint, 0.1),
    part([1.6, 0.06, bedLen - 0.26], [0, 1.31, bedZ], INK, 0.02),
    part([2.05, 0.3, 0.26], [0, 0.82, frontZ + 0.88], INK, 0.08),
    part([2.05, 0.3, 0.2], [0, 0.82, rearZ - 0.05], INK, 0.08),
    part([0.38, 0.14, 1.5], [-1.03, 1.28, frontZ + 0.05], INK, 0.06), part([0.38, 0.14, 1.5], [1.03, 1.28, frontZ + 0.05], INK, 0.06),
    part([0.38, 0.14, 1.5], [-1.03, 1.28, rearZ + 0.8], INK, 0.06), part([0.38, 0.14, 1.5], [1.03, 1.28, rearZ + 0.8], INK, 0.06),
  ];
  if (armored) { b.push(part([2.15, 0.6, 0.2], [0, 1.0, frontZ + 1.02], "#6f7883", 0.05), part([0.08, 0.5, 2.6], [-1.02, 1.0, cabZ - 0.2], "#6f7883", 0.03), part([0.08, 0.5, 2.6], [1.02, 1.0, cabZ - 0.2], "#6f7883", 0.03)); }
  if (v.flair > 1) for (const x of [-0.5, 0.5]) b.push(part([0.22, 0.03, 1.66], [x, 1.37, frontZ], CREAM, 0.01), part([0.22, 0.03, 1.36], [x, 2.02, cabZ], CREAM, 0.01));
  if (v.flair > 2) b.push(part([1.9, 0.08, 0.32], [0, 1.72, rearZ + 0.1], INK, 0.03), part([0.1, 0.4, 0.14], [-0.8, 1.5, rearZ + 0.1], INK, 0.03), part([0.1, 0.4, 0.14], [0.8, 1.5, rearZ + 0.1], INK, 0.03));
  const l: THREE.BufferGeometry[] = [part([0.42, 0.2, 0.05], [-0.62, 1.2, frontZ + 0.83], "#fff4c9", 0.02), part([0.42, 0.2, 0.05], [0.62, 1.2, frontZ + 0.83], "#fff4c9", 0.02), part([0.3, 0.16, 0.04], [-0.74, 1.12, rearZ - 0.02], "#d9281e", 0.02), part([0.3, 0.16, 0.04], [0.74, 1.12, rearZ - 0.02], "#d9281e", 0.02)];
  if (v.flair > 0) { b.push(part([1.5, 0.1, 0.16], [0, 2.1, cabZ + 0.4], INK, 0.03)); for (const x of [-0.54, -0.18, 0.18, 0.54]) l.push(part([0.26, 0.14, 0.05], [x, 2.1, cabZ + 0.5], "#fff4c9", 0.02)); }
  const entry = { body: mergeGeometries(b)!, lights: mergeGeometries(l)!, bed: { z: bedZ, width: 1.5, length: bedLen - 0.3, floor: 1.34 }, wheelZ: frontZ + 0.1, wheelScale: 0.92 + (v.endurance / 300) * 0.25 };
  cache.set(v.id, entry);
  return entry;
}

export function buildVehicle(v: Vehicle): VehicleModel {
  const g = geometryFor(v), root = new THREE.Group(), lean = new THREE.Group(), scale = 0.76 + 0.12 * v.size;
  root.scale.setScalar(scale);
  const body = new THREE.Mesh(g.body, bodyMat), lights = new THREE.Mesh(g.lights, lightMat);
  body.castShadow = true;
  lean.add(body, lights); root.add(lean);
  const spins: THREE.Group[] = [], steers: THREE.Group[] = [], rearZ = g.bed.z - 0.15;
  for (const [x, z, front] of [[-1.05, g.wheelZ, true], [1.05, g.wheelZ, true], [-1.05, rearZ, false], [1.05, rearZ, false]] as const) {
    const pos = new THREE.Group(), steer = new THREE.Group(), spin = new THREE.Group();
    pos.position.set(x, 0.62 * g.wheelScale, z); pos.scale.setScalar(g.wheelScale);
    const tire = new THREE.Mesh(tireGeo, tireMat); tire.castShadow = true;
    spin.add(tire, new THREE.Mesh(rimGeo, rimMat)); steer.add(spin); pos.add(steer); root.add(pos);
    spins.push(spin); if (front) steers.push(steer);
  }
  return { root, lean, spins, steers, scale, bed: g.bed };
}

let previews: Record<string, string> | null = null;
/** Pictures for the shop, drawn once with a temporary renderer that is then released. */
export function vehiclePreviews(vehicles: Vehicle[]) {
  if (previews) return previews;
  const out: Record<string, string> = {};
  try {
    const gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    gl.setSize(420, 260); gl.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#54606a", 1.6));
    const sun = new THREE.DirectionalLight("#fff0d6", 2.6); sun.position.set(-4, 8, 6); scene.add(sun);
    const cam = new THREE.PerspectiveCamera(30, 420 / 260, 0.1, 100);
    for (const v of vehicles) {
      const m = buildVehicle(v);
      m.root.rotation.y = -2.25; // a rear three-quarter view, so the bed size shows
      m.steers.forEach((s) => { s.rotation.y = 0.28; });
      scene.add(m.root);
      { const fit = 8.6 + m.scale * 2.6; cam.position.set(-fit * 0.42, fit * 0.42, fit * 0.76); cam.lookAt(0, 0.8, 0); }
      gl.render(scene, cam);
      out[v.id] = gl.domElement.toDataURL("image/png");
      scene.remove(m.root);
    }
    gl.dispose(); gl.forceContextLoss();
  } catch { /* pictures are optional: the stats still show */ }
  previews = out;
  return out;
}
