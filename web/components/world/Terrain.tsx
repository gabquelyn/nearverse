"use client";
// Painted island ground and animated sea.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { rules as c, rng } from "@nearverse/economy";
import { COAST_GLSL, DRIVE_RADIUS, ROADS, WORLD_SIZE, biomeAt } from "./world";
import { sky } from "./daynight";

/** R = road or dirt, G = paving, B = sand. Read by the ground and grass shaders. */
export function paintGroundMap(): THREE.Texture {
  // Drawn sharp on the CPU, then softened once. Blurring every stroke stalls slower GPUs.
  const S = 2048, raw = document.createElement("canvas"); raw.width = raw.height = S;
  const g = raw.getContext("2d", { willReadFrequently: true })!;
  const u = (v: number) => ((v + WORLD_SIZE / 2) / WORLD_SIZE) * S, l = (v: number) => (v / WORLD_SIZE) * S;
  g.fillStyle = "#000"; g.fillRect(0, 0, S, S); g.globalCompositeOperation = "lighter";
  g.strokeStyle = "#f00"; g.fillStyle = "#f00"; g.lineCap = "round"; g.lineWidth = l(7.5);
  for (const [a, b] of ROADS) { g.beginPath(); g.moveTo(u(a.x), u(a.z)); g.lineTo(u(b.x), u(b.z)); g.stroke(); }
  for (const n of [...c.lots, ...c.merchants]) { g.beginPath(); g.arc(u(n.x), u(n.z), l(10), 0, 7); g.fill(); }
  g.fillStyle = "#0f0"; g.beginPath(); g.arc(u(0), u(0), l(25), 0, 7); g.fill();
  const rim = g.createRadialGradient(u(0), u(0), l(DRIVE_RADIUS - 2), u(0), u(0), l(DRIVE_RADIUS + 4));
  rim.addColorStop(0, "#000"); rim.addColorStop(1, "#00f");
  g.fillStyle = rim; g.fillRect(0, 0, S, S);
  const cv = document.createElement("canvas"); cv.width = cv.height = S;
  const out = cv.getContext("2d", { willReadFrequently: true })!;
  try { out.filter = "blur(1.5px)"; } catch { /* unsupported: harder edges */ }
  out.drawImage(raw, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.flipY = false; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 8; // keeps ground sharp at a shallow angle, far from the camera
  return tex;
}

/** R = snow, G = desert, B = city. */
export function paintBiomeMap(): THREE.Texture {
  const S = 512, data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const b = biomeAt(((x + 0.5) / S - 0.5) * WORLD_SIZE, ((y + 0.5) / S - 0.5) * WORLD_SIZE), i = (y * S + x) * 4;
    data[i] = b.snow * 255; data[i + 1] = b.desert * 255; data[i + 2] = b.city * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

/** Noise baked once into a tiling texture, because computing it per pixel is very slow on laptop GPUs. */
let noiseTex: THREE.DataTexture | null = null;
function bakedNoise() {
  if (noiseTex) return noiseTex;
  const S = 256, r = rng(13), data = new Uint8Array(S * S * 4);
  const layer = (period: number) => {
    const g = Float32Array.from({ length: period * period }, () => r());
    return (x: number, y: number) => {
      const fx = (x / S) * period, fy = (y / S) * period, ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const at = (i: number, j: number) => g[((j + period) % period) * period + ((i + period) % period)];
      return (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
    };
  };
  const a = layer(32), b = layer(64), c2 = layer(128);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    data[i] = (a(x, y) * 0.55 + b(x, y) * 0.3 + c2(x, y) * 0.15) * 255;
    data[i + 1] = c2(x, y) * 255; data[i + 3] = 255;
  }
  noiseTex = new THREE.DataTexture(data, S, S);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping; noiseTex.magFilter = THREE.LinearFilter; noiseTex.minFilter = THREE.LinearMipmapLinearFilter; noiseTex.generateMipmaps = true; noiseTex.anisotropy = 8; noiseTex.needsUpdate = true;
  return noiseTex;
}

const NOISE = /* glsl */ `
  uniform sampler2D uNoise;
  float nvHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float nvNoise(vec2 p){ return texture2D(uNoise, p/128.).g; }
  float nvFbm(vec2 p){ return texture2D(uNoise, p/32.).r; }
`;

export function Ground({ map, biome }: { map: THREE.Texture; biome: THREE.Texture }) {
  const { geo, mat } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE); // one flat quad: the shader paints it and cuts the coastline
    geo.rotateX(-Math.PI / 2);
    const tex = map;
    const mat = new THREE.MeshLambertMaterial();
    mat.onBeforeCompile = (s) => {
      s.uniforms.uMap = { value: tex }; s.uniforms.uBiome = { value: biome }; s.uniforms.uNoise = { value: bakedNoise() };
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWP=(modelMatrix*vec4(position,1.)).xyz;");
      s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vWP; uniform sampler2D uMap; uniform sampler2D uBiome; ${NOISE}
        ${COAST_GLSL}`).replace("#include <color_fragment>", /* glsl */ `#include <color_fragment>
        if (length(vWP.xz) > coastR(atan(vWP.z, vWP.x))) discard;
        vec2 mapUv = (vWP.xz + ${(WORLD_SIZE / 2).toFixed(1)}) / ${WORLD_SIZE.toFixed(1)};
        float wob = (nvFbm(vWP.xz*.45)-.5)*.5;
        vec3 sp = texture2D(uMap, mapUv).rgb, bio = texture2D(uBiome, mapUv).rgb;
        float n = nvFbm(vWP.xz*.9), fine = nvNoise(vWP.xz*7.);
        // Fine streaks like distant blades, so the ground keeps its texture when you zoom out and where the blades end.
        float blades = nvNoise(vWP.xz*vec2(21.,4.))*.5+nvNoise(vWP.zx*vec2(17.,3.))*.5;
        vec3 grass = mix(vec3(.10,.19,.04), vec3(.17,.28,.07), n) * (.66+fine*.3+blades*.42);
        vec3 dirt = mix(vec3(.42,.28,.17), vec3(.54,.37,.23), n) * (.88+fine*.22);
        vec3 snow = mix(vec3(.82,.88,.96), vec3(.95,.97,1.), n) * (.96+fine*.05);
        vec3 snowRoad = mix(vec3(.52,.56,.63), vec3(.66,.70,.76), n);
        float ripple = sin(vWP.x*.9+vWP.z*.35+n*6.)*.5+.5;
        vec3 dune = mix(vec3(.74,.53,.28), vec3(.88,.68,.38), n*.7+ripple*.3);
        vec3 duneRoad = mix(vec3(.55,.37,.20), vec3(.65,.46,.26), n);
        vec2 block = abs(fract(vWP.xz/36.)-.5);
        float street = smoothstep(.40,.43,max(block.x,block.y));
        float dash = step(.5,fract((block.x>block.y?vWP.z:vWP.x)*.25))*smoothstep(.485,.495,max(block.x,block.y));
        vec3 concrete = mix(vec3(.46,.46,.47), vec3(.54,.53,.52), n);
        vec3 asphalt = mix(vec3(.13,.14,.17), vec3(.17,.18,.21), n);
        vec3 cityCol = mix(concrete, asphalt, street) + dash*.5;
        vec3 ground = mix(grass, snow, smoothstep(.45,.55,bio.r+wob*.3));
        ground = mix(ground, dune, smoothstep(.45,.55,bio.g+wob*.3));
        vec3 road = mix(dirt, snowRoad, bio.r);
        road = mix(road, duneRoad, bio.g);
        vec3 col = mix(ground, road, smoothstep(.42,.58,sp.r+wob*.7));
        col = mix(col, cityCol, smoothstep(.5,.6,bio.b));
        col = mix(col, asphalt, smoothstep(.45,.6,sp.r)*smoothstep(.5,.6,bio.b));
        vec2 tile = vWP.xz*.5; tile.x += step(1.,mod(floor(tile.y),2.))*.5;
        vec2 ft = abs(fract(tile)-.5); float seam = smoothstep(.455,.49,max(ft.x,ft.y));
        float tone = nvHash(floor(tile));
        vec3 pave = mix(vec3(.54,.50,.44), vec3(.66,.61,.53), tone) * (1.-seam*.35) * (.94+fine*.1);
        col = mix(col, pave, smoothstep(.45,.55,sp.g+wob*.25));
        vec3 sand = mix(vec3(.78,.67,.46), vec3(.88,.79,.58), n);
        col = mix(col, sand, smoothstep(.3,.6,sp.b+wob*.4));
        col *= 1.-(1.-smoothstep(0.,4.,coastR(atan(vWP.z, vWP.x))-length(vWP.xz)))*.28;
        diffuseColor.rgb = col;`);
    };
    return { geo, mat };
  }, [map]);
  return <mesh geometry={geo} material={mat} receiveShadow frustumCulled={false} />;
}

export function Ocean() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uNoise: { value: bakedNoise() } },
    vertexShader: "varying vec3 vWP; void main(){ vec4 w=modelMatrix*vec4(position,1.); vWP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }",
    fragmentShader: /* glsl */ `
      varying vec3 vWP; uniform float uTime; uniform float uNight; ${NOISE}
      ${COAST_GLSL}
      void main(){
        float a=atan(vWP.z,vWP.x), r=length(vWP.xz), d=r-coastR(a);
        vec2 p=vWP.xz;
        float w1=nvFbm(p*.09+vec2(uTime*.05,uTime*.03)), w2=nvFbm(p*.22-vec2(uTime*.07,-uTime*.05));
        vec3 shallow=vec3(.20,.66,.70), mid=vec3(.09,.42,.60), deep=vec3(.05,.22,.44);
        vec3 col=mix(shallow,mid,smoothstep(0.,16.,d+w1*5.));
        col=mix(col,deep,smoothstep(14.,70.,d+w2*12.));
        float glint=smoothstep(.70,.76,nvFbm(p*.8+vec2(uTime*.25,0.))*.5+w2*.55);
        col+=vec3(.55,.6,.55)*glint*.45;
        float wob=(nvFbm(p*.35+uTime*.05)-.5)*2.4;
        float wave=.5+.5*sin((d+wob)*1.05-uTime*.9);
        float band=smoothstep(.86,.97,wave)*(1.-smoothstep(2.,10.,d));
        float edge=1.-smoothstep(.1,.75+sin(uTime*.7+a*9.)*.3,d+wob*.2);
        col=mix(col,vec3(1.25,1.22,1.15),clamp(edge+band*.85,0.,1.));
        col*=mix(vec3(1.),vec3(.22,.28,.45),uNight);
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), []);
  const ref = useRef(mat);
  useFrame((_, dt) => { ref.current.uniforms.uTime.value += dt; ref.current.uniforms.uNight.value = sky.night; });
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]} material={mat}><planeGeometry args={[5200, 5200]} /></mesh>;
}
