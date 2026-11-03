"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CuboidCollider, Physics, RigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { rules as c } from "@nearverse/economy";
import { useGame } from "@/lib/state/game";
import { PLOT, gatherBar, keys, truck } from "./world";
import { glowMat, lampMat, sky, updateSky } from "./daynight";
import { Ground, Ocean, paintBiomeMap, paintGroundMap } from "./Terrain";
import { Grass, Trees, Weather, useTrees } from "./Foliage";
import { Truck } from "./Truck";
import { Benches, Lamps, LotSpot, Mines, NodeSpot, Obstacles, Plot, Scatter, Stall, TitleCrates, windowMat } from "./Props";
import { Near } from "./Instances";
import { Waypoint } from "./Waypoint";
import { FocusTracker, Tracks, WindLines } from "./effects";
import { sfx } from "./sound";
import { LEVELS, perf } from "./perf";

export { keys };
if (typeof window !== "undefined") (window as unknown as Record<string, unknown>).__nearverse ??= {};

const skyColors = {
  sunDay: new THREE.Color("#fff0d6"), sunLow: new THREE.Color("#ff9d5c"), moon: new THREE.Color("#8fa6e0"),
  hemiDay: new THREE.Color("#cfe2ff"), hemiNight: new THREE.Color("#3a4c80"), groundDay: new THREE.Color("#5f5a86"), groundNight: new THREE.Color("#1a2240"),
  fogDay: new THREE.Color("#a9d4e8"), fogLow: new THREE.Color("#f0a878"), fogNight: new THREE.Color("#0c1630"),
};

/** Moves the sun and moon and recolours the world as the shared clock runs. */
function DayNight() {
  const light = useRef<THREE.DirectionalLight>(null!), hemi = useRef<THREE.HemisphereLight>(null!);
  const { scene } = useThree();
  useEffect(() => { scene.add(light.current.target); }, [scene]);
  const tmp = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    updateSky();
    // Whole-unit steps and a slowly stepping sun stop shadows crawling and shimmering as you drive.
    const l = light.current, up = sky.night > 0.5, a = (Math.round(sky.t * 240) / 240) * Math.PI * 2 + (up ? Math.PI : 0);
    const sx = Math.round(truck.pos.x), sz = Math.round(truck.pos.z);
    l.position.set(sx + Math.cos(a) * 42, Math.max(Math.abs(Math.sin(a)) * 54, 14), sz - 24);
    l.target.position.set(sx, 0, sz);
    const low = 1 - THREE.MathUtils.clamp(sky.sun / 0.42, 0, 1);
    l.color.copy(skyColors.sunDay).lerp(skyColors.sunLow, low).lerp(skyColors.moon, sky.night);
    l.intensity = THREE.MathUtils.lerp(2.9, 1.05, sky.night);
    hemi.current.color.copy(skyColors.hemiDay).lerp(skyColors.hemiNight, sky.night);
    hemi.current.groundColor.copy(skyColors.groundDay).lerp(skyColors.groundNight, sky.night);
    hemi.current.intensity = THREE.MathUtils.lerp(1.05, 1.1, sky.night);
    tmp.copy(skyColors.fogDay).lerp(skyColors.fogLow, low * (1 - sky.night)).lerp(skyColors.fogNight, sky.night);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(tmp);
    if (scene.background instanceof THREE.Color) scene.background.copy(tmp);
    lampMat.emissiveIntensity = 0.2 + sky.night * 3;
    glowMat.opacity = sky.night * 0.34;
    windowMat.emissiveIntensity = sky.night * 1.5;
  });
  return (
    <>
      <hemisphereLight ref={hemi} />
      <directionalLight ref={light} intensity={2.6} castShadow shadow-mapSize={[1536, 1536]} shadow-bias={-0.0006} shadow-normalBias={0.05} shadow-radius={5} shadow-camera-left={-44} shadow-camera-right={44} shadow-camera-top={44} shadow-camera-bottom={-44} shadow-camera-far={150} />
    </>
  );
}

function FollowCamera() {
  const { camera, size } = useThree();
  const look = useRef(new THREE.Vector3()), lead = useRef(0), yaw = useRef(0);
  useFrame((_, dt) => {
    const portrait = size.width < size.height;
    // The lead follows smoothly, so a sudden stop at an obstacle doesn't jolt the view.
    lead.current = THREE.MathUtils.damp(lead.current, THREE.MathUtils.clamp(truck.speed * 0.3, -3, 8), 2.2, dt);
    yaw.current = truck.yaw;
    const target = new THREE.Vector3(truck.pos.x + Math.sin(yaw.current) * lead.current, 0, truck.pos.z + Math.cos(yaw.current) * lead.current);
    const off = portrait ? new THREE.Vector3(0, 40, -30) : new THREE.Vector3(0, 28, -27);
    camera.position.x = THREE.MathUtils.damp(camera.position.x, target.x + off.x, 5, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, off.y, 5, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, target.z + off.z, 5, dt);
    look.current.x = THREE.MathUtils.damp(look.current.x, target.x, 5, dt);
    look.current.z = THREE.MathUtils.damp(look.current.z, target.z, 5, dt);
    camera.lookAt(look.current);
  });
  return null;
}

function Zones() {
  const hold = useRef(0), tick = useRef(0);
  useFrame((_, dt) => {
    const { setZone, act, market, session, zone: current } = useGame.getState();
    const { x, z } = truck.pos;
    if (tick.current++ % 4 === 0) {
      const me = session?.accountId ?? "you";
      let zone: { kind: "node" | "stall" | "plot" | "lot"; index: number } | null = null;
      for (let i = 0; i < c.nodes.length; i++) if (Math.abs(x - c.nodes[i].x) < 7 && Math.abs(z - c.nodes[i].z) < 7) { zone = { kind: "node", index: i }; break; }
      for (let i = 0; i < c.merchants.length; i++) { const m = c.merchants[i], l = Math.hypot(m.x, m.z); if (Math.hypot(x - (m.x - m.x / l), z - (m.z - m.z / l)) < 5.6) zone = { kind: "stall", index: i }; }
      for (let i = 0; i < c.lots.length; i++) { const m = c.lots[i], st = market.stalls[i]; if (Math.abs(x - m.x) < 7 && Math.abs(z - m.z) < 7 && st?.owner && (st.built || st.owner === me)) zone = { kind: "lot", index: i }; }
      if (Math.abs(x - PLOT[0]) < 10 && Math.abs(z - PLOT[1]) < 6) zone = { kind: "plot", index: 0 };
      setZone(zone);
    }
    if (current?.kind === "node" && keys.has("KeyE")) {
      hold.current += dt;
      if (gatherBar.el) gatherBar.el.style.width = `${Math.min(100, (hold.current / 1.2) * 100)}%`;
      if (hold.current >= 1.2) { hold.current = 0; if (gatherBar.el) gatherBar.el.style.width = "0%"; if (act({ t: "gather", node: current.index })) sfx.load(); }
    } else if (hold.current) { hold.current = 0; if (gatherBar.el) gatherBar.el.style.width = "0%"; }
  });
  return null;
}

/** Picks a starting level, then watches the real frame rate and steps detail down, or up once, to stay smooth. */
function startLevel() {
  const forced = new URLSearchParams(location.search).get("quality");
  const i = LEVELS.findIndex((l) => l.name === forced);
  if (i >= 0) { perf.forced = true; return i; }
  let software = false;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    software = !gl || /swiftshader|llvmpipe|software/i.test(info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "");
  } catch { software = true; }
  return software ? 3 : 1;
}

/**
 * Compiles every shader behind the loading screen, once the whole world has mounted.
 * Compiling on first use is what froze the game the moment you reached a stall or hit something.
 */
function Warmup() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    // Asking for shader logs forces the browser to wait for the GPU, so that check stays out of production.
    if (process.env.NODE_ENV === "production") gl.debug.checkShaderErrors = false;
    let alive = true;
    const finish = () => {
      if (!alive) return;
      // Finish each program now. Otherwise the wait happens the first time it draws, which is mid-drive.
      for (const program of gl.info.programs ?? []) { (program as unknown as { getUniforms(): unknown }).getUniforms(); (program as unknown as { getAttributes(): unknown }).getAttributes(); }
      // Widen the shadow view for a moment so distant objects compile their shadow shaders too.
      let sun: THREE.DirectionalLight | null = null;
      scene.traverse((o) => { if (o instanceof THREE.DirectionalLight) sun = o; });
      const cam = (sun as THREE.DirectionalLight | null)?.shadow.camera;
      const wide = (size: number) => { if (cam) { cam.left = -size; cam.right = size; cam.top = size; cam.bottom = -size; cam.far = size * 4; cam.updateProjectionMatrix(); } };
      wide(1400);
      gl.shadowMap.needsUpdate = true;
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        // Shadow shaders were only created by those frames, so finish them the same way.
        for (const program of gl.info.programs ?? []) { (program as unknown as { getUniforms(): unknown }).getUniforms(); (program as unknown as { getAttributes(): unknown }).getAttributes(); }
        wide(44); if (cam) { cam.far = 150; cam.updateProjectionMatrix(); }
        perf.warming = false; if (alive) useGame.getState().setWorldReady();
      })));
    };
    const start = requestAnimationFrame(() => requestAnimationFrame(() => { gl.compileAsync(scene, camera).then(finish, finish); }));
    return () => { alive = false; cancelAnimationFrame(start); };
  }, [gl, scene, camera]);
  return null;
}

function Governor() {
  const { gl, setDpr } = useThree();
  const clock = useRef({ frames: 0, time: 0, total: 0, raised: false, dropped: false, skip: 40 });
  useEffect(() => {
    perf.level = startLevel();
    setDpr(Math.min(LEVELS[perf.level].dpr, window.devicePixelRatio || 1));
    gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true;

    const hook = (window as unknown as { __nearverse: Record<string, unknown> }).__nearverse;
    hook.perf = perf; hook.setTime = (t: number | null) => { sky.override = t; };
  }, [gl, setDpr]);
  useFrame((_, dt) => {
    const k = clock.current;
    k.total++;
    if (perf.warming || k.total % LEVELS[perf.level].shadowEvery === 0) gl.shadowMap.needsUpdate = true;
    if (k.skip > 0) { k.skip--; return; } // ignore start-up hitches
    k.frames++; k.time += Math.min(dt, 1);
    if (k.time < 1.5) return;
    perf.fps = Math.round(k.frames / k.time);
    const slow = perf.fps < 42, roomy = perf.fps >= 58;
    k.frames = 0; k.time = 0;
    if (perf.forced) return;
    const set = (n: number) => { perf.level = n; setDpr(Math.min(LEVELS[n].dpr, window.devicePixelRatio || 1)); k.skip = 30; };
    if (slow && perf.level < LEVELS.length - 1) { k.dropped = true; set(perf.level + 1); }
    else if (roomy && !k.dropped && !k.raised && perf.level > 0) { k.raised = true; set(perf.level - 1); }
  });
  return null;
}

function World() {
  const map = useMemo(() => paintGroundMap(), []);
  const biome = useMemo(() => paintBiomeMap(), []);
  const trees = useTrees();
  return (
    <>
      <Ground map={map} biome={biome} />
      <Ocean />
      <Grass map={map} biome={biome} />
      <Weather />
      <Physics gravity={[0, -24, 0]} timeStep="vary">
        <RigidBody type="fixed" friction={1}><CuboidCollider args={[1300, 1, 1300]} position={[0, -1, 0]} /></RigidBody>
        <Truck />
        <Near x={0} z={0} radius={120}><TitleCrates /><Scatter /><Lamps /><Benches /><Plot /></Near>
        {c.merchants.map((_, i) => <Stall key={i} i={i} />)}
        {c.lots.map((_, i) => <LotSpot key={i} i={i} />)}
        {c.nodes.map((n, i) => <Near key={i} x={n.x} z={n.z}><NodeSpot i={i} /></Near>)}
        <Trees trees={trees} />
        <Obstacles />
        <Mines />
        <Warmup />
      </Physics>
    </>
  );
}

export default function Scene() {
  const [fonts, setFonts] = useState(false);
  useEffect(() => { document.fonts.load('80px "Bowlby One"').finally(() => setFonts(true)); }, []);
  return (
    <Canvas shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [0, 28, -30], fov: 34, far: 1400 }} dpr={1} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.02 }}>
      <color attach="background" args={["#a9d4e8"]} />
      <fog attach="fog" args={["#a9d4e8", 90, 420]} />
      <DayNight />
      {fonts && <World />}
      <Waypoint />
      <FocusTracker />
      {fonts && <><Tracks /><WindLines /></>}
      <FollowCamera />
      <Zones />
      <Governor />
    </Canvas>
  );
}
