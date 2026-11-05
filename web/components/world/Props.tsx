"use client";
// Everything placed on the island: obstacles, stalls, material spots, plot, title crates.
import { CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { rules as c } from "@nearverse/economy";
import { useGame } from "@/lib/state/game";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { City } from "./City";
import { DRIVE_RADIUS, ITEM_COLOR, PAL, biomeAt, canvasText, reserved, seeded, spacing } from "./world";
import { mineHandles, useStaticColliders, type Round, type Solid } from "./colliders";
import { registerMine } from "./Truck";
import { Instances, Near, type Spot } from "./Instances";
import { glowMat, lampMat } from "./daynight";

function rb(s: [number, number, number], r = 0.08) { return new RoundedBoxGeometry(s[0], s[1], s[2], 2, Math.min(r, Math.min(...s) / 2 - 0.001)); }
const Mat = ({ color, rough = 0.85, flat }: { color: string; rough?: number; flat?: boolean }) => <meshStandardMaterial color={color} roughness={rough} flatShading={flat} />;
const Plank = ({ s, p, rot, color = PAL.plank }: { s: [number, number, number]; p: [number, number, number]; rot?: [number, number, number]; color?: string }) => {
  const g = useMemo(() => rb(s, 0.05), [s.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  return <mesh geometry={g} position={p} rotation={rot} castShadow receiveShadow><Mat color={color} /></mesh>;
};

function rockGeometry(seed: number) {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, r = seeded(seed), v = new THREE.Vector3();
  const f = [1 + r() * 0.5, 0.6 + r() * 0.3, 0.8 + r() * 0.5], a = r() * 6, b = r() * 6;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + Math.sin(v.x * 3 + a) * 0.12 + Math.sin(v.y * 4 + b) * 0.1 + Math.sin(v.z * 5 + a + b) * 0.08;
    p.setXYZ(i, v.x * n * f[0], Math.max(v.y * n * f[1], -0.15), v.z * n * f[2]);
  }
  g.computeVertexNormals();
  return g;
}
const ROCKS = [rockGeometry(3), rockGeometry(8), rockGeometry(14)];

const stoneMat = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true });
const barkMat = new THREE.MeshLambertMaterial({ color: PAL.bark, flatShading: true });

function vertexColored(geo: THREE.BufferGeometry, color: string) {
  const g = geo.index ? geo.toNonIndexed() : geo, col = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  g.deleteAttribute("uv");
  return g;
}
const paintedMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const pineGeo = mergeGeometries([
  vertexColored(new THREE.CylinderGeometry(0.2, 0.34, 1.4, 6).translate(0, 0.7, 0), PAL.bark),
  vertexColored(new THREE.ConeGeometry(1.9, 2.5, 7).translate(0, 2.3, 0), "#2c5a48"),
  vertexColored(new THREE.ConeGeometry(1.45, 2.2, 7).translate(0, 3.6, 0), "#6e9a8c"),
  vertexColored(new THREE.ConeGeometry(0.95, 1.9, 7).translate(0, 4.9, 0), "#e8f1f6"),
])!;
const cactusGeo = mergeGeometries([
  vertexColored(new THREE.CapsuleGeometry(0.34, 2.6, 3, 8).translate(0, 1.6, 0), "#4d8a58"),
  vertexColored(new THREE.CapsuleGeometry(0.2, 0.7, 3, 7).rotateZ(0.7).translate(0.65, 2, 0), "#4d8a58"),
  vertexColored(new THREE.CapsuleGeometry(0.2, 0.6, 3, 7).rotateZ(-0.7).translate(-0.62, 1.5, 0), "#58965f"),
])!;

function scatter(seed: number, want: number, test: (x: number, z: number) => boolean, make: (x: number, z: number, r: () => number) => Spot, gap = 4) {
  const r = seeded(seed), out: Spot[] = [], room = spacing(gap);
  for (let t = 0; out.length < want && t < want * 30; t++) {
    const a = r() * 6.283, d = 34 + Math.sqrt(r()) * 950, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!room.free(x, z) || !test(x, z)) continue;
    room.add(x, z);
    out.push(make(x, z, r));
  }
  return out;
}

/** Richer spots are ringed by more obstacles, with narrow gaps to thread. */
function guardRings() {
  const rocks: Spot[] = [], r = seeded(211);
  for (const n of c.nodes) {
    if (n.rich < 12) continue;
    const rings = n.rich > 65 ? 3 : n.rich > 35 ? 2 : 1, b = biomeAt(n.x, n.z);
    const color = b.snow > 0.5 ? "#c5d2dc" : b.desert > 0.5 ? "#a86f40" : b.city > 0.5 ? "#7c7f86" : PAL.stoneDark;
    for (let ring = 0; ring < rings; ring++) {
      const radius = 12 + ring * 7, count = Math.round((radius * 6.283) / (5.2 - (n.rich / 100) * 1.4)), gap = r() * 6.283;
      for (let k = 0; k < count; k++) {
        const a = (k / count) * 6.283 + ring * 0.4;
        const off = Math.abs(((a - gap + 9.42) % 6.283) - 3.14);
        if (off < 0.32) continue; // the way in
        rocks.push({ x: n.x + Math.cos(a) * radius, z: n.z + Math.sin(a) * radius, sx: 1 + r() * 0.7, ry: r() * 6, color });
      }
    }
  }
  return rocks;
}

/** Solid things worth steering around. Hitting them hard costs truck health. */
export function Obstacles() {
  const spots = useMemo(() => {
    const free = (x: number, z: number) => !reserved(x, z, 1);
    const rocks = scatter(101, 1100, (x, z) => biomeAt(x, z).city < 0.2 && free(x, z), (x, z, r) => {
      const b = biomeAt(x, z), s = (0.8 + r() * 1.4) * (b.desert > 0.5 ? 1.7 : 1);
      return { x, z, sx: s, ry: r() * 6, color: b.snow > 0.5 ? (r() > 0.4 ? "#dce6ee" : "#8d97a3") : b.desert > 0.5 ? (r() > 0.5 ? "#b57b48" : "#94603a") : r() > 0.35 ? PAL.stone : PAL.stoneDark };
    }, 6);
    const logs = scatter(103, 180, (x, z) => biomeAt(x, z).desert < 0.2 && biomeAt(x, z).city < 0.1 && free(x, z), (x, z, r) => ({ x, z, y: 0.38, ry: r() * 3, sx: 1 }), 12);
    const pines = scatter(107, 900, (x, z) => biomeAt(x, z).snow > 0.55 && free(x, z), (x, z, r) => ({ x, z, sx: 0.9 + r() * 0.8, ry: r() * 6 }), 5.5);
    const cacti = scatter(109, 520, (x, z) => biomeAt(x, z).desert > 0.6 && free(x, z), (x, z, r) => ({ x, z, sx: 0.9 + r() * 0.6, ry: r() * 6 }), 7);
    const all = [...rocks, ...guardRings()];
    return {
      byShape: [0, 1, 2].map((k) => all.filter((_, i) => i % 3 === k)), logs, pines, cacti,
      rockSolid: all.map((k): Round => ({ kind: "ball", x: k.x, y: (k.sx ?? 1) * 0.35, z: k.z, r: (k.sx ?? 1) * 0.95 })),
      logSolid: logs.map((l): Solid => ({ kind: "box", x: l.x, y: 0.4, z: l.z, hx: 2.1, hy: 0.4, hz: 0.4, ry: l.ry })),
      pineSolid: pines.map((t): Solid => ({ kind: "box", x: t.x, y: 2, z: t.z, hx: 0.5, hy: 2, hz: 0.5 })),
      cactusSolid: cacti.map((t): Solid => ({ kind: "box", x: t.x, y: 1.6, z: t.z, hx: 0.42, hy: 1.6, hz: 0.42 })),
    };
  }, []);
  useStaticColliders(spots.rockSolid, "boulder");
  useStaticColliders(spots.logSolid, "fallen log");
  useStaticColliders(spots.pineSolid, "pine");
  useStaticColliders(spots.cactusSolid, "cactus");
  const logGeo = useMemo(() => new THREE.CylinderGeometry(0.36, 0.42, 4.2, 9).rotateZ(Math.PI / 2), []);
  return (
    <>
      {spots.byShape.map((items, k) => <Instances key={k} geometry={ROCKS[k]} material={stoneMat} items={items} />)}
      <Instances geometry={logGeo} material={barkMat} items={spots.logs} />
      <Instances geometry={pineGeo} material={paintedMat} items={spots.pines} />
      <Instances geometry={cactusGeo} material={paintedMat} items={spots.cacti} />
      <City />
      <Fenceline />
    </>
  );
}

/** Marks the drivable edge above the beach. */
function Fenceline() {
  const N = 720, W = 180;
  const { posts, rails, postGeo, railGeo, postMat, railMat, walls } = useMemo(() => {
    const posts: Spot[] = [], rails: Spot[] = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, a2 = ((i + 0.5) / N) * Math.PI * 2;
      posts.push({ x: Math.cos(a) * DRIVE_RADIUS, y: 0.65, z: Math.sin(a) * DRIVE_RADIUS, ry: -a });
      rails.push({ x: Math.cos(a2) * DRIVE_RADIUS, y: 0.92, z: Math.sin(a2) * DRIVE_RADIUS, ry: -a2 });
    }
    const half = (Math.PI * DRIVE_RADIUS) / W + 1;
    const walls = Array.from({ length: W }, (_, i): Solid => { const a = (i / W) * Math.PI * 2; return { kind: "box", x: Math.cos(a) * (DRIVE_RADIUS + 1.2), y: 6, z: Math.sin(a) * (DRIVE_RADIUS + 1.2), hx: half, hy: 8, hz: 1, ry: -a + Math.PI / 2 }; });
    return { posts, rails, walls, postGeo: new THREE.CylinderGeometry(0.1, 0.13, 1.3, 6), railGeo: new THREE.BoxGeometry(0.1, 0.1, (2 * Math.PI * DRIVE_RADIUS) / N), postMat: new THREE.MeshLambertMaterial({ color: PAL.plankDark }), railMat: new THREE.MeshLambertMaterial({ color: PAL.plank }) };
  }, []);
  useStaticColliders(walls, null);
  return (
    <>
      <Instances geometry={postGeo} material={postMat} items={posts} radius={80} />
      <Instances geometry={railGeo} material={railMat} items={rails} radius={80} />
    </>
  );
}

/** Light things you can scatter without hurting the truck. */
/** Loose props stay exactly where they were placed until the truck touches them, however long a frame takes. */
const asleep = (body: RapierRigidBody | null) => { body?.sleep(); };

export function Scatter() {
  const items = useMemo(() => {
    const out: { kind: "cone" | "barrel"; x: number; z: number }[] = [];
    [[-7, -2], [7, -2], [-9, 3], [9, 3], [-20, -3], [20, -3], [-3, 18], [3, 18]].forEach(([x, z]) => out.push({ kind: "cone", x, z }));
    [[-14, -8.5], [-13, -7.6], [14.5, -8], [22, 12], [23, 11], [-22, 12], [-6, 22], [-4.6, 22.6], [5, 22]].forEach(([x, z]) => out.push({ kind: "barrel", x, z }));
    return out;
  }, []);
  return <>{items.map((p, i) => p.kind === "cone" ? (
    <RigidBody key={i} ref={asleep} position={[p.x, 0.5, p.z]} colliders={false} ccd mass={0.08} linearDamping={0.35} angularDamping={0.35} restitution={0.3}>
      <CylinderCollider args={[0.42, 0.28]} />
      <mesh position={[0, -0.42, 0]} castShadow><boxGeometry args={[0.72, 0.06, 0.72]} /><Mat color="#c9562a" /></mesh>
      <mesh castShadow><coneGeometry args={[0.32, 0.9, 12]} /><Mat color="#e0642c" rough={0.5} /></mesh>
      <mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.145, 0.21, 0.2, 12]} /><Mat color={PAL.cream} /></mesh>
    </RigidBody>
  ) : (
    <RigidBody key={i} ref={asleep} position={[p.x, 0.62, p.z]} colliders={false} ccd mass={0.35} linearDamping={0.3} angularDamping={0.3} restitution={0.2}>
      <CylinderCollider args={[0.58, 0.42]} />
      <mesh castShadow receiveShadow><cylinderGeometry args={[0.42, 0.42, 1.16, 14]} /><meshStandardMaterial color={i % 2 ? "#2f6d84" : "#b5472d"} roughness={0.45} metalness={0.4} /></mesh>
      {[-0.32, 0.32].map((y) => <mesh key={y} position={[0, y, 0]}><torusGeometry args={[0.43, 0.025, 6, 16]} /><Mat color={PAL.iron} /></mesh>)}
    </RigidBody>
  ))}</>;
}

const Lamp = ({ p }: { p: [number, number] }) => (
  <RigidBody type="fixed" colliders={false} position={[p[0], 0, p[1]]} name="obstacle" userData={{ obstacle: "lamp post" }}>
    <CuboidCollider args={[0.18, 1.8, 0.18]} position={[0, 1.8, 0]} />
    <mesh position={[0, 0.2, 0]} castShadow><cylinderGeometry args={[0.2, 0.28, 0.4, 8]} /><Mat color={PAL.ink} /></mesh>
    <mesh position={[0, 1.9, 0]} castShadow><cylinderGeometry args={[0.06, 0.09, 3.4, 8]} /><Mat color={PAL.ink} /></mesh>
    <mesh position={[0, 3.85, 0]} material={lampMat}><boxGeometry args={[0.36, 0.5, 0.36]} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} material={glowMat}><circleGeometry args={[5, 20]} /></mesh>
    <mesh position={[0, 4.22, 0]} castShadow><coneGeometry args={[0.36, 0.3, 4]} /><Mat color={PAL.ink} /></mesh>
  </RigidBody>
);
export const Lamps = () => <>{[[-9, -3], [9, -3], [-21, 3], [21, 3], [-8, 20], [8, 20], [-16, 14], [16, 14]].map(([x, z]) => <Lamp key={`${x}${z}`} p={[x, z]} />)}</>;

function Bench({ p, a }: { p: [number, number]; a: number }) {
  return (
    <RigidBody type="fixed" colliders={false} position={[p[0], 0, p[1]]} rotation={[0, a, 0]} name="obstacle" userData={{ obstacle: "bench" }}>
      <CuboidCollider args={[1.2, 0.5, 0.35]} position={[0, 0.5, 0]} />
      {[0.34, 0.12, -0.1].map((z) => <Plank key={z} s={[2.3, 0.08, 0.18]} p={[0, 0.55, z]} />)}
      {[0.75, 0.97].map((y) => <Plank key={y} s={[2.3, 0.16, 0.06]} p={[0, y, -0.27]} rot={[-0.15, 0, 0]} />)}
      {[-1, 1].map((s) => <Plank key={s} s={[0.12, 0.6, 0.6]} p={[s * 0.95, 0.28, 0.08]} color={PAL.ink} />)}
    </RigidBody>
  );
}
export const Benches = () => <><Bench p={[-13, 3]} a={0.4} /><Bench p={[13, 3]} a={-0.4} /></>;

const SignPost = ({ tex }: { tex: THREE.Texture }) => (
  <group position={[0, 0, 6.8]}>
    {[-2.3, 2.3].map((x) => <Plank key={x} s={[0.2, 2.6, 0.2]} p={[x, 1.3, 0]} color={PAL.plankDark} />)}
    <mesh position={[0, 2.25, 0]} rotation={[0, Math.PI, 0]} castShadow><planeGeometry args={[5.2, 1]} /><meshLambertMaterial map={tex} side={THREE.DoubleSide} /></mesh>
  </group>
);

/** A hidden resource: just a stockpile in the landscape, with no sign or marker to give it away. */
const MARK_RING = new THREE.RingGeometry(6.4, 7, 40), MARK_BEAM = new THREE.CylinderGeometry(0.35, 1.1, 9, 10, 1, true), MARK_GEM = new THREE.OctahedronGeometry(0.9);

export function NodeSpot({ i }: { i: number }) {
  const n = c.nodes[i];
  const left = useGame((s) => s.market.nodes[i]);
  const id = c.items[n.item].id, color = ITEM_COLOR[id];
  const heaps = Math.max(0, Math.ceil((left / n.max_stock) * 10));
  return (
    <group position={[n.x, 0, n.z]}>
      {/* The marker: a ring showing where to stop, and a beacon you can spot from a distance. Only while there's something to load. */}
      {left > 0 && <>
        <mesh geometry={MARK_RING} position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}><meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} /></mesh>
        <mesh geometry={MARK_BEAM} position={[0, 4.5, 0]}><meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} /></mesh>
        <mesh geometry={MARK_GEM} position={[0, 9.4, 0]}><meshBasicMaterial color={color} /></mesh>
      </>}
      {Array.from({ length: heaps }, (_, k) => {
        const a = k * 2.399, d = 1 + (k % 4) * 1.05;
        const pos: [number, number, number] = [Math.cos(a) * d, 0.32, Math.sin(a) * d];
        if (id === "wood") return <mesh key={k} position={pos} rotation={[0, a, Math.PI / 2]} castShadow><cylinderGeometry args={[0.28, 0.32, 2, 8]} /><Mat color={color} flat /></mesh>;
        return <mesh key={k} geometry={ROCKS[k % 3]} position={[pos[0], 0, pos[2]]} rotation={[0, a, 0]} scale={0.55 + (k % 3) * 0.14} castShadow><Mat color={color} flat /></mesh>;
      })}
    </group>
  );
}

const stripes = (col: string) => {
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 16;
  const g = cv.getContext("2d")!;
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? PAL.cream : col; g.fillRect(i * 32, 0, 32, 16); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
};

function StallBuilding({ name, color, x, z }: { name: string; color: string; x: number; z: number }) {
  const sign = useMemo(() => canvasText(name, { bg: PAL.cream, fg: "#2a1810", size: 44 }), [name]);
  const cloth = useMemo(() => stripes(color), [color]);
  // The counter faces home, so you meet it coming along the road.
  const yaw = Math.atan2(x, z);
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      <RigidBody type="fixed" colliders={false} name="obstacle" userData={{ obstacle: "market stall" }}><CuboidCollider args={[3, 0.8, 0.9]} position={[0, 0.8, 2.2]} /></RigidBody>
      <Plank s={[6.2, 0.14, 1.9]} p={[0, 1.2, 2.2]} />
      <Plank s={[6, 1.1, 1.7]} p={[0, 0.58, 2.2]} color={PAL.plankDark} />
      {[-2.9, 2.9].flatMap((px) => [1.4, 3.1].map((pz) => <Plank key={`${px}${pz}`} s={[0.18, pz < 2 ? 3.8 : 4.6, 0.18]} p={[px, pz < 2 ? 1.9 : 2.3, pz]} color={PAL.plankDark} />))}
      <mesh position={[0, 4.35, 2.1]} rotation={[-0.36, 0, 0]} castShadow><boxGeometry args={[7, 0.07, 3.6]} /><meshLambertMaterial map={cloth} /></mesh>
      <mesh position={[0, 3.45, 0.42]} rotation={[0, Math.PI, 0]} castShadow><planeGeometry args={[4.5, 1.05]} /><meshLambertMaterial map={sign} side={THREE.DoubleSide} /></mesh>
      {[-2, -0.8, 0.5, 1.9].map((px, k) => <mesh key={k} position={[px, 1.45, 2]} castShadow><boxGeometry args={[0.7, 0.4, 0.7]} /><Mat color={Object.values(ITEM_COLOR)[k]} flat /></mesh>)}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, -1]}><ringGeometry args={[5.1, 5.4, 40]} /><meshBasicMaterial color={color} transparent opacity={0.85} /></mesh>
    </group>
  );
}

export function Stall({ i }: { i: number }) {
  const m = c.merchants[i];
  return <Near x={m.x} z={m.z}><StallBuilding name={m.name} color={PAL.awning[i]} x={m.x} z={m.z} /></Near>;
}

/** An empty plot shows a sale sign. Once bought it's a building site that fills up with every deposit, then a stall. */
function Site({ i, owned, done }: { i: number; owned: boolean; done: number }) {
  const l = c.lots[i];
  const sign = useMemo(() => canvasText(owned ? l.name : `For sale: ${l.name}`, { bg: PAL.plank, fg: "#2a1810", h: 72, size: owned ? 34 : 26, planks: true }), [l.name, owned]);
  const posts = 0.5 + Math.min(1, done / 0.6) * 3.2, walls = Math.max(0, (done - 0.35) / 0.5), roof = done >= 0.85;
  const needed = l.needs.flatMap((q, k) => (q ? [{ k, got: done }] : []));
  return (
    <group position={[l.x, 0, l.z]} rotation={[0, Math.atan2(l.x, l.z) + Math.PI, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[0, 0.05, 0]}><ringGeometry args={[6.2, 6.5, 4]} /><meshBasicMaterial color={PAL.cream} transparent opacity={0.8} /></mesh>
      {[[-4.4, -4.4], [4.4, -4.4], [-4.4, 4.4], [4.4, 4.4]].map(([x, z]) => <Plank key={`${x}${z}`} s={[0.22, owned ? posts : 1.1, 0.22]} p={[x, (owned ? posts : 1.1) / 2, z]} color={PAL.plankDark} />)}
      <SignPost tex={sign} />
      {owned && <>
        <mesh position={[0, 0.12, 0]} receiveShadow><boxGeometry args={[9, 0.24, 9]} /><Mat color="#8f8a7f" /></mesh>
        {walls > 0 && [[0, -4.4, 8.6, 0.2], [-4.4, 0, 0.2, 8.6], [4.4, 0, 0.2, 8.6]].map(([x, z, w, d]) => <Plank key={`w${x}${z}`} s={[w, walls * 3, d]} p={[x, 0.24 + (walls * 3) / 2, z]} />)}
        {roof && <Plank s={[9.6, 0.2, 9.6]} p={[0, 3.8, 0]} color={PAL.plankDark} />}
        {needed.map((n, j) => <mesh key={n.k} position={[-3.2 + (j % 4) * 1.5, 0.24 + (0.2 + Math.ceil(n.got * 4) * 0.25) / 2, 2.8 - Math.floor(j / 4) * 1.5]} castShadow><boxGeometry args={[1.1, 0.2 + Math.ceil(n.got * 4) * 0.25, 1.1]} /><Mat color={c.items[n.k].color} flat /></mesh>)}
      </>}
    </group>
  );
}

export function LotSpot({ i }: { i: number }) {
  const l = c.lots[i];
  const owner = useGame((s) => s.market.stalls[i]?.owner ?? null), built = useGame((s) => s.market.stalls[i]?.built ?? false);
  const you = useGame((s) => s.session?.accountId ?? "you");
  const done = useGame((s) => { const st = s.market.stalls[i]; if (!st?.owner) return 0; const need = l.needs.reduce((a, q) => a + q, 0); return Math.round((st.progress.reduce((a, q) => a + q, 0) / need) * 20) / 20; });
  return <Near x={l.x} z={l.z}>{owner && built ? <StallBuilding name={l.name} color={owner === you ? "#e0a437" : "#7a5ba8"} x={l.x} z={l.z} /> : <Site i={i} owned={Boolean(owner)} done={done} />}</Near>;
}

const brickTexture = (base: string) => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const g = cv.getContext("2d")!; g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(40,20,20,.35)"; g.lineWidth = 2;
  for (let y = 0; y < 8; y++) { g.beginPath(); g.moveTo(0, y * 16); g.lineTo(128, y * 16); g.stroke(); for (let x = 0; x < 5; x++) { const px = x * 32 + (y % 2 ? 16 : 0); g.beginPath(); g.moveTo(px, y * 16); g.lineTo(px, y * 16 + 16); g.stroke(); } }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1); return t;
};

const MINE_GAP = 14;
/** Mines guard the richest spots. */
export function Mines() {
  const { spots, sensors, geo, mat } = useMemo(() => {
    const r = seeded(307), spots: Spot[] = [];
    for (const n of c.nodes) {
      // Bombs guard what's worth most: rare and legendary materials, and the very richest of the rest.
      const tier = c.items[n.item].tier;
      if (tier < 3 && n.rich < 80) continue;
      const count = tier === 4 ? 14 : tier === 3 ? 10 : 6;
      for (let k = 0; k < count; k++) {
        const a = r() * 6.283, d = 9.5 + r() * 15, x = n.x + Math.cos(a) * d, z = n.z + Math.sin(a) * d, ry = r() * 6;
        // Bombs stay a hazard but never a wall: there's always room for even the widest vehicle to steer between them.
        if (spots.every((m) => Math.hypot(m.x - x, m.z - z) >= MINE_GAP)) spots.push({ x, y: 0.25, z, ry });
      }
    }
    const sensors = spots.map((s): Round => ({ kind: "ball", x: s.x, y: 0.3, z: s.z, r: 0.9 }));
    const geo = mergeGeometries([vertexColored(new THREE.SphereGeometry(0.55, 10, 6).scale(1, 0.45, 1), PAL.iron), vertexColored(new THREE.SphereGeometry(0.1, 6, 5).translate(0, 0.27, 0), "#ff3a2a")])!;
    ((window as unknown as { __nearverse?: Record<string, unknown> }).__nearverse ??= {}).mines = spots;
    return { spots, sensors, geo, mat: paintedMat };
  }, []);
  useStaticColliders(sensors, null, { sensor: true, onMade: (handle, i) => { mineHandles.set(handle, i); registerMine(handle, spots[i].x, spots[i].z); } });
  return <Instances geometry={geo} material={mat} items={spots} />;
}

/** The title is a wall of wooden crates in the truck's path, so the first thing you do is knock it over. */
export function TitleCrates() {
  const letters = "NEARVERSE".split("");
  const geo = useMemo(() => rb([1.9, 1.9, 1.9], 0.1), []);
  const mats = useMemo(() => letters.map((l) => new THREE.MeshStandardMaterial({ map: canvasText(l, { bg: "#c08a55", fg: "#2a1810", w: 256, h: 256, size: 170, planks: true }), roughness: 0.85 })), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  return <>{letters.map((_, i) => (
    <RigidBody key={i} ref={asleep} position={[(4 - i) * 2.1, 0.95, 6.5]} colliders="cuboid" ccd mass={0.35} restitution={0.15} friction={0.8} linearDamping={0.25} angularDamping={0.3}>
      <mesh geometry={geo} material={mats[i]} castShadow receiveShadow rotation={[0, Math.PI, 0]} />
    </RigidBody>
  ))}</>;
}
