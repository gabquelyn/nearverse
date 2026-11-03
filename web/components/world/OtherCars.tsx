"use client";
// Other players and labeled ghost traders. A fixed pool of cars, so someone joining never costs a frame.
import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";
import { rules as c } from "@nearverse/economy";
import { forgetStale, others, ingest, type OtherCar } from "@/lib/realtime";
import { useGame } from "@/lib/state/game";
import { truck } from "./world";
import { perf } from "./perf";
import { buildVehicle, type VehicleModel } from "./vehicleModel";

const SLOTS = 10, RANGE = 300;

function labelTexture(text: string, ghost: boolean) {
  const cv = document.createElement("canvas"); cv.width = 320; cv.height = 64;
  const g = cv.getContext("2d")!;
  g.font = "700 30px 'Atkinson Hyperlegible', sans-serif";
  const w = Math.min(310, g.measureText(text).width + 28);
  g.fillStyle = ghost ? "rgba(90, 64, 12, .92)" : "rgba(14, 34, 41, .92)";
  g.beginPath(); g.roundRect((320 - w) / 2, 8, w, 48, 14); g.fill();
  g.fillStyle = ghost ? "#ffd98a" : "#f2efe3"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 160, 33, 300);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

interface Slot { group: THREE.Group; holder: THREE.Group; label: THREE.Sprite; car: string | null; name: string; model: VehicleModel | null; vehicle: number }

export const OtherCars = memo(function OtherCars() {
  const slots = useMemo<Slot[]>(() => Array.from({ length: SLOTS }, () => {
    const group = new THREE.Group(), holder = new THREE.Group(), label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, fog: false, transparent: true }));
    label.position.y = 4.2; label.scale.set(8, 1.6, 1); group.add(holder, label); group.visible = false;
    return { group, holder, label, car: null, name: "", model: null, vehicle: -1 };
  }), []);
  useEffect(() => {
    const hook = (window as unknown as { __nearverse?: Record<string, unknown> }).__nearverse ??= {};
    hook.ingest = ingest; hook.others = others; hook.game = useGame;
  }, []);
  useFrame((_, dt) => {
    const now = Date.now();
    forgetStale(now);
    const near: OtherCar[] = [];
    for (const car of others.values()) {
      if (car.trip) { const k = Math.min(1, Math.max(0, (now - car.trip.at) / car.trip.ms)); car.x = car.trip.fx + (car.trip.tx - car.trip.fx) * k; car.z = car.trip.fz + (car.trip.tz - car.trip.fz) * k; car.speed = k < 1 ? 22 : 0; }
      else {
        car.x = THREE.MathUtils.damp(car.x, car.toX, 6, dt); car.z = THREE.MathUtils.damp(car.z, car.toZ, 6, dt);
        car.yaw += Math.atan2(Math.sin(car.toYaw - car.yaw), Math.cos(car.toYaw - car.yaw)) * (1 - Math.exp(-8 * dt));
      }
      if (Math.hypot(car.x - truck.pos.x, car.z - truck.pos.z) < RANGE) near.push(car);
    }
    near.sort((a, b) => Math.hypot(a.x - truck.pos.x, a.z - truck.pos.z) - Math.hypot(b.x - truck.pos.x, b.z - truck.pos.z));
    slots.forEach((s, i) => {
      const car = near[i];
      s.group.visible = Boolean(car) || (perf.warming && i === 0);
      if (!car) { s.car = null; return; }
      if (s.vehicle !== car.vehicle || !s.model) {
        s.holder.clear();
        s.model = buildVehicle(c.vehicles[Math.min(car.vehicle, c.vehicles.length - 1)]); s.vehicle = car.vehicle; s.holder.add(s.model.root);
      }
      if (s.name !== car.name || s.car !== car.id) {
        s.label.material.map?.dispose(); s.label.material.map = labelTexture(car.name, car.kind === "ghost"); s.label.material.needsUpdate = true; s.name = car.name; s.car = car.id;
      }
      s.group.position.set(car.x, 0, car.z); s.group.rotation.y = car.yaw;
      s.model.spins.forEach((w) => { w.rotation.x += (car.speed * Math.min(dt, 0.1)) / 0.6; });
    });
  });
  return <>{slots.map((s, i) => <primitive key={i} object={s.group} />)}</>;
});
