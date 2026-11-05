"use client";
// Wooden bridges, tunnels through hills, the railway with its stations, and fuel stations.
// Each is one merged mesh that only draws near the truck, so a whole bridge costs one draw call.
import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Instances, Near, type Spot } from "./Instances";
import { BRIDGE_HEIGHT, BRIDGE_RAMP, PAL, biomeAt, bridgeLength, canvasText, seeded } from "./world";
import { useStaticColliders, type Solid } from "./colliders";
import { seeThrough } from "./effects";
import { LAYOUT } from "./layout";

const paint = seeThrough(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
const plainPaint = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const glow = new THREE.MeshBasicMaterial({ color: "#ffd98a" });

/** A coloured box in a list, ready to merge. Position is its centre. */
function box(list: THREE.BufferGeometry[], sx: number, sy: number, sz: number, x: number, y: number, z: number, color: string, pitch = 0, tiltZ = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
  if (pitch) g.rotateX(pitch);
  if (tiltZ) g.rotateZ(tiltZ);
  g.translate(x, y, z);
  g.deleteAttribute("uv");
  const col = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  list.push(g);
}
const merged = (list: THREE.BufferGeometry[]) => mergeGeometries(list)!;
/** World position of a point given along and across a thing facing `yaw`. */
const place = (x: number, z: number, yaw: number, side: number, along: number) => ({ x: x + Math.cos(yaw) * side + Math.sin(yaw) * along, z: z - Math.sin(yaw) * side + Math.cos(yaw) * along });
const solidAt = (x: number, z: number, yaw: number, side: number, along: number, y: number, hx: number, hy: number, hz: number): Solid => { const p = place(x, z, yaw, side, along); return { kind: "box", x: p.x, y, z: p.z, hx, hy, hz, ry: yaw }; };

function Bridge({ x, z, yaw, w }: { x: number; z: number; yaw: number; w: number }) {
  const { geo, rails } = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [], half = bridgeLength(w) / 2, h = BRIDGE_HEIGHT, r = seeded(Math.abs(x * 7 + z));
    const plank = () => ["#a8703f", "#96623a", "#b47c48", "#8c5a34"][Math.floor(r() * 4)];
    for (let a = -half; a < half; a += 0.72) box(parts, 9.2, 0.14, 0.66, 0, h - 0.07, a + 0.36, plank());
    const angle = Math.atan2(h, BRIDGE_RAMP), run = Math.hypot(h, BRIDGE_RAMP);
    for (const s of [1, -1]) for (let k = 0; k < run; k += 0.72) {
      const t = (k + 0.36) / run;
      box(parts, 9.2, 0.14, 0.66, 0, h * (1 - t) - 0.07, s * (half + BRIDGE_RAMP * t), plank(), s * angle);
    }
    for (const sx of [-3.2, 0, 3.2]) box(parts, 0.3, 0.2, half * 2, sx, h - 0.24, 0, PAL.plankDark); // beams
    for (const side of [-4.5, 4.5]) {
      box(parts, 0.16, 0.16, half * 2 + 1, side, h + 1, 0, PAL.plank); box(parts, 0.12, 0.12, half * 2 + 1, side, h + 0.55, 0, PAL.plank);
      for (let a = -half; a <= half + 0.01; a += half / 2) { box(parts, 0.26, 1.2 + h, 0.26, side, (1.2 + h) / 2, a, PAL.plankDark); }
    }
    return { geo: merged(parts), rails: [-4.6, 4.6].map((side) => solidAt(x, z, yaw, side, 0, h + 0.5, 0.15, 0.7, half)) };
  }, [x, z, yaw, w]);
  useStaticColliders(rails, null);
  return <Near x={x} z={z} radius={170}><mesh geometry={geo} material={plainPaint} position={[x, 0, z]} rotation={[0, yaw, 0]} castShadow receiveShadow /></Near>;
}

const LEN = 40, WIDE = 34, TALL = 15, CORRIDOR = 5.6, ROOF = 6.5;

function Tunnel({ x, z, yaw }: { x: number; z: number; yaw: number }) {
  const { hill, inside, lamps, solids } = useMemo(() => {
    const b = biomeAt(x, z), low = new THREE.Color(b.snow > 0.5 ? "#c5d2dc" : b.desert > 0.5 ? "#b08a55" : "#4a6330"), high = new THREE.Color(b.snow > 0.5 ? "#f2f6fa" : b.desert > 0.5 ? "#c9a56b" : "#67804a"), rock = new THREE.Color("#7c7670");
    const N = 40, pos: number[] = [], col: number[] = [], r = seeded(Math.abs(x + z * 3));
    const bump = Array.from({ length: (N + 1) * (N + 1) }, () => r() * 0.9);
    const height = (i: number, j: number) => {
      const s = (i / N - 0.5) * 2 * WIDE, a = (j / N - 0.5) * 2 * LEN, q = 1 - (s / WIDE) ** 2 - (a / LEN) ** 2;
      if (q <= 0) return null;
      const y = TALL * Math.sqrt(q) + bump[j * (N + 1) + i];
      return Math.abs(s) < CORRIDOR && y < ROOF ? null : y; // the road's way in stays open
    };
    const at = (i: number, j: number, y: number) => [(i / N - 0.5) * 2 * WIDE, y, (j / N - 0.5) * 2 * LEN];
    const tint = new THREE.Color();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([u, w]) => ({ u, w, y: height(u, w) }));
      if (v.some((p) => p.y === null)) continue;
      for (const k of [0, 3, 1, 1, 3, 2]) {
        const p = v[k]; pos.push(...at(p.u, p.w, p.y!));
        tint.copy(low).lerp(high, Math.min(1, p.y! / TALL)).lerp(rock, r() * 0.18); col.push(tint.r, tint.g, tint.b);
      }
    }
    const hill = new THREE.BufferGeometry();
    hill.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); hill.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); hill.computeVertexNormals();
    const parts: THREE.BufferGeometry[] = [], len = 37;
    box(parts, CORRIDOR * 2 + 2, 0.06, len * 2, 0, 0.04, 0, "#26282c"); // the road inside
    for (const side of [-1, 1]) box(parts, 1, 6.5, len * 2, side * (CORRIDOR + 0.5), 3.25, 0, "#55504b");
    for (const end of [-1, 1]) {
      for (const side of [-1, 1]) box(parts, 1.6, 7.4, 1.8, side * (CORRIDOR + 0.6), 3.7, end * len, "#8d867c");
      box(parts, CORRIDOR * 2 + 3, 1.5, 1.8, 0, 7.2, end * len, "#8d867c");
    }
    box(parts, CORRIDOR * 2 + 2, 0.5, len * 2, 0, 6.6, 0, "#3d3a37");
    const glowParts: THREE.BufferGeometry[] = [];
    for (let a = -len + 4; a < len; a += 9) for (const side of [-1, 1]) box(glowParts, 0.2, 0.25, 1.4, side * (CORRIDOR - 0.1), 4.7, a, "#ffffff");
    const solids: Solid[] = [-1, 1].flatMap((side) => [solidAt(x, z, yaw, side * (CORRIDOR + 11), 0, 4, 11, 4, len)]);
    return { hill, inside: merged(parts), lamps: merged(glowParts), solids };
  }, [x, z]);
  const hillMat = useMemo(() => seeThrough(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })), []);
  useStaticColliders(solids, "hillside");
  return (
    <Near x={x} z={z} radius={300}>
      <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
        <mesh geometry={hill} material={hillMat} castShadow />
        <mesh geometry={inside} material={paint} />
        <mesh geometry={lamps} material={glow} />
      </group>
    </Near>
  );
}

function Station({ x, z, yaw, name, train }: { x: number; z: number; yaw: number; name: string; train: boolean }) {
  const { geo, solids, sign } = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [], solids: Solid[] = [];
    // Platform beside the track, with a canopy, and the station house behind it.
    box(parts, 6, 1, 44, 6, 0.5, 0, "#b5ada0");
    box(parts, 0.3, 0.04, 44, 3.3, 1.02, 0, "#e8c64a");
    box(parts, 12, 7, 18, 15, 3.5, 0, "#c79a72");
    box(parts, 13, 0.5, 19, 15, 7.2, 0, "#6d4436");
    box(parts, 1.6, 3, 0.15, 9, 2.5, 0, "#3f2d24"); // door
    for (const a of [-6, 6]) box(parts, 2.4, 2, 0.15, 9, 3.4, a, "#3d5668");
    box(parts, 5.4, 0.25, 26, 6, 5, 0, "#54606e");
    for (let a = -12; a <= 12; a += 6) box(parts, 0.3, 4, 0.3, 7.6, 3, a, "#3d4656");
    for (const a of [-16, -6, 6, 16]) { box(parts, 1.8, 0.2, 0.5, 6.6, 1.5, a, PAL.plank); box(parts, 0.2, 0.5, 0.5, 7.4, 1.8, a, PAL.plank); }
    solids.push(solidAt(x, z, yaw, 6, 0, 0.5, 3, 0.5, 22), solidAt(x, z, yaw, 15, 0, 3.5, 6, 3.5, 9));
    if (train) {
      const trainX = 0;
      box(parts, 3, 3.1, 11, trainX, 2.25, 15, "#b5352a"); box(parts, 3.05, 0.5, 11.05, trainX, 3, 15, "#f1e6d0"); box(parts, 2.4, 1.2, 0.2, trainX, 3.1, 20.6, "#2b3a48"); box(parts, 3.3, 0.5, 11.4, trainX, 0.85, 15, "#23262b");
      for (const a of [-1.5, -14.5]) { box(parts, 3, 2.9, 12, trainX, 2.15, a, "#2f6db0"); box(parts, 3.05, 0.7, 12.05, trainX, 2.6, a, "#aac7dd"); box(parts, 3.3, 0.5, 12.4, trainX, 0.65, a, "#23262b"); }
      solids.push(solidAt(x, z, yaw, trainX, 2, 2, 1.6, 2, 24));
    }
    return { geo: merged(parts), solids, sign: canvasText(name, { bg: "#23405a", fg: "#ffffff", w: 512, h: 96, size: 46 }) };
  }, [x, z, yaw, name, train]);
  useStaticColliders(solids, "station");
  return (
    <Near x={x} z={z} radius={260}>
      <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
        <mesh geometry={geo} material={paint} castShadow receiveShadow />
        <mesh position={[8.9, 6, 0]} rotation={[0, -Math.PI / 2, 0]}><planeGeometry args={[11, 1.6]} /><meshBasicMaterial map={sign} /></mesh>
      </group>
    </Near>
  );
}

function Railway() {
  const { from, to } = LAYOUT.rail;
  const { sleepers, rails, sleeperGeo, railGeo, mat, stations } = useMemo(() => {
    const dx = to[0] - from[0], dz = to[1] - from[1], L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    const sleepers: Spot[] = [], rails: Spot[] = [];
    for (let d = 0; d < L; d += 1.5) sleepers.push({ x: from[0] + (dx / L) * d, y: 0.05, z: from[1] + (dz / L) * d, ry: yaw });
    for (let d = 10; d < L; d += 20) for (const side of [-0.75, 0.75]) { const p = place(from[0], from[1], yaw, side, d); rails.push({ x: p.x, y: 0.14, z: p.z, ry: yaw }); }
    return { sleepers, rails, sleeperGeo: new THREE.BoxGeometry(2.5, 0.1, 0.32), railGeo: new THREE.BoxGeometry(0.1, 0.12, 20), mat: new THREE.MeshLambertMaterial({ color: "#5b4636" }),
      stations: [{ x: from[0], z: from[1], yaw, name: "Central Station", train: true }, { x: to[0], z: to[1], yaw, name: "South Halt", train: false }] };
  }, [from, to]);
  const railMat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#7c8088" }), []);
  return (
    <>
      <Instances geometry={sleeperGeo} material={mat} items={sleepers} radius={130} castShadow={false} />
      <Instances geometry={railGeo} material={railMat} items={rails} radius={140} castShadow={false} />
      {stations.map((s) => <Station key={s.name} {...s} />)}
    </>
  );
}

function FuelStation({ x, z, yaw }: { x: number; z: number; yaw: number }) {
  const { geo, solids, sign } = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    box(parts, 14, 0.08, 18, 0, 0.05, 0, "#55585e"); // forecourt
    box(parts, 9, 0.5, 13, 0, 5.3, 0, "#e7e2d8"); box(parts, 9.2, 0.25, 13.2, 0, 5, 0, "#c8372b");
    for (const a of [-5, 5]) { box(parts, 0.4, 5, 0.4, 0, 2.5, a, "#d9d4c8"); box(parts, 0.9, 1.7, 0.6, 0, 0.9, a * 0.6, "#c8372b"); box(parts, 0.7, 0.4, 0.05, 0, 1.3, a * 0.6 + 0.31, "#22303a"); }
    box(parts, 7, 3.6, 9, 7.6, 1.8, 0, "#efe9dc"); box(parts, 7.4, 0.3, 9.4, 7.6, 3.75, 0, "#54606e"); box(parts, 0.15, 1.8, 5, 4.05, 1.5, 0, "#3d5668");
    box(parts, 0.4, 8, 0.4, -6, 4, 9, "#3d4656");
    const solids = [solidAt(x, z, yaw, 0, 3, 2.5, 0.5, 2.5, 0.5), solidAt(x, z, yaw, 0, -3, 2.5, 0.5, 2.5, 0.5), solidAt(x, z, yaw, 7.6, 0, 1.8, 3.5, 1.8, 4.5), solidAt(x, z, yaw, -6, 9, 4, 0.3, 4, 0.3)];
    return { geo: merged(parts), solids, sign: canvasText("FUEL", { bg: "#c8372b", fg: "#ffffff", w: 256, h: 128, size: 72 }) };
  }, [x, z, yaw]);
  useStaticColliders(solids, "fuel station");
  return (
    <Near x={x} z={z} radius={190}>
      <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
        <mesh geometry={geo} material={paint} castShadow receiveShadow />
        <mesh position={[-5.75, 8.2, 9]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[3.4, 1.7]} /><meshBasicMaterial map={sign} side={THREE.DoubleSide} /></mesh>
      </group>
    </Near>
  );
}

export function Landmarks() {
  return (
    <>
      {LAYOUT.bridges.map((b) => <Bridge key={`${b.x},${b.z}`} {...b} />)}
      {LAYOUT.tunnels.map((t) => <Tunnel key={`${t.x},${t.z}`} {...t} />)}
      <Railway />
      {LAYOUT.fuels.map((f) => <FuelStation key={`${f.x},${f.z}`} {...f} />)}
    </>
  );
}
