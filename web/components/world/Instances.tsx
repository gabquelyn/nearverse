"use client";
// One draw call for many copies of a thing, drawing only those near the truck. This is what keeps a big world fast.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { truck } from "./world";
import { perf } from "./perf";

export interface Spot { x: number; y?: number; z: number; sx?: number; sy?: number; sz?: number; ry?: number; color?: string }

const CELL = 120;
let lastRefreshAt = -1; // at most one mesh refreshes per frame, so refreshes never pile up into a hitch

export function Instances({ geometry, material, items, radius = 95, castShadow = true, receiveShadow = false, depthMaterial }: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; items: Spot[]; radius?: number; castShadow?: boolean; receiveShadow?: boolean; depthMaterial?: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const cells = useMemo(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), out = new Map<string, { x: number; z: number; mat: THREE.Matrix4; col: THREE.Color | null }[]>();
    for (const s of items) {
      const key = `${Math.floor(s.x / CELL)},${Math.floor(s.z / CELL)}`;
      const entry = { x: s.x, z: s.z, mat: m.compose(new THREE.Vector3(s.x, s.y ?? 0, s.z), q.setFromAxisAngle(up, s.ry ?? 0), new THREE.Vector3(s.sx ?? 1, s.sy ?? s.sx ?? 1, s.sz ?? s.sx ?? 1)).clone(), col: s.color ? new THREE.Color(s.color) : null };
      const l = out.get(key); if (l) l.push(entry); else out.set(key, [entry]);
    }
    return out;
  }, [items]);
  // Enough room for what can be nearby at once, not the whole world.
  const capacity = useMemo(() => { let most = 0; for (const l of cells.values()) most = Math.max(most, l.length); return Math.max(1, Math.min(items.length, most * 12)); }, [cells, items.length]);
  const last = useRef({ x: 1e9, z: 1e9 }), wasWarming = useRef(true);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    // A placeholder drawn only to compile the shader must not linger after loading, so refresh once when that ends.
    if (wasWarming.current && !perf.warming) { wasWarming.current = false; last.current = { x: 1e9, z: 1e9 }; }
    if (Math.hypot(last.current.x - truck.pos.x, last.current.z - truck.pos.z) < 8) return;
    if (lastRefreshAt === clock.elapsedTime && !perf.warming && last.current.x !== 1e9) return;
    lastRefreshAt = clock.elapsedTime;
    last.current = { x: truck.pos.x, z: truck.pos.z };
    const cx = Math.floor(truck.pos.x / CELL), cz = Math.floor(truck.pos.z / CELL), reach = Math.ceil(radius / CELL);
    let n = 0;
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
      const l = cells.get(`${cx + i},${cz + j}`);
      if (!l) continue;
      for (const d of l) {
        if (n >= capacity || Math.abs(d.x - truck.pos.x) > radius || Math.abs(d.z - truck.pos.z) > radius) continue;
        mesh.setMatrixAt(n, d.mat);
        if (d.col) mesh.setColorAt(n, d.col);
        n++;
      }
    }
    if (n === 0 && perf.warming && items.length) { const first = cells.values().next().value; if (first) { mesh.setMatrixAt(0, first[0].mat); if (first[0].col) mesh.setColorAt(0, first[0].col); n = 1; } }
    mesh.count = n;
    mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, n * 16); mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) { mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, n * 3); mesh.instanceColor.needsUpdate = true; }
  });
  return <instancedMesh ref={ref} args={[geometry, material as THREE.Material, capacity]} castShadow={castShadow} receiveShadow={receiveShadow} customDepthMaterial={depthMaterial} frustumCulled={false} />;
}

/** Hides a group when the truck is far away. */
export function Near({ x, z, radius = 110, children }: { x: number; z: number; radius?: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame(() => { ref.current.visible = perf.warming || (Math.abs(truck.pos.x - x) < radius && Math.abs(truck.pos.z - z) < radius); });
  return <group ref={ref}>{children}</group>;
}
