"use client";
// The driven vehicle. This component only re-renders when you change vehicle, so crashes and pickups stay smooth.
import { useFrame } from "@react-three/fiber";
import { CoefficientCombineRule, CuboidCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { rules as c } from "@nearverse/economy";
import { useGame } from "@/lib/state/game";
import { ITEM_COLOR, keys, truck } from "./world";
import { sfx } from "./sound";
import { sky } from "./daynight";
import { buildVehicle, type VehicleModel } from "./vehicleModel";
import { mineHandles, obstacleNames } from "./colliders";

const START = new THREE.Vector3(0, 2, -3);
const FUEL_BATCH = 5; // report driving fuel in small batches, not per metre

/** Cargo cubes, one draw call. Subscribes only to what's in the bed. */
const Cargo = memo(function Cargo({ model }: { model: VehicleModel }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const key = useGame((s) => s.player.items.join());
  const geo = useMemo(() => new RoundedBoxGeometry(0.42, 0.28, 0.42, 1, 0.04), []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ flatShading: true }), []);
  useEffect(() => {
    const items = key.split(",").map(Number), m = new THREE.Matrix4(), col = new THREE.Color(), rows = Math.max(2, Math.floor(model.bed.length / 0.46));
    let n = 0;
    c.items.forEach((it, i) => {
      col.set(ITEM_COLOR[it.id]);
      for (let q = 0; q < items[i] && n < 48; q++) {
        const layerSize = 3 * rows, k = n % layerSize, layer = Math.floor(n / layerSize);
        m.makeTranslation(-0.46 + (k % 3) * 0.46, model.bed.floor + 0.02 + layer * 0.3, model.bed.z - model.bed.length / 2 + 0.23 + Math.floor(k / 3) * 0.46);
        ref.current.setMatrixAt(n, m); ref.current.setColorAt(n, col); n++;
      }
    });
    ref.current.count = n; ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [key, model]);
  return <instancedMesh ref={ref} args={[geo, mat, 48]} castShadow frustumCulled={false} />;
});

const PUFFS = 70;
const Puffs = memo(function Puffs({ src }: { src: { emit: (x: number, z: number, y: number, kind: number) => void; burst: (x: number, z: number, big: boolean) => void } }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const d = useMemo(() => new THREE.Object3D(), []);
  const ps = useMemo(() => Array.from({ length: PUFFS }, () => ({ life: 0, max: 1, x: 0, y: -9, z: 0, s: 1, vx: 0, vy: 0.9, vz: 0 })), []);
  const dust = useMemo(() => new THREE.Color("#c99b73"), []), smoke = useMemo(() => new THREE.Color("#2e2a2e"), []), spark = useMemo(() => new THREE.Color("#ffb13d"), []);
  const next = useRef(0);
  useEffect(() => {
    for (let i = 0; i < PUFFS; i++) ref.current.setColorAt(i, dust);
    src.emit = (x, z, y, kind) => {
      const i = next.current++ % PUFFS, q = ps[i];
      q.x = x + (Math.random() - 0.5) * 0.4; q.z = z + (Math.random() - 0.5) * 0.4; q.y = y; q.max = q.life = kind ? 1.5 : 0.8; q.s = kind ? 0.5 : 0.35; q.vx = 0; q.vz = 0; q.vy = 0.9;
      ref.current.setColorAt(i, kind ? smoke : dust); if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    };
    src.burst = (x, z, big) => {
      for (let n = 0; n < (big ? 22 : 9); n++) {
        const i = next.current++ % PUFFS, q = ps[i], a = Math.random() * 6.283, sp = (big ? 7 : 4) * (0.4 + Math.random());
        q.x = x; q.z = z; q.y = 0.8; q.vx = Math.cos(a) * sp; q.vz = Math.sin(a) * sp; q.vy = (big ? 6 : 3) * Math.random() + 1; q.max = q.life = big ? 0.75 : 0.45; q.s = big ? 0.5 : 0.22;
        ref.current.setColorAt(i, n % 3 === 0 && big ? smoke : spark);
      }
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    };
  }, [src, ps, dust, smoke]);
  useFrame((_, dt) => {
    ps.forEach((q, i) => {
      if (q.life > 0) { q.life -= dt; q.x += q.vx * dt; q.z += q.vz * dt; q.y += q.vy * dt; if (q.vx || q.vz) { q.vy -= 12 * dt; if (q.y < 0.1) { q.y = 0.1; q.vy *= -0.4; } } else q.s += dt * 0.8; }
      d.position.set(q.x, q.y, q.z); d.scale.setScalar(q.life > 0 ? q.s * Math.min(1, q.life / q.max + 0.15) : 0.0001); d.updateMatrix(); ref.current.setMatrixAt(i, d.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[undefined, undefined, PUFFS]} frustumCulled={false}><icosahedronGeometry args={[1, 1]} /><meshLambertMaterial transparent opacity={0.72} depthWrite={false} /></instancedMesh>;
});

export function Truck() {
  const vehicleIndex = useGame((s) => s.player.vehicle);
  const v0 = c.vehicles[vehicleIndex];
  const model = useMemo(() => buildVehicle(v0), [v0]);
  const body = useRef<RapierRigidBody>(null!);
  const headlight = useRef<THREE.SpotLight>(null!), lightTarget = useRef<THREE.Object3D>(null!);
  const smoothSteer = useRef(0), impactSpeed = useRef(0), lastHit = useRef(0), puffClock = useRef(0), fuelOwed = useRef(0), warned = useRef(false);
  const fx = useMemo(() => ({ emit: (_x: number, _z: number, _y: number, _k: number) => {}, burst: (_x: number, _z: number, _b: boolean) => {} }), []);
  const spring = useRef({ y: 0, v: 0 }), bumpClock = useRef(0);
  const mineCool = useRef(new Map<number, number>());
  useFrame((_, dt) => {
    const b = body.current; if (!b) return;
    const d = Math.min(dt, 0.1);
    const r = b.rotation(), q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q), side = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const v = b.linvel(), t = b.translation();
    const speed = v.x * fwd.x + v.z * fwd.z, grounded = t.y < 1.2;
    const up = keys.has("KeyW") || keys.has("ArrowUp"), down = keys.has("KeyS") || keys.has("ArrowDown");
    const left = keys.has("KeyA") || keys.has("ArrowLeft"), right = keys.has("KeyD") || keys.has("ArrowRight"), boost = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const player = useGame.getState().player, healthPct = player.durability / v0.endurance;
    if (grounded) {
      // Arcade handling: set velocity directly so it feels the same at any frame rate. Collisions still push back.
      const hurt = !player.started ? 1 : player.fuel <= 0 ? 0.3 : healthPct >= 0.3 ? 1 : player.durability > 0 ? 0.65 : 0.35;
      let along = speed;
      const limit = (boost ? 40 : 27) * hurt * (1.08 - 0.04 * v0.size);
      if (up && along < limit) along += (boost ? 40 : 24) * d;
      else if (down && along > -9) along -= 24 * d;
      else if (!up && !down) along *= Math.exp(-1.1 * d);
      if (along > limit) along = Math.max(limit, along - 30 * d);
      const lateral = (v.x * side.x + v.z * side.z) * Math.exp(-8 * d);
      b.setLinvel({ x: fwd.x * along + side.x * lateral, y: v.y, z: fwd.z * along + side.z * lateral }, true);
    }
    const steer = (left ? 1 : 0) - (right ? 1 : 0);
    smoothSteer.current = THREE.MathUtils.lerp(smoothSteer.current, steer, 1 - Math.exp(-d * 10));
    b.setAngvel({ x: 0, y: smoothSteer.current * 2.4 * Math.min(1, Math.abs(speed) / 5) * (speed >= 0 ? 1 : -1), z: 0 }, true);
    if (keys.has("KeyR") || t.y < -8) { b.setTranslation(START, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); keys.delete("KeyR"); }
    truck.pos.set(t.x, t.y, t.z); truck.speed = speed; truck.yaw = Math.atan2(fwd.x, fwd.z);
    impactSpeed.current = Math.max(Math.hypot(v.x, v.z), impactSpeed.current - d * 40);
    if (player.started && Math.abs(speed) > 1 && player.fuel > 0) {
      fuelOwed.current += ((Math.abs(speed) * d) / c.meters_per_fuel) * (v0.fuel_bps / 10000);
      if (fuelOwed.current >= FUEL_BATCH) { const units = Math.floor(fuelOwed.current); fuelOwed.current -= units; useGame.getState().act({ t: "burn_fuel", units }); warned.current = false; }
    }
    if (player.started && player.fuel <= 0 && !warned.current) { warned.current = true; useGame.getState().say("Out of fuel. Refuel with credits, any time, from the panel at the top.", true); }
    model.spins.forEach((w) => { w.rotation.x += (speed * d) / 0.6; });
    // Front wheels point where the truck is turning. Positive y turns toward the driver's left.
    model.steers.forEach((w) => { w.rotation.y = smoothSteer.current * 0.42; });
    // The body leans away from the turn and squats under power, like real suspension.
    const roll = smoothSteer.current * Math.min(Math.abs(speed) / 18, 1) * 0.085 * Math.sign(speed || 1);
    const pitch = (down ? 0.035 : 0) - (up ? 0.03 : 0);
    model.lean.rotation.z = THREE.MathUtils.lerp(model.lean.rotation.z, roll, 1 - Math.exp(-d * 8));
    model.lean.rotation.x = THREE.MathUtils.lerp(model.lean.rotation.x, pitch, 1 - Math.exp(-d * 6));
    // Suspension: the body rides on a spring, jostled by speed and kicked by impacts.
    bumpClock.current -= d;
    if (grounded && Math.abs(speed) > 6 && bumpClock.current <= 0) { spring.current.v += (Math.random() - 0.5) * 0.5 * Math.min(1.6, Math.abs(speed) / 16); bumpClock.current = 0.12 + Math.random() * 0.22; }
    spring.current.v += (-spring.current.y * 150 - spring.current.v * 13) * d;
    spring.current.y = THREE.MathUtils.clamp(spring.current.y + spring.current.v * d, -0.13, 0.13);
    model.lean.position.y = spring.current.y;
    if (headlight.current) headlight.current.intensity = sky.night * 90;
    puffClock.current -= d;
    if (puffClock.current <= 0) {
      if (grounded && Math.abs(speed) > 9) { fx.emit(t.x - fwd.x * 1.9 + side.x * (Math.random() > 0.5 ? 0.9 : -0.9), t.z - fwd.z * 1.9 + side.z * (Math.random() > 0.5 ? 0.9 : -0.9), 0.25, 0); puffClock.current = 0.08; }
      if (player.started && healthPct < 0.35) { fx.emit(t.x + fwd.x * 1.2, t.z + fwd.z * 1.2, t.y + 1.2, 1); puffClock.current = player.durability <= 0 ? 0.08 : 0.2; }
    }
  });
  useEffect(() => { if (headlight.current && lightTarget.current) headlight.current.target = lightTarget.current; }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      sfx.prepare(); // starting audio on the first crash used to freeze the game for a moment
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space" && !keys.has("Space") && body.current && truck.pos.y < 1.2) { body.current.applyImpulse({ x: 0, y: 8 * body.current.mass(), z: 0 }, true); e.preventDefault(); }
      if (e.code === "KeyH" && !e.repeat) sfx.honk();
      if (/^(Arrow|Space)/.test(e.code)) e.preventDefault();
      keys.add(e.code);
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const tap = () => sfx.prepare();
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("pointerdown", tap);
    const hook = (window as unknown as { __nearverse: Record<string, unknown> }).__nearverse ??= {};
    hook.keys = keys; hook.truck = truck;
    hook.teleport = (x: number, z: number, yaw = 0) => { const b = body.current; b?.setTranslation({ x, y: 1, z }, true); b?.setLinvel({ x: 0, y: 0, z: 0 }, true); b?.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true); truck.pos.set(x, 1, z); };
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("pointerdown", tap); keys.clear(); };
  }, []);
  const onHit = (name: string) => {
    const now = performance.now();
    if (now - lastHit.current < 700) return;
    const sp = impactSpeed.current;
    if (sp < 6) return;
    lastHit.current = now;
    const { player, act, say } = useGame.getState();
    if (!player.started) return;
    const points = Math.min(25, Math.max(1, Math.round((sp - 4) * 1.5)));
    spring.current.v -= Math.min(3, sp * 0.14); fx.burst(truck.pos.x + Math.sin(truck.yaw) * 2, truck.pos.z + Math.cos(truck.yaw) * 2, false);
    if (act({ t: "damage", points })) { sfx.crash(); say(`Hit a ${name}: lost ${points} health. Repair with credits from the top panel.`, true); }
  };
  const onMine = (handle: number) => {
    const now = performance.now();
    if (now - (mineCool.current.get(handle) ?? 0) < 14000) return;
    mineCool.current.set(handle, now);
    const b = body.current, t = b.translation(), o = mineSpot(handle);
    if (o) { const l = Math.hypot(t.x - o.x, t.z - o.z) || 1; b.applyImpulse({ x: ((t.x - o.x) / l) * 18 * b.mass(), y: 10 * b.mass(), z: ((t.z - o.z) / l) * 18 * b.mass() }, true); }
    sfx.boom(); fx.burst(o?.x ?? truck.pos.x, o?.z ?? truck.pos.z, true); spring.current.v += 3;
    const { player, act, say } = useGame.getState();
    if (player.started && act({ t: "damage", points: 20 })) say("Mine! Lost 20 health. Rich spots are guarded.", true);
  };
  return (
    <>
      <Puffs src={fx} />
      <RigidBody ref={body} position={[0, 3, -3]} colliders={false} mass={3} enabledRotations={[false, true, false]} linearDamping={0.12} ccd restitution={0} name="truck"
        onCollisionEnter={({ other }) => {
          const named = obstacleNames.get(other.collider.handle) ?? (other.rigidBodyObject?.userData as { obstacle?: string } | undefined)?.obstacle;
          if (named) onHit(named);
        }}
        onIntersectionEnter={({ other }) => { if (mineHandles.has(other.collider.handle)) onMine(other.collider.handle); }}>
        <CuboidCollider key={v0.id} args={[1.05 * model.scale, 0.6, 2.1 * model.scale]} friction={0} frictionCombineRule={CoefficientCombineRule.Min} />
        <object3D ref={lightTarget} position={[0, 0, 16]} />
        <spotLight ref={headlight} position={[0, 1.3, 2]} angle={0.6} penumbra={0.7} distance={34} decay={1.1} color="#ffe6b0" intensity={0} />
        <group position={[0, -0.6, 0]}>
          <primitive object={model.root} />
          <group scale={model.scale}><Cargo model={model} /></group>
        </group>
      </RigidBody>
    </>
  );
}

const mineSpots = new Map<number, { x: number; z: number }>();
export const registerMine = (handle: number, x: number, z: number) => { mineSpots.set(handle, { x, z }); };
const mineSpot = (handle: number) => mineSpots.get(handle);
