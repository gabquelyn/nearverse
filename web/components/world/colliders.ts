"use client";
// Thousands of solid objects, created in one go without a React component each.
import { useRapier } from "@react-three/rapier";
import { useEffect } from "react";

export interface Solid { kind: "box"; x: number; y: number; z: number; hx: number; hy: number; hz: number; ry?: number }
export interface Round { kind: "ball"; x: number; y: number; z: number; r: number }

/** Which obstacle each collider belongs to, read when the truck hits something. */
export const obstacleNames = new Map<number, string>();
export const mineHandles = new Map<number, number>();

export function useStaticColliders(list: (Solid | Round)[], name: string | null, opts: { sensor?: boolean; onMade?: (handle: number, index: number) => void } = {}) {
  const { world, rapier } = useRapier();
  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    const made: number[] = [];
    list.forEach((s, i) => {
      const desc = s.kind === "ball" ? rapier.ColliderDesc.ball(s.r) : rapier.ColliderDesc.cuboid(s.hx, s.hy, s.hz);
      desc.setTranslation(s.x, s.y, s.z);
      if (s.kind === "box" && s.ry) desc.setRotation({ x: 0, y: Math.sin(s.ry / 2), z: 0, w: Math.cos(s.ry / 2) });
      if (opts.sensor) desc.setSensor(true);
      const col = world.createCollider(desc, body);
      made.push(col.handle);
      if (name) obstacleNames.set(col.handle, name);
      opts.onMade?.(col.handle, i);
    });
    return () => { made.forEach((h) => { obstacleNames.delete(h); mineHandles.delete(h); }); world.removeRigidBody(body); };
  }, [world, rapier, list, name]); // eslint-disable-line react-hooks/exhaustive-deps
}
