"use client";
// A light beam over the destination and an arrow over the truck pointing to it.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useGame } from "@/lib/state/game";
import { truck } from "./world";
import { perf } from "./perf";

/** The classic arrow cursor, lying flat with its tip pointing the way. */
const CURSOR = (() => {
  const P = 0.1, tilt = Math.atan2(5.5, 14), shape = new THREE.Shape();
  const points: [number, number][] = [[0, 0], [0, 16], [4, 12], [7, 18], [9, 17], [6, 11], [11, 11]];
  points.forEach(([x, y], i) => { const px = x * P, py = -y * P; if (i) shape.lineTo(px, py); else shape.moveTo(px, py); });
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  g.rotateZ(-tilt); // stands the tip straight up
  g.translate(0, 0.9, 0); // centred, so the outline grows evenly around it
  g.rotateX(Math.PI / 2);
  return g;
})();

export function Waypoint() {
  const waypoint = useGame((s) => s.waypoint);
  const arrow = useRef<THREE.Group>(null!), beam = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const w = useGame.getState().waypoint;
    if (!w || !arrow.current) return;
    arrow.current.position.set(truck.pos.x, truck.pos.y + 3.2, truck.pos.z);
    arrow.current.rotation.y = Math.atan2(w.x - truck.pos.x, w.z - truck.pos.z);
    if (Math.hypot(w.x - truck.pos.x, w.z - truck.pos.z) < 9) { useGame.getState().setWaypoint(null); useGame.getState().say(`You've arrived at ${w.label}.`); }
  });
  const show = Boolean(waypoint) || perf.warming; // kept mounted so its first appearance needs no compile
  return (
    <>
      <mesh ref={beam} visible={show} position={[waypoint?.x ?? 0, 40, waypoint?.z ?? 0]}><cylinderGeometry args={[1.8, 1.8, 80, 12, 1, true]} /><meshBasicMaterial color="#ffc94d" transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} fog={false} /></mesh>
      <group ref={arrow} visible={show}>
        <mesh geometry={CURSOR} position={[0, -0.02, 2.2]} scale={1.25}><meshBasicMaterial color="#10161c" fog={false} side={THREE.DoubleSide} depthTest={false} transparent /></mesh>
        <mesh geometry={CURSOR} position={[0, 0, 2.2]} renderOrder={1}><meshBasicMaterial color="#ffffff" fog={false} side={THREE.DoubleSide} depthTest={false} transparent /></mesh>
      </group>
    </>
  );
}
