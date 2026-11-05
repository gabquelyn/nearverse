"use client";
// A city of different kinds of building: towers, apartments, shops, warehouses, houses, a market hall and a clock tower.
// They are all a few shared parts, scaled and tinted, so hundreds of buildings cost about a dozen draw calls.
import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Instances, Near, type Spot } from "./Instances";
import { DRIVE_RADIUS, biomeAt, reserved, seeded } from "./world";
import { useStaticColliders, type Solid } from "./colliders";
import { seeThrough } from "./effects";

const CENTER = { x: 630, z: -230 };

/** A wall texture that tiles in real metres, so a tall tower has more floors rather than stretched windows. */
function wallTexture(kind: "office" | "apartment" | "shop" | "plain", lit: boolean) {
  const S = 256, cv = document.createElement("canvas"); cv.width = cv.height = S;
  const g = cv.getContext("2d")!, r = seeded(kind.length * 17 + 3), cols = kind === "shop" ? 2 : kind === "plain" ? 4 : 8, rows = kind === "shop" ? 1 : kind === "plain" ? 1 : 8;
  g.fillStyle = lit ? "#000" : kind === "office" ? "#dfe5ea" : "#f2f0ea"; g.fillRect(0, 0, S, S);
  if (kind === "plain" && !lit) { g.strokeStyle = "rgba(40,40,45,.22)"; g.lineWidth = 2; for (let x = 0; x < S; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); } }
  const cw = S / cols, ch = S / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const on = r() > (kind === "shop" ? 0 : 0.5), px = x * cw, py = y * ch;
    if (kind === "office") { g.fillStyle = lit ? (on ? "#ffe2a8" : "#000") : "#3e5a70"; g.fillRect(px + 2, py + 3, cw - 4, ch - 9); }
    else if (kind === "apartment") { g.fillStyle = lit ? (on ? "#ffc56e" : "#000") : "#46596a"; g.fillRect(px + cw * 0.22, py + ch * 0.2, cw * 0.56, ch * 0.5); if (!lit) { g.fillStyle = "rgba(60,50,45,.45)"; g.fillRect(px + cw * 0.16, py + ch * 0.72, cw * 0.68, 3); } }
    else if (kind === "shop") { g.fillStyle = lit ? "#ffd98c" : "#37505e"; g.fillRect(px + 8, ch * 0.38, cw - 16, ch * 0.54); }
    else if (y === 0) { g.fillStyle = lit ? "#000" : "#51626c"; g.fillRect(px + 10, 18, cw - 20, 24); }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

function wallMat(kind: "office" | "apartment" | "shop" | "plain", tileW: number, tileH: number) {
  const m = seeThrough(new THREE.MeshLambertMaterial({ color: "#ffffff" })) as THREE.MeshLambertMaterial;
  m.map = wallTexture(kind, false); m.emissiveMap = wallTexture(kind, true); m.emissive = new THREE.Color("#ffffff"); m.emissiveIntensity = 0;
  const before = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    before.call(m, s, r);
    s.vertexShader = s.vertexShader.replace("#include <uv_vertex>", /* glsl */ `#include <uv_vertex>
      #ifdef USE_INSTANCING
      vec3 nvScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      vec2 nvUv = uv * vec2(abs(normal.x) > .5 ? nvScale.z : nvScale.x, nvScale.y) / vec2(${tileW.toFixed(1)}, ${tileH.toFixed(1)});
      vMapUv = nvUv; vEmissiveMapUv = nvUv;
      #endif`);
  };
  m.customProgramCacheKey = () => `wall-${tileW}-${tileH}`;
  return m;
}

/** All lit windows, so the sky can switch them on together at night. */
export const windowMats: THREE.MeshLambertMaterial[] = [];

function prism(slope: boolean) {
  // One unit wide, high and deep. A gable peaks in the middle; a wedge rises from front to back, for awnings.
  const top = slope ? 0.5 : 0;
  const v = [[-.5,0,-.5],[.5,0,-.5],[.5,0,.5],[-.5,0,.5],[-.5,1,top],[.5,1,top]];
  const tri = [0,3,2, 0,2,1, 3,5,2, 3,4,5, 0,1,5, 0,5,4, 1,2,5, 0,4,3];
  const pos: number[] = []; for (const i of tri) pos.push(...v[i]);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
function wedge() {
  const v = [[-.5,0,-.5],[.5,0,-.5],[.5,0,.5],[-.5,0,.5],[-.5,1,.5],[.5,1,.5]];
  const tri = [0,3,2, 0,2,1, 3,5,2, 3,4,5, 0,1,5, 0,5,4, 1,2,5, 0,4,3];
  const pos: number[] = []; for (const i of tri) pos.push(...v[i]);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}

const OFFICE = ["#9fb4c6", "#b6c2cc", "#8aa3b8", "#a9b9b2", "#c0c4cf"], APARTMENT = ["#c98a68", "#d8c8a8", "#b86f58", "#c9d2c4", "#e0d6c4", "#a9a0b8"];
const SHOP = ["#e6b45c", "#d7705a", "#6aa7b8", "#8cb56a", "#c98abb", "#efe3c4"], WARE = ["#8d949c", "#a1846a", "#7d8a84", "#9a9aa2"], ROOFS = ["#7c3d30", "#55606e", "#8f5b3a", "#3f5a4e"], HOUSE = ["#efe6d2", "#d7dfe6", "#e5c9b0", "#c7d4bd"];

interface Plan { cars: Spot[]; trees: Spot[]; poles: Spot[]; office: Spot[]; apartment: Spot[]; shop: Spot[]; plain: Spot[]; box: Spot[]; gable: Spot[]; wedge: Spot[]; solids: Solid[]; clock: { x: number; z: number } | null }

function planCity(): Plan {
  const p: Plan = { cars: [], trees: [], poles: [], office: [], apartment: [], shop: [], plain: [], box: [], gable: [], wedge: [], solids: [], clock: null };
  const r = seeded(61), step = 36, pick = (l: string[]) => l[Math.floor(r() * l.length)], rng = (a: number, b: number) => a + r() * (b - a);
  const body = (list: Spot[], x: number, z: number, sx: number, sy: number, sz: number, color: string, y = 0) => {
    list.push({ x, y, z, sx, sy, sz, color });
    p.solids.push({ kind: "box", x, y: y + sy / 2, z, hx: sx / 2, hy: sy / 2, hz: sz / 2 });
  };
  const part = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string) => p.box.push({ x, y, z, sx, sy, sz, color });
  const roofTop = (x: number, top: number, z: number, sx: number, sz: number, color: string) => {
    part(x, top, z, sx + 0.7, 0.5, sz + 0.7, color); // cornice
    part(x + rng(-sx, sx) * 0.2, top + 0.5, z + rng(-sz, sz) * 0.2, 2.4, 1.3, 2, "#7d8388");
  };

  const tower = (x: number, z: number) => {
    // Low enough not to hide the car from the chase camera. Only a rare tower stands taller, away from the main roads.
    const tall = r() < 0.12 && !reserved(x, z, 45);
    const c = pick(OFFICE), w = rng(13, 18), d = rng(13, 18), h = 3 * Math.floor(tall ? rng(6, 9) : rng(2, 4));
    body(p.shop, x, z, 22, 4.5, 22, "#c9c5ba");
    body(p.office, x, z, w, h, d, c, 4.5);
    const top = 4.5 + h, up = 3;
    body(p.office, x, z, w * 0.62, up, d * 0.62, c, top);
    roofTop(x, top + up, z, w * 0.62, d * 0.62, "#5b6068");
    if (r() < 0.5) part(x, top + up + 0.5, z, 0.3, rng(5, 11), 0.3, "#c4c8cc");
  };
  const apartments = (x: number, z: number) => {
    const c = pick(APARTMENT), w = rng(16, 23), d = rng(13, 21), h = 3 * Math.floor(rng(3, 6));
    body(p.apartment, x, z, w, h, d, c);
    roofTop(x, h, z, w, d, "#6e6660");
    if (r() < 0.6) { const tx = x + rng(-w, w) * 0.25, tz = z + rng(-d, d) * 0.25; part(tx, h + 0.5, tz, 2.6, 3, 2.6, "#7a5a3e"); p.gable.push({ x: tx, y: h + 3.5, z: tz, sx: 3, sy: 1, sz: 3, color: "#55606e" }); }
  };
  const shops = (x: number, z: number) => {
    const n = 2 + Math.floor(r() * 3), W = 23 / n, front = r() < 0.5 ? -1 : 1, d = rng(11, 15);
    for (let k = 0; k < n; k++) {
      const sx = x - 11.5 + W * (k + 0.5), h = rng(4.5, 7.5), c = pick(SHOP), cloth = pick(["#b33c34", "#2d6f8e", "#3f7d4e", "#c98a1e", "#7a4b8f"]);
      body(p.shop, sx, z, W - 0.2, h, d, c);
      part(sx, h, z, W + 0.1, 0.45, d + 0.3, "#6b6258");
      const az = z + front * (d / 2 + 1.1);
      p.wedge.push({ x: sx, y: 3.1, z: az, sx: W - 0.8, sy: 0.9, sz: 2.2, ry: front < 0 ? 0 : Math.PI, color: cloth });
    }
  };
  const warehouse = (x: number, z: number) => {
    const w = rng(19, 24), d = rng(14, 20), h = rng(5.5, 8), c = pick(WARE), turn = r() < 0.5, front = r() < 0.5 ? -1 : 1;
    body(p.plain, x, z, w, h, d, c);
    p.gable.push({ x, y: h, z, sx: turn ? d + 0.8 : w + 0.8, sy: rng(2, 3.2), sz: turn ? w + 0.8 : d + 0.8, ry: turn ? Math.PI / 2 : 0, color: pick(["#6a7078", "#7a5a48", "#55606e"]) });
    part(x + rng(-w, w) * 0.2, 0, z + front * (d / 2), 5.5, 4.6, 0.24, "#3c4248");
    part(x, 0, z + front * (d / 2 + 0.9), Math.min(w, 11), 0.9, 1.8, "#8b8880");
  };
  const house = (x: number, z: number, turn: boolean) => {
    const w = rng(7, 10), d = rng(6, 8), h = rng(3.2, 5.6), roof = pick(ROOFS);
    body(p.apartment, x, z, w, h, d, pick(HOUSE));
    p.gable.push({ x, y: h, z, sx: turn ? d + 1 : w + 1, sy: rng(1.8, 2.8), sz: turn ? w + 1 : d + 1, ry: turn ? Math.PI / 2 : 0, color: roof });
    part(x + w * 0.25, h, z + d * 0.15, 0.8, 2.6, 0.8, "#7c5a4c");
  };
  const houses = (x: number, z: number) => { const turn = r() < 0.5; house(x - 6.2, z - 6, turn); house(x + 6.2, z + 6, !turn); if (r() < 0.5) house(x + 6.2, z - 6.5, turn); };
  const marketHall = (x: number, z: number) => {
    body(p.shop, x, z, 24, 6, 16, "#d9c7a2");
    p.gable.push({ x, y: 6, z, sx: 26, sy: 4, sz: 18, color: "#7c3d30" });
    for (const sx of [-9, -3, 3, 9]) for (const sz of [-9.3, 9.3]) part(x + sx, 0, z + sz, 0.7, 6.3, 0.7, "#f0e8d6");
    part(x, 6, z - 9.3, 25, 0.4, 2.6, "#b9a98c"); part(x, 6, z + 9.3, 25, 0.4, 2.6, "#b9a98c");
  };
  const clockTower = (x: number, z: number) => {
    body(p.apartment, x, z, 8, 26, 8, "#b89e80");
    part(x, 26, z, 9, 0.8, 9, "#6e5a48");
    p.gable.push({ x, y: 26.8, z, sx: 9, sy: 6, sz: 9, color: "#3f5a4e" });
    p.clock = { x, z };
  };

  const spots: { x: number; z: number; d: number }[] = [];
  for (let i = 4; i <= 28; i++) for (let j = -19; j <= 8; j++) {
    const x = 18 + i * step, z = 18 + j * step, cx = x + (r() - 0.5) * 1.5, cz = z + (r() - 0.5) * 1.5;
    if (biomeAt(cx, cz).city < 0.72 || Math.hypot(cx, cz) > DRIVE_RADIUS - 24 || r() < 0.12 || reserved(cx, cz, 13)) continue;
    spots.push({ x: cx, z: cz, d: Math.hypot(cx - CENTER.x, cz - CENTER.z) });
  }
  // Street life: trees and lights on the corners, cars parked along the kerb, bus shelters and signs here and there.
  const CAR = ["#b33c34", "#2d6f8e", "#e7e2d8", "#3a3f46", "#c98a1e", "#3f7d4e", "#9aa3ad"];
  for (const s of spots) {
    const corners: [number, number][] = [[-13, -13], [13, -13], [-13, 13], [13, 13]];
    corners.forEach(([ox, oz], k) => {
      const x = s.x + ox, z = s.z + oz;
      if (reserved(x, z, 0)) return;
      const q = r();
      if (k % 2 === 0 && q < 0.6) { p.trees.push({ x, y: 0, z, ry: r() * 6, sx: rng(0.85, 1.2), sy: rng(0.9, 1.3), sz: rng(0.85, 1.2) }); p.solids.push({ kind: "box", x, y: 1.5, z, hx: 0.3, hy: 1.5, hz: 0.3 }); }
      else if (k % 2 === 1 && q < 0.55) { p.poles.push({ x, y: 0, z, ry: (k === 1 ? 0 : Math.PI) }); p.solids.push({ kind: "box", x, y: 2, z, hx: 0.18, hy: 2, hz: 0.18 }); }
    });
    if (r() < 0.65) {
      const side = r() < 0.5 ? -1 : 1, x = s.x + side * 13, z = s.z + rng(-7, 7);
      if (!reserved(x, z, 0)) { p.cars.push({ x, y: 0, z, ry: r() < 0.5 ? 0 : Math.PI, color: pick(CAR) }); p.solids.push({ kind: "box", x, y: 0.7, z, hx: 1, hy: 0.7, hz: 2.2 }); }
    }
    if (r() < 0.14) {
      const x = s.x + rng(-6, 6), z = s.z - 13.2;
      if (!reserved(x, z, 0)) { part(x, 0, z, 4, 0.12, 1.6, "#a8a49a"); part(x, 2.4, z, 4.3, 0.12, 1.8, "#3d5668"); part(x - 1.9, 0, z - 0.7, 0.12, 2.4, 0.12, "#3d4656"); part(x + 1.9, 0, z - 0.7, 0.12, 2.4, 0.12, "#3d4656"); part(x, 0.1, z - 0.74, 3.8, 2.2, 0.06, "#aac7dd"); }
    }
  }
  spots.sort((a, b) => a.d - b.d);
  spots.forEach((s, n) => {
    if (n === 0) return clockTower(s.x, s.z);
    if (n === 2) return marketHall(s.x, s.z);
    const k = r(), mid = s.d < 130 ? [0.62, 0.86, 1, 1] : s.d < 235 ? [0.12, 0.52, 0.8, 0.96] : [0, 0.1, 0.32, 0.56];
    if (k < mid[0]) tower(s.x, s.z); else if (k < mid[1]) apartments(s.x, s.z); else if (k < mid[2]) shops(s.x, s.z); else if (k < mid[3]) warehouse(s.x, s.z); else houses(s.x, s.z);
  });
  return p;
}

const clockFace = () => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#f6f0dc"; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.strokeStyle = "#2a2018"; g.lineWidth = 5; g.stroke();
  for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; g.lineWidth = 4; g.beginPath(); g.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); g.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); g.stroke(); }
  g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 26); g.moveTo(64, 64); g.lineTo(92, 74); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
};

export function City() {
  const plan = useMemo(planCity, []);
  const { car, tree, pole, painted } = useMemo(() => {
    const coloured = (g: THREE.BufferGeometry, color: string) => {
      const n = g.toNonIndexed(), col = new THREE.Color(color), a = new Float32Array(n.attributes.position.count * 3);
      for (let i = 0; i < n.attributes.position.count; i++) a.set([col.r, col.g, col.b], i * 3);
      n.setAttribute("color", new THREE.BufferAttribute(a, 3)); n.deleteAttribute("uv"); return n;
    };
    const wheels = [[-0.9, -1.35], [0.9, -1.35], [-0.9, 1.35], [0.9, 1.35]].map(([x, z]) => coloured(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10).rotateZ(Math.PI / 2).translate(x, 0.34, z), "#17191c"));
    return {
      car: mergeGeometries([coloured(new THREE.BoxGeometry(1.9, 0.62, 4.2).translate(0, 0.72, 0), "#ffffff"), coloured(new THREE.BoxGeometry(1.6, 0.55, 2.1).translate(0, 1.3, -0.15), "#26323c"), ...wheels])!,
      tree: mergeGeometries([coloured(new THREE.CylinderGeometry(0.16, 0.24, 2.4, 7).translate(0, 1.2, 0), "#5a3a2b"), coloured(new THREE.IcosahedronGeometry(1.5, 1).translate(0, 3.2, 0), "#4f7f3c"), coloured(new THREE.IcosahedronGeometry(1, 1).translate(0.6, 4, 0.2), "#659349")])!,
      pole: mergeGeometries([coloured(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6).translate(0, 2.1, 0), "#30353c"), coloured(new THREE.BoxGeometry(0.42, 1.1, 0.34).translate(0, 4.5, 0), "#1c2026"), coloured(new THREE.SphereGeometry(0.11, 6, 5).translate(0, 4.8, -0.18), "#e0463c"), coloured(new THREE.SphereGeometry(0.11, 6, 5).translate(0, 4.5, -0.18), "#e6b13c"), coloured(new THREE.SphereGeometry(0.11, 6, 5).translate(0, 4.2, -0.18), "#3fb868")])!,
      painted: seeThrough(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })),
    };
  }, []);
  const { box, gable, awn, mats, detail, face } = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const roof = seeThrough(new THREE.MeshLambertMaterial({ color: "#8a8f98" }));
    const walls = { office: wallMat("office", 24, 24), apartment: wallMat("apartment", 24, 24), shop: wallMat("shop", 8, 6), plain: wallMat("plain", 12, 8) };
    windowMats.length = 0; windowMats.push(walls.office, walls.apartment, walls.shop);
    const faces = (w: THREE.Material) => [w, w, roof, roof, w, w];
    return { box, gable: prism(true), awn: wedge(), detail: seeThrough(new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true, side: THREE.DoubleSide })),
      mats: { office: faces(walls.office), apartment: faces(walls.apartment), shop: faces(walls.shop), plain: faces(walls.plain) }, face: clockFace() };
  }, []);
  useStaticColliders(plan.solids, "building");
  return (
    <>
      <Instances geometry={box} material={mats.office} items={plan.office} radius={260} />
      <Instances geometry={box} material={mats.apartment} items={plan.apartment} radius={200} />
      <Instances geometry={box} material={mats.shop} items={plan.shop} radius={150} />
      <Instances geometry={box} material={mats.plain} items={plan.plain} radius={150} />
      <Instances geometry={box} material={detail} items={plan.box} radius={150} />
      <Instances geometry={gable} material={detail} items={plan.gable} radius={200} />
      <Instances geometry={awn} material={detail} items={plan.wedge} radius={120} />
      <Instances geometry={car} material={painted} items={plan.cars} radius={120} />
      <Instances geometry={tree} material={painted} items={plan.trees} radius={120} />
      <Instances geometry={pole} material={painted} items={plan.poles} radius={100} />
      {plan.clock && <Near x={plan.clock.x} z={plan.clock.z} radius={300}>
        {[0, 1, 2, 3].map((k) => { const a = (k * Math.PI) / 2; return <mesh key={k} position={[plan.clock!.x + Math.sin(a) * 4.03, 21, plan.clock!.z + Math.cos(a) * 4.03]} rotation={[0, a, 0]}><circleGeometry args={[3, 28]} /><meshBasicMaterial map={face} /></mesh>; })}
      </Near>}
    </>
  );
}
