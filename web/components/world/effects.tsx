"use client";
// Finishing touches learned from studying folio-2025: tyre tracks, wind streaks, and foliage that thins out over the truck.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { truck } from "./world";

const shared = { focus: { value: new THREE.Vector2(-9999, -9999) }, radius: { value: 90 } };

let materialCount = 0;

/** Thins a material around the truck on screen, with a dither, so trees and buildings never hide it. */
export function seeThrough(mat: THREE.Material) {
  const before = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    before?.call(mat, s, r);
    s.uniforms.uFocus = shared.focus; s.uniforms.uFocusR = shared.radius;
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying float vNvH;").replace("#include <project_vertex>", `#include <project_vertex>
      #ifdef USE_INSTANCING
      vNvH = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).y;
      #else
      vNvH = (modelMatrix * vec4(transformed, 1.)).y;
      #endif`);
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vNvH; uniform vec2 uFocus; uniform float uFocusR;").replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
      float nvD = length(gl_FragCoord.xy - uFocus) / uFocusR;
      if (nvD < 1. && vNvH > 1.8) {
        vec2 nvC = mod(floor(gl_FragCoord.xy), 4.);
        float nvT = fract((nvC.x * 5. + nvC.y * 3.) / 8. + nvC.x * nvC.y * .0625);
        if (nvT > smoothstep(.45, 1., nvD)) discard;
      }`);
  };
  const id = ++materialCount; // each material keeps its own compiled program
  mat.customProgramCacheKey = () => `seethrough-${id}`;
  return mat;
}

/** Keeps the see-through circle on the truck. */
export function FocusTracker() {
  const { camera, gl } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []), size = useMemo(() => new THREE.Vector2(), []);
  useFrame(() => {
    gl.getDrawingBufferSize(size);
    v.set(truck.pos.x, 1, truck.pos.z).project(camera);
    shared.focus.value.set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y);
    shared.radius.value = size.y * 0.24;
  });
  return null;
}

const MARKS = 260;
/** Tyre tracks that fade, on any ground. Each new mark updates one slot, so this costs almost nothing. */
export function Tracks() {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const { geo, mat } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(0.42, 1.25).rotateX(-Math.PI / 2);
    geo.setAttribute("aBorn", new THREE.InstancedBufferAttribute(new Float32Array(MARKS).fill(-999), 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 } },
      vertexShader: "attribute float aBorn; varying float vA; uniform float uTime; void main(){ vA = clamp(1.-(uTime-aBorn)/16.,0.,1.); gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.); }",
      fragmentShader: "varying float vA; void main(){ if(vA<=0.) discard; gl_FragColor = vec4(.07,.05,.05, vA*.26); }",
    });
    return { geo, mat };
  }, []);
  const state = useRef({ next: 0, x: 0, z: 0, ready: false });
  const d = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => { for (let i = 0; i < MARKS; i++) { d.position.set(0, -50, 0); d.updateMatrix(); ref.current.setMatrixAt(i, d.matrix); } ref.current.instanceMatrix.needsUpdate = true; }, [d]);
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
    const s = state.current, dx = truck.pos.x - s.x, dz = truck.pos.z - s.z;
    if (Math.hypot(dx, dz) < 1.1) return;
    s.x = truck.pos.x; s.z = truck.pos.z;
    if (truck.pos.y > 1.2 || Math.abs(truck.speed) < 2) return;
    const sinY = Math.sin(truck.yaw), cosY = Math.cos(truck.yaw), aBorn = geo.attributes.aBorn as THREE.InstancedBufferAttribute;
    for (const side of [-1, 1]) {
      const i = s.next++ % MARKS;
      d.position.set(truck.pos.x + cosY * side * 1.05 - sinY * 1.2, 0.035, truck.pos.z - sinY * side * 1.05 - cosY * 1.2);
      d.rotation.set(0, truck.yaw, 0); d.updateMatrix();
      ref.current.setMatrixAt(i, d.matrix); aBorn.setX(i, clock.elapsedTime);
    }
    ref.current.instanceMatrix.needsUpdate = true; aBorn.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, MARKS]} frustumCulled={false} />;
}

const LINES = 7;
/** A few pale streaks of wind that drift past and fade. */
export function WindLines() {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const { geo, mat } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(9, 0.09, 24, 1).rotateX(-Math.PI / 2);
    const seed = new Float32Array(LINES); for (let i = 0; i < LINES; i++) seed[i] = i * 0.73;
    geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uTruck: { value: new THREE.Vector2() }, uStrength: { value: 0.3 } },
      vertexShader: /* glsl */ `attribute float aSeed; uniform float uTime; uniform vec2 uTruck; varying float vA;
        void main(){
          float t = fract(uTime*.09 + aSeed), u = position.x/9.+.5;
          vec3 p = position;
          p.y = 4.5 + sin(u*4.+aSeed*6.)*.6 + sin(aSeed*17.)*2.;
          p.z += sin(u*5.+uTime*.7+aSeed)*1.1;
          p.x += (uTruck.x + 42. - t*84.) + sin(aSeed*31.)*12.;
          p.z += uTruck.y + sin(aSeed*47.)*26.;
          float head = smoothstep(t*1.6-.1, t*1.6+.1, u+.0), tail = smoothstep(t*1.6-.75, t*1.6-.45, u);
          vA = (1.-head)*tail*sin(t*3.14159);
          gl_Position = projectionMatrix*viewMatrix*vec4(p,1.);
        }`,
      fragmentShader: "varying float vA; uniform float uStrength; void main(){ if(vA<.01) discard; gl_FragColor = vec4(1.,1.,1., vA*uStrength); }",
    });
    return { geo, mat };
  }, []);
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime; mat.uniforms.uTruck.value.set(truck.pos.x, truck.pos.z); });
  return <instancedMesh ref={ref} args={[geo, mat, LINES]} frustumCulled={false} />;
}
