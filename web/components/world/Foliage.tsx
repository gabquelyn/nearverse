"use client";
// Wind-blown grass tufts, leafy trees and drifting leaves.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng } from "@nearverse/economy";
import { LEVELS, MAX_GRASS, MAX_LEAVES, perf } from "./perf";
import { PAL, WORLD_SIZE, biomeAt, reserved, seeded, spacing, truck } from "./world";
import { Instances, type Spot } from "./Instances";
import { seeThrough } from "./effects";
import { useStaticColliders, type Solid } from "./colliders";

const time = { value: 0 };
const truckXZ = { value: new THREE.Vector2() };

const PATCH = 72; // a dense square of grass that wraps around the truck, so it covers the whole island cheaply

export function Grass({ map, biome, count = MAX_GRASS }: { map: THREE.Texture; biome: THREE.Texture; count?: number }) {
  const { geo, mat } = useMemo(() => {
    const rand = rng(4);
    const pos = new Float32Array(count * 9), col = new Float32Array(count * 9), tip = new Float32Array(count * 3), root = new Float32Array(count * 6), nor = new Float32Array(count * 9);
    const low = new THREE.Color("#2c4a1a"), hi = [new THREE.Color("#7ea83c"), new THREE.Color("#5f9136"), new THREE.Color("#9db84a"), new THREE.Color("#b3b552")];
    for (let i = 0; i < count; i++) {
      const x = (rand() - 0.5) * PATCH, z = (rand() - 0.5) * PATCH;
      const h = 0.6 + rand() * 0.75, w = 0.17 + rand() * 0.11, ang = rand() * Math.PI, lean = rand() * 6.28;
      const dx = Math.cos(ang) * w, dz = Math.sin(ang) * w, lx = Math.cos(lean) * h * 0.42, lz = Math.sin(lean) * h * 0.42;
      pos.set([-dx, 0, -dz, dx, 0, dz, lx, h, lz], i * 9);
      tip[i * 3 + 2] = 1;
      root.set([x, z, x, z, x, z], i * 6);
      nor.set([0, 1, 0, 0, 1, 0, 0, 1, 0], i * 9);
      const t = hi[Math.floor(rand() * hi.length)], v = 0.82 + rand() * 0.3;
      col.set([low.r, low.g, low.b, low.r, low.g, low.b, t.r * v, t.g * v, t.b * v], i * 9);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("aTip", new THREE.BufferAttribute(tip, 1));
    geo.setAttribute("aRoot", new THREE.BufferAttribute(root, 2));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (s) => {
      s.uniforms.uTime = time; s.uniforms.uTruck = truckXZ; s.uniforms.uMap = { value: map }; s.uniforms.uBiome = { value: biome };
      // Light both sides of a blade the same, or the back faces render black.
      s.fragmentShader = s.fragmentShader.replace("#include <normal_fragment_begin>", "vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;");
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nattribute float aTip; attribute vec2 aRoot; uniform float uTime; uniform vec2 uTruck; uniform sampler2D uMap; uniform sampler2D uBiome;")
        .replace("#include <color_vertex>", /* glsl */ `#include <color_vertex>
          vec2 nvW = uTruck + mod(aRoot - uTruck + ${(PATCH / 2).toFixed(1)}, ${PATCH.toFixed(1)}) - ${(PATCH / 2).toFixed(1)};
          vec3 nvB = texture2D(uBiome, (nvW + ${(WORLD_SIZE / 2).toFixed(1)}) / ${WORLD_SIZE.toFixed(1)}).rgb;
          vColor.rgb = mix(vColor.rgb, vColor.rgb*.25+vec3(.72,.78,.86), nvB.r);
          vColor.rgb = mix(vColor.rgb, vec3(.62,.50,.24)*(.7+aTip*.5), nvB.g);
          vColor.rgb = mix(vColor.rgb, vec3(.135,.235,.055), smoothstep(4.,21.,length(nvW-uTruck))*(1.-nvB.r)*(1.-nvB.g));`)
        .replace("#include <begin_vertex>", /* glsl */ `#include <begin_vertex>
          vec2 world = uTruck + mod(aRoot - uTruck + ${(PATCH / 2).toFixed(1)}, ${PATCH.toFixed(1)}) - ${(PATCH / 2).toFixed(1)};
          vec3 ground = texture2D(uMap, (world + ${(WORLD_SIZE / 2).toFixed(1)}) / ${WORLD_SIZE.toFixed(1)}).rgb;
          float clump = sin(world.x*.31+sin(world.y*.17)*2.)+sin(world.y*.27+sin(world.x*.13)*2.);
          float grow = (1.-smoothstep(.2,.42,ground.r))*(1.-smoothstep(.15,.35,ground.g))*(1.-smoothstep(.2,.5,ground.b));
          grow *= .84+.16*clump;
          vec3 region = texture2D(uBiome, (world + ${(WORLD_SIZE / 2).toFixed(1)}) / ${WORLD_SIZE.toFixed(1)}).rgb;
          grow *= (1.-smoothstep(.2,.5,region.b))*(1.-region.g+region.g*step(.93,fract(aRoot.x*7.3+aRoot.y*3.1))*.7)*(1.-region.r*.45);
          grow = clamp(grow*1.5, 0., 1.5);
          vec2 away = world-uTruck; float dist = length(away);
          // Each blade fades at its own distance, so there is no ring where the grass stops. Colour already matches the ground by then.
          float nvEdge = fract(aRoot.x*3.7+aRoot.y*5.3);
          grow *= 1.-smoothstep(11.+nvEdge*10.,23.+nvEdge*12.,dist);
          float gust = sin(world.x*.22+uTime*1.3)*.5+sin(world.y*.31+uTime*1.9+world.x*.1)*.3;
          transformed *= grow;
          transformed.xz += aTip*vec2(.25,.15)*gust*grow;
          float press = (1.-smoothstep(1.3,3.,dist))*aTip;
          transformed.xz += normalize(away+.001)*press*.7; transformed.y *= 1.-press*.8;
          transformed.xz += world;`);
    };
    return { geo, mat };
  }, [map, count]);
  useFrame((_, dt) => {
    time.value += dt; truckXZ.value.set(truck.pos.x, truck.pos.z);
    geo.setDrawRange(0, Math.floor(count * LEVELS[perf.level].grass) * 3);
  });
  return <mesh geometry={geo} material={mat} receiveShadow frustumCulled={false} />;
}

function leafTexture() {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const g = cv.getContext("2d")!; const r = seeded(9);
  g.fillStyle = "#fff";
  for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = r() * 42, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d; g.beginPath(); g.ellipse(x, y, 9 + r() * 8, 6 + r() * 5, r() * 3, 0, 7); g.fill(); }
  return new THREE.CanvasTexture(cv);
}

function clusterGeometry() {
  const r = seeded(21), planes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 38; i++) {
    const pl = new THREE.PlaneGeometry(1.25, 1.25);
    const dir = new THREE.Vector3().setFromSphericalCoords(1 - Math.pow(r(), 3), Math.acos(2 * r() - 1), r() * 6.28);
    pl.lookAt(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
    pl.translate(dir.x, dir.y, dir.z);
    const p = pl.attributes.position, nor = pl.attributes.normal; const v = new THREE.Vector3(), o = dir.clone().normalize();
    for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k).normalize().lerp(o, 0.8).normalize(); nor.setXYZ(k, v.x, v.y, v.z); }
    planes.push(pl);
  }
  return mergeGeometries(planes)!;
}

export interface TreeSpot { x: number; z: number; s: number; kind: number }
const CANOPY = ["#4f8a3a", "#6f9d3c", "#3e7a45", "#d98a2e", "#8fa83a", "#c9592c"];

export function useTrees(count = 3000): TreeSpot[] {
  return useMemo(() => {
    const r = seeded(11), out: TreeSpot[] = [], room = spacing(5.5);
    for (let t = 0; out.length < count && t < count * 14; t++) {
      const a = r() * 6.283, d = 40 + Math.sqrt(r()) * 950, x = Math.cos(a) * d, z = Math.sin(a) * d, b = biomeAt(x, z);
      if (b.snow > 0.25 || b.desert > 0.25 || b.city > 0.1) continue;
      // Trees gather in groves, with open meadows between them.
      if (Math.sin(x * 0.019 + Math.sin(z * 0.011) * 2.2) + Math.sin(z * 0.023 + Math.sin(x * 0.014) * 2.2) < 0.15) continue;
      if (!room.free(x, z) || reserved(x, z)) continue;
      room.add(x, z);
      out.push({ x, z, s: 0.85 + r() * 0.7, kind: Math.floor(r() * CANOPY.length) });
    }
    return out;
  }, [count]);
}

export function Trees({ trees }: { trees: TreeSpot[] }) {
  const { canopy, trunk, solid, leafGeo, leafMat, depthMat, trunkGeo, barkMat } = useMemo(() => {
    const r = seeded(31), canopy: Spot[] = [], trunk: Spot[] = [], solid: Solid[] = [];
    trees.forEach((t) => {
      const base = new THREE.Color(CANOPY[t.kind]);
      trunk.push({ x: t.x, z: t.z, sx: t.s, ry: r() * 6 });
      solid.push({ kind: "box", x: t.x, y: 2, z: t.z, hx: 0.42 * t.s, hy: 2, hz: 0.42 * t.s });
      const n = 3 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const a = r() * 6.28, d = i === 0 ? 0 : (0.9 + r() * 0.8) * t.s;
        canopy.push({ x: t.x + Math.cos(a) * d, y: (3.9 + (i === 0 ? 0.8 : r() * 0.7 - 0.2)) * t.s, z: t.z + Math.sin(a) * d, sx: (1.15 + r() * 0.65) * t.s, ry: r() * 6.28, color: `#${base.clone().offsetHSL(0, 0, (r() - 0.5) * 0.09).getHexString()}` });
      }
    });
    const alpha = leafTexture();
    const leafMat = new THREE.MeshLambertMaterial({ alphaMap: alpha, alphaTest: 0.5, side: THREE.DoubleSide });
    leafMat.onBeforeCompile = ((m: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string }) => {
      m.uniforms.uTime = time;
      m.fragmentShader = m.fragmentShader.replace("#include <normal_fragment_begin>", "vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;");
      m.vertexShader = m.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace("#include <begin_vertex>", `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec3 nvO = instanceMatrix[3].xyz;
        transformed.x += sin(uTime*1.1+nvO.x*.4+position.y*1.6)*.07; transformed.z += cos(uTime*.9+nvO.z*.4+position.x*1.6)*.07;
        #endif`);
    }) as never;
    seeThrough(leafMat);
    const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: alpha, alphaTest: 0.5, side: THREE.DoubleSide });
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.42, 4, 7, 1).translate(0, 2, 0);
    return { canopy, trunk, solid, leafGeo: clusterGeometry(), leafMat, depthMat, trunkGeo, barkMat: new THREE.MeshLambertMaterial({ color: PAL.bark, flatShading: true }) };
  }, [trees]);
  useFrame(() => { const total = leafGeo.index ? leafGeo.index.count : leafGeo.attributes.position.count; leafGeo.setDrawRange(0, Math.floor((total / 6) * LEVELS[perf.level].cards) * 6); });
  useStaticColliders(solid, "tree");
  return (
    <>
      <Instances geometry={leafGeo} material={leafMat} items={canopy} depthMaterial={depthMat} />
      <Instances geometry={trunkGeo} material={barkMat} items={trunk} />
    </>
  );
}

/** Leaves in the forest, snow in the snowfields, blowing sand in the desert, nothing in the city. */
export function Weather({ count = MAX_LEAVES }: { count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const state = useMemo(() => { const r = seeded(77); return Array.from({ length: count }, () => ({ x: r() * 70 - 35, y: r() * 12, z: r() * 70 - 35, a: r() * 6.28, sp: 0.5 + r() * 0.9, seed: r() })); }, [count]);
  const d = useMemo(() => new THREE.Object3D(), []);
  const mode = useRef(-1);
  const palette = useMemo(() => [["#6f9d3c", "#d98a2e", "#c9592c"], ["#ffffff", "#eaf2ff", "#ffffff"], ["#d9b980", "#c9a56a", "#e3c690"], ["#000000", "#000000", "#000000"]].map((p) => p.map((h) => new THREE.Color(h))), []);
  useFrame((_, dt) => {
    const t = time.value, b = biomeAt(truck.pos.x, truck.pos.z);
    const now = b.snow > 0.5 ? 1 : b.desert > 0.5 ? 2 : b.city > 0.5 ? 3 : 0;
    const shown = now === 3 ? 0 : Math.floor(count * LEVELS[perf.level].leaves * (now === 1 ? 1.25 : 1));
    ref.current.count = perf.warming ? 1 : Math.min(count, shown);
    if (now !== mode.current) {
      mode.current = now;
      state.forEach((s, i) => ref.current.setColorAt(i, palette[now][i % 3]));
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
      state.forEach((s) => { s.x = truck.pos.x + s.seed * 70 - 35; s.z = truck.pos.z + (s.a / 6.28) * 70 - 35; });
    }
    for (let i = 0; i < ref.current.count; i++) {
      const s = state[i];
      if (now === 1) { s.y -= (s.sp + 1.2) * dt; s.x += Math.sin(t * 0.7 + s.a) * dt * 0.8; }
      else if (now === 2) { s.y = 0.3 + s.seed * 1.8; s.x -= (9 + s.sp * 8) * dt; s.z += Math.sin(t + s.a) * dt; }
      else { s.y -= s.sp * dt; s.x += Math.sin(t * 0.7 + s.a) * dt * 1.5 + dt * 1.1; s.z += Math.cos(t * 0.5 + s.a) * dt; }
      if (s.y < 0.02 || Math.abs(s.x - truck.pos.x) > 38 || Math.abs(s.z - truck.pos.z) > 38) { s.y = 8 + s.seed * 6; s.x = truck.pos.x + ((s.a * 11 + t * 3) % 70) - 35; s.z = truck.pos.z + ((s.a * 17 + t * 5) % 70) - 35; }
      const size = now === 1 ? 0.65 : 1;
      d.position.set(s.x, s.y, s.z); d.rotation.set(t * s.sp + s.a, t * 0.7 + s.a, s.a); d.scale.setScalar(size); d.updateMatrix(); ref.current.setMatrixAt(i, d.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}><planeGeometry args={[0.22, 0.16]} /><meshBasicMaterial side={THREE.DoubleSide} /></instancedMesh>;
}
