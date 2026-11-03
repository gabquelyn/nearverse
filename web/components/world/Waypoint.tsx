"use client";
// A light beam over the destination and an arrow over the truck pointing to it.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useGame } from "@/lib/state/game";
import { truck } from "./world";
import { perf } from "./perf";

export function Waypoint() {
  const waypoint = useGame((s) => s.waypoint);
  const arrow = useRef<THREE.Group>(null!), beam = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const w = useGame.getState().waypoint;
    if (!w || !arrow.current) return;
    arrow.current.position.set(truck.pos.x, truck.pos.y + 3.6, truck.pos.z);
    arrow.current.rotation.y = Math.atan2(w.x - truck.pos.x, w.z - truck.pos.z);
    if (Math.hypot(w.x - truck.pos.x, w.z - truck.pos.z) < 9) { useGame.getState().setWaypoint(null); useGame.getState().say(`You've arrived at ${w.label}.`); }
  });
  const show = Boolean(waypoint) || perf.warming; // kept mounted so its first appearance needs no compile
  return (
    <>
      <mesh ref={beam} visible={show} position={[waypoint?.x ?? 0, 40, waypoint?.z ?? 0]}><cylinderGeometry args={[1.8, 1.8, 80, 12, 1, true]} /><meshBasicMaterial color="#ffc94d" transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} fog={false} /></mesh>
      <group ref={arrow} visible={show}>
        <mesh position={[0, 0, 2.4]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.85, 1.7, 4]} /><meshBasicMaterial color="#ffc94d" fog={false} /></mesh>
        <mesh position={[0, 0, 0.9]}><boxGeometry args={[0.5, 0.2, 1.8]} /><meshBasicMaterial color="#ffc94d" fog={false} /></mesh>
      </group>
    </>
  );
}
