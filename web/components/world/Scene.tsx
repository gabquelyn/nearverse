"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics, RigidBody, CuboidCollider, BallCollider, CoefficientCombineRule, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { rules as c } from "@nearverse/economy";
import { useGame } from "@/lib/state/game";
import { nodeName } from "../ui/Hud";

const COLORS = { sand: "#f2b632", road: "#d9942a", ink: "#14213d", brick: "#b5341f", moss: "#2f6f43", paper: "#fff4d6", sky: "#2447c9", leaf: "#3f8f55", stone: "#a79f92" };
const ITEM: Record<string, string> = { wood: "#bd8500", iron: "#1a63cc", slate: "#8e1f6a", clay: "#c0300f", fuel: "#009a85" };
export const STALLS: [number, number][] = [[-16, 8], [0, 16], [16, 8]];
const AWNING = ["#2f5fb3", "#b5341f", "#2f6f43"];
export const PLOT: [number, number] = [0, -14];
const ISLAND = 86;
const START = new THREE.Vector3(0, 4, -2);
export const truck = { pos: new THREE.Vector3(0, 2, 0), yaw: 0, speed: 0 };
export const keys = new Set<string>();
if (typeof window !== "undefined") (window as unknown as Record<string, unknown>).__nearverse = { truck, keys };

function textTexture(text: string, bg: string, fg: string, w = 256, h = 256, size = 180) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d")!; g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `${size}px "Bowlby One", Impact, sans-serif`;
  g.fillText(text, w / 2, h / 2 + size * 0.04, w - 16);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function Ground() {
  return (
    <>
      <RigidBody type="fixed" friction={1}><CuboidCollider args={[120, 1, 120]} position={[0, -1, 0]} /></RigidBody>
      {Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return <RigidBody key={i} type="fixed"><CuboidCollider args={[12, 8, 1]} position={[Math.cos(a) * ISLAND, 6, Math.sin(a) * ISLAND]} rotation={[0, -a + Math.PI / 2, 0]} /></RigidBody>; })}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[ISLAND + 2, 48]} /><meshStandardMaterial color={COLORS.sand} /></mesh>
      <mesh position={[0, -3.1, 0]}><cylinderGeometry args={[ISLAND + 2, ISLAND - 8, 6, 48]} /><meshStandardMaterial color="#a8701c" flatShading /></mesh>
      {c.nodes.map((n) => {
        const len = Math.hypot(n.x, n.z);
        return <mesh key={n.id} rotation={[-Math.PI / 2, 0, -Math.atan2(n.x, n.z)]} position={[n.x / 2, 0.02, n.z / 2]} receiveShadow><planeGeometry args={[4.6, len]} /><meshStandardMaterial color={COLORS.road} /></mesh>;
      })}
    </>
  );
}

function Truck() {
  const body = useRef<RapierRigidBody>(null!);
  const group = useRef<THREE.Group>(null!);
  const wheels = useRef<THREE.Mesh[]>([]);
  const items = useGame((s) => s.player.items);
  const cargo = useMemo(() => {
    const out: { color: string; p: [number, number, number] }[] = [];
    let n = 0;
    c.items.forEach((it, i) => { if (i === c.fuel_item) return; for (let q = 0; q < items[i]; q++) { const k = n++; if (k >= 24) continue; out.push({ color: ITEM[it.id], p: [-0.52 + (k % 3) * 0.52, 0.98 + Math.floor(k / 9) * 0.32, -1.55 + (Math.floor(k / 3) % 3) * 0.52] }); } });
    return out;
  }, [items]);
  useFrame((_, dt) => {
    const b = body.current; if (!b) return;
    const d = Math.min(dt, 0.25);
    const r = b.rotation(), q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const v = b.linvel(); const vel = new THREE.Vector3(v.x, v.y, v.z);
    const speed = vel.dot(fwd);
    const t = b.translation();
    const grounded = t.y < 1.3;
    const up = keys.has("KeyW") || keys.has("ArrowUp"), down = keys.has("KeyS") || keys.has("ArrowDown");
    const left = keys.has("KeyA") || keys.has("ArrowLeft"), right = keys.has("KeyD") || keys.has("ArrowRight");
    const boost = keys.has("ShiftLeft") || keys.has("ShiftRight");
    if (grounded) {
      // Arcade handling: set velocity directly so it feels the same at any frame rate. Collisions still push back.
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      let along = speed;
      const limit = boost ? 32 : 20;
      if (up && along < limit) along += (boost ? 42 : 26) * d;
      else if (down && along > -10) along -= 24 * d;
      else if (!up && !down) along *= Math.exp(-1.1 * d);
      const lateral = vel.dot(side) * Math.exp(-9 * d);
      b.setLinvel({ x: fwd.x * along + side.x * lateral, y: v.y, z: fwd.z * along + side.z * lateral }, true);
    }
    const steer = (left ? 1 : 0) - (right ? 1 : 0);
    const grip = Math.min(1, Math.abs(speed) / 6) * Math.sign(speed || 1);
    b.setAngvel({ x: 0, y: steer * 2.6 * grip, z: 0 }, true);
    if (keys.has("KeyR") || t.y < -8) { b.setTranslation(START, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); keys.delete("KeyR"); }
    truck.pos.set(t.x, t.y, t.z); truck.speed = speed; truck.yaw = Math.atan2(fwd.x, fwd.z);
    wheels.current.forEach((w, i) => { if (w) { w.rotation.x += speed * d * 2.2; if (i < 2) w.rotation.y = steer * 0.35; } });
    if (group.current) { group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -(up ? 0.035 : 0) + (down ? 0.035 : 0), 0.12); group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, -steer * Math.min(Math.abs(speed) / 20, 1) * 0.07, 0.12); }
  });
  useEffect(() => {
    // Lets automated checks place the truck without driving.
    (window as unknown as { __nearverse: Record<string, unknown> }).__nearverse.teleport = (x: number, z: number) => { body.current?.setTranslation({ x, y: 1, z }, true); body.current?.setLinvel({ x: 0, y: 0, z: 0 }, true); truck.pos.set(x, 1, z); };
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !keys.has("Space") && body.current && truck.pos.y < 1.3) { body.current.applyImpulse({ x: 0, y: 8 * body.current.mass(), z: 0 }, true); e.preventDefault(); }
      if (e.code === "KeyH" && !e.repeat) honk();
      if (/^(Arrow|Space)/.test(e.code)) e.preventDefault();
      keys.add(e.code);
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); keys.clear(); };
  }, []);
  const Wheel = ({ p, i }: { p: [number, number, number]; i: number }) => (
    <group position={p}><mesh ref={(m) => { if (m) wheels.current[i] = m; }} castShadow><group rotation={[0, 0, Math.PI / 2]}><mesh castShadow><cylinderGeometry args={[0.42, 0.42, 0.34, 10]} /><meshStandardMaterial color={COLORS.ink} flatShading /></mesh><mesh><boxGeometry args={[0.1, 0.36, 0.7]} /><meshStandardMaterial color={COLORS.paper} /></mesh></group></mesh></group>
  );
  return (
    <RigidBody ref={body} position={[0, 7, -2]} colliders={false} mass={3} enabledRotations={[false, true, false]} linearDamping={0.15} ccd restitution={0.25} name="truck">
      <CuboidCollider args={[0.95, 0.55, 1.9]} position={[0, 0.0, 0]} friction={0} frictionCombineRule={CoefficientCombineRule.Min} />
      <group ref={group} position={[0, -0.55, 0]}>
        <mesh position={[0, 0.62, 0]} castShadow><boxGeometry args={[1.8, 0.3, 3.8]} /><meshStandardMaterial color={COLORS.ink} flatShading /></mesh>
        <mesh position={[0, 1.22, 1.05]} castShadow><boxGeometry args={[1.7, 1, 1.5]} /><meshStandardMaterial color={COLORS.brick} flatShading /></mesh>
        <mesh position={[0, 1.42, 1.82]}><boxGeometry args={[1.45, 0.48, 0.04]} /><meshStandardMaterial color="#bfe0ff" /></mesh>
        {[[-0.87, -0.65], [0.87, -0.65]].map(([x, z]) => <mesh key={x} position={[x, 1.02, z]} castShadow><boxGeometry args={[0.08, 0.5, 2.1]} /><meshStandardMaterial color={COLORS.brick} flatShading /></mesh>)}
        <mesh position={[0, 1.02, -1.7]} castShadow><boxGeometry args={[1.8, 0.5, 0.08]} /><meshStandardMaterial color={COLORS.brick} flatShading /></mesh>
        {cargo.map((b, i) => <mesh key={i} position={b.p} castShadow><boxGeometry args={[0.46, 0.3, 0.46]} /><meshStandardMaterial color={b.color} flatShading /></mesh>)}
        <Wheel i={0} p={[-0.98, 0.42, 1.25]} /><Wheel i={1} p={[0.98, 0.42, 1.25]} /><Wheel i={2} p={[-0.98, 0.42, -1.25]} /><Wheel i={3} p={[0.98, 0.42, -1.25]} />
      </group>
    </RigidBody>
  );
}

function FollowCamera() {
  const { camera, size } = useThree();
  const look = useRef(new THREE.Vector3());
  useFrame((_, dt) => {
    const portrait = size.width < size.height;
    const target = new THREE.Vector3(truck.pos.x, 0, truck.pos.z + Math.cos(truck.yaw) * 3);
    const off = portrait ? new THREE.Vector3(14, 30, -22) : new THREE.Vector3(13, 21, -17);
    const k = 1 - Math.exp(-dt * 3.5);
    camera.position.lerp(target.clone().add(off), k);
    look.current.lerp(target, k);
    camera.lookAt(look.current);
  });
  return null;
}

/** The title is a wall of crates in the truck's path, so the first thing you do is knock it over. */
function TitleCrates() {
  const [ready, setReady] = useState(false);
  useEffect(() => { document.fonts.load('180px "Bowlby One"').finally(() => setReady(true)); }, []);
  const letters = "NEARVERSE".split("");
  const tex = useMemo(() => (ready ? letters.map((l, i) => textTexture(l, i % 2 ? COLORS.brick : COLORS.ink, COLORS.paper)) : []), [ready]);
  if (!ready) return null;
  return <>{letters.map((_, i) => (
    <RigidBody key={i} position={[(4 - i) * 2.25, 1.03, 6.5]} colliders="cuboid" mass={0.5} restitution={0.2} friction={0.8} linearDamping={0.2} angularDamping={0.2}>
      <mesh castShadow rotation={[0, Math.PI, 0]}><boxGeometry args={[2, 2, 2]} /><meshStandardMaterial map={tex[i]} /></mesh>
    </RigidBody>
  ))}</>;
}

function Tree({ p, s = 1 }: { p: [number, number]; s?: number }) {
  return (
    <RigidBody type="fixed" colliders={false} position={[p[0], 0, p[1]]}><CuboidCollider args={[0.45 * s, 2, 0.45 * s]} position={[0, 2, 0]} />
      <mesh position={[0, 1 * s, 0]} castShadow><cylinderGeometry args={[0.28 * s, 0.4 * s, 2 * s, 6]} /><meshStandardMaterial color={ITEM.wood} flatShading /></mesh>
      <mesh position={[0, 3.2 * s, 0]} castShadow><coneGeometry args={[1.8 * s, 3.4 * s, 6]} /><meshStandardMaterial color={COLORS.leaf} flatShading /></mesh>
    </RigidBody>
  );
}

function Decor() {
  const trees = useMemo(() => {
    const out: [number, number, number][] = [];
    let s = 11; const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    while (out.length < 46) {
      const a = r() * Math.PI * 2, d = 34 + r() * 46, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (c.nodes.some((n) => { const l = Math.hypot(n.x, n.z), t = Math.max(0, Math.min(1, (x * n.x + z * n.z) / (l * l))); return Math.hypot(x - n.x * t, z - n.z * t) < 7; })) continue;
      out.push([x, z, 0.8 + r() * 0.8]);
    }
    return out;
  }, []);
  return <>{trees.map(([x, z, k], i) => <Tree key={i} p={[x, z]} s={k} />)}</>;
}

function NodeSpot({ i }: { i: number }) {
  const n = c.nodes[i];
  const left = useGame((s) => s.market.nodes[i]);
  const color = ITEM[c.items[n.item].id];
  const heaps = Math.max(0, Math.ceil((left / n.max_stock) * 8));
  const sign = useMemo(() => (typeof document === "undefined" ? null : textTexture(nodeName(n.id), COLORS.paper, COLORS.ink, 512, 96, 42)), [n.id]);
  return (
    <group position={[n.x, 0, n.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}><ringGeometry args={[6, 6.5, 32]} /><meshBasicMaterial color={COLORS.ink} /></mesh>
      {Array.from({ length: heaps }, (_, k) => { const a = k * 2.399, d = 1.2 + (k % 3) * 1.2; return <mesh key={k} position={[Math.cos(a) * d, 0.5, Math.sin(a) * d]} castShadow rotation={[0, a, 0]}><dodecahedronGeometry args={[0.7, 0]} /><meshStandardMaterial color={color} flatShading /></mesh>; })}
      <group position={[0, 0, 6.8]}><mesh position={[0, 1, 0]}><boxGeometry args={[0.2, 2, 0.2]} /><meshStandardMaterial color={COLORS.ink} /></mesh><mesh position={[0, 2.3, 0]} rotation={[0, Math.PI, 0]}><planeGeometry args={[5.2, 1]} /><meshBasicMaterial map={sign} side={THREE.DoubleSide} /></mesh></group>
    </group>
  );
}

function Stall({ i }: { i: number }) {
  const [x, z] = STALLS[i];
  const name = c.merchants[i].name;
  const sign = useMemo(() => textTexture(name, COLORS.paper, COLORS.ink, 512, 128, 80), [name]);
  return (
    <group position={[x, 0, z]} rotation={[0, Math.atan2(-x, -z), 0]}>
      <RigidBody type="fixed" colliders={false}><CuboidCollider args={[3, 1, 1]} position={[0, 1, -2.2]} /></RigidBody>
      <mesh position={[0, 0.9, -2.2]} castShadow><boxGeometry args={[6, 1.8, 2]} /><meshStandardMaterial color={COLORS.paper} flatShading /></mesh>
      {[-2.8, 2.8].map((px) => <mesh key={px} position={[px, 2.4, -1.4]} castShadow><boxGeometry args={[0.2, 4.8, 0.2]} /><meshStandardMaterial color={COLORS.ink} /></mesh>)}
      <mesh position={[0, 4.6, -1.6]} rotation={[0.3, 0, 0]} castShadow><boxGeometry args={[7, 0.2, 3.6]} /><meshStandardMaterial color={AWNING[i]} flatShading /></mesh>
      <mesh position={[0, 3.5, -0.9]}><planeGeometry args={[4.6, 1.15]} /><meshBasicMaterial map={sign} side={THREE.DoubleSide} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 1]}><ringGeometry args={[5.4, 5.9, 32]} /><meshBasicMaterial color={AWNING[i]} /></mesh>
    </group>
  );
}

function Plot() {
  const done = useGame((s) => s.player.blueprints);
  const palette = c.blueprints.map((_, i) => [ITEM.wood, ITEM.clay, ITEM.slate][i % 3]);
  return (
    <group position={[PLOT[0], 0, PLOT[1]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}><planeGeometry args={[20, 12]} /><meshStandardMaterial color="#c9a144" /></mesh>
      {c.blueprints.map((b, i) => (
        <group key={b.id} position={[(1 - i) * 6.2, 0, -1]}>
          {Array.from({ length: done[i] }, (_, s) => {
            const w = 4 - s * 0.45;
            return <mesh key={s} position={[0, 0.9 + s * 1.8, 0]} castShadow><boxGeometry args={[w, 1.8, w]} /><meshStandardMaterial color={s % 2 ? COLORS.paper : palette[i]} flatShading /></mesh>;
          })}
          {done[i] === b.sections.length && <mesh position={[0, b.sections.length * 1.8 + 0.8, 0]} castShadow><coneGeometry args={[(4 - b.sections.length * 0.45) * 0.95, 1.8, 4]} /><meshStandardMaterial color={COLORS.brick} flatShading /></mesh>}
          {done[i] === 0 && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><ringGeometry args={[1.9, 2.1, 4]} /><meshBasicMaterial color={COLORS.ink} /></mesh>}
        </group>
      ))}
    </group>
  );
}

/** Mines guard the richest node. They throw the truck around, which costs you time, not on-chain state. */
function Mines() {
  const n = c.nodes.find((x) => x.id === "mine-field")!;
  const spots = useMemo(() => [[-9, 7], [8, 8], [-11, -3], [11, -2], [0, 11], [-5, -10], [6, -10]].map(([x, z]) => [n.x + x, n.z + z] as [number, number]), [n]);
  const [gone, setGone] = useState<Record<number, boolean>>({});
  const say = useGame((s) => s.say);
  return <>{spots.map(([x, z], i) => gone[i] ? null : (
    <RigidBody key={i} type="fixed" colliders={false} position={[x, 0.45, z]}>
      <BallCollider args={[0.8]} sensor onIntersectionEnter={({ other }) => {
        const b = other.rigidBody; if (!b || other.rigidBodyObject?.name !== "truck") return;
        const dir = new THREE.Vector3(b.translation().x - x, 0, b.translation().z - z).normalize();
        b.applyImpulse({ x: dir.x * 20 * b.mass(), y: 11 * b.mass(), z: dir.z * 20 * b.mass() }, true);
        say("Boom. Mines cost you time, and this field wears the truck on every load."); boom();
        setGone((g) => ({ ...g, [i]: true })); setTimeout(() => setGone((g) => ({ ...g, [i]: false })), 12000);
      }} />
      <mesh castShadow><sphereGeometry args={[0.55, 8, 6]} /><meshStandardMaterial color={COLORS.ink} flatShading /></mesh>
      <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.05, 0.05, 0.4, 5]} /><meshBasicMaterial color={COLORS.brick} /></mesh>
    </RigidBody>
  ))}</>;
}

let ctx: AudioContext | null = null;
function tone(f: number, t: number, type: OscillatorType = "square", vol = 0.05) {
  try { ctx ??= new AudioContext(); const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t); o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + t); } catch { /* no audio */ }
}
const honk = () => { tone(370, 0.3); tone(466, 0.3); };
const boom = () => tone(70, 0.5, "sawtooth", 0.14);

function Zones() {
  const { setZone, setGatherProgress, act } = useGame.getState();
  const hold = useRef(0);
  useFrame((_, dt) => {
    const { x, z } = truck.pos;
    let zone: { kind: "node" | "stall" | "plot"; index: number } | null = null;
    c.nodes.forEach((n, i) => { if (Math.hypot(x - n.x, z - n.z) < 6.5) zone = { kind: "node", index: i }; });
    STALLS.forEach(([sx, sz], i) => { if (Math.hypot(x - sx, z - sz) < 6) zone = { kind: "stall", index: i }; });
    if (Math.abs(x - PLOT[0]) < 10 && Math.abs(z - PLOT[1]) < 6) zone = { kind: "plot", index: 0 };
    setZone(zone);
    const z2 = zone as { kind: string; index: number } | null;
    if (z2?.kind === "node" && keys.has("KeyE")) {
      hold.current += dt;
      setGatherProgress(Math.min(1, hold.current / 1.2));
      if (hold.current >= 1.2) { hold.current = 0; setGatherProgress(0); if (act({ t: "gather", node: z2.index })) tone(660, 0.12, "triangle", 0.09); }
    } else if (hold.current) { hold.current = 0; setGatherProgress(0); }
  });
  return null;
}

export default function Scene() {
  const [fonts, setFonts] = useState(false);
  useEffect(() => { document.fonts.load('80px "Bowlby One"').finally(() => setFonts(true)); }, []);
  return (
    <Canvas shadows camera={{ position: [13, 24, -24], fov: 42 }} dpr={[1, 1.8]} gl={{ antialias: true, preserveDrawingBuffer: true }}>
      <color attach="background" args={[COLORS.sky]} />
      <hemisphereLight args={["#ffffff", "#c98a1e", 1.25]} />
      <directionalLight position={[-30, 50, -24]} intensity={2.4} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-110} shadow-camera-right={110} shadow-camera-top={110} shadow-camera-bottom={-110} shadow-camera-far={180} />
      <Physics gravity={[0, -24, 0]} timeStep={1 / 60}>
        <Ground />
        <Truck />
        {fonts && <><TitleCrates />{STALLS.map((_, i) => <Stall key={i} i={i} />)}{c.nodes.map((_, i) => <NodeSpot key={i} i={i} />)}</>}
        <Decor />
        <Mines />
        <Plot />
      </Physics>
      <FollowCamera />
      <Zones />
    </Canvas>
  );
}
