// A shared clock, so every player sees the same time of day. A full cycle takes eight minutes.
import * as THREE from "three";
export const CYCLE_MS = 8 * 60_000;
export const sky = { t: 0, sun: 1, night: 0, override: null as number | null };
export function updateSky() {
  sky.t = sky.override ?? (Date.now() / CYCLE_MS + 0.08) % 1;
  sky.sun = Math.sin(sky.t * Math.PI * 2);
  const v = THREE.MathUtils.clamp((0.08 - sky.sun) / 0.3, 0, 1);
  sky.night = v * v * (3 - 2 * v);
}
export const timeLabel = () => (sky.night > 0.6 ? "Night" : sky.sun < 0.28 ? (sky.t < 0.5 && sky.t < 0.25 ? "Dawn" : "Dusk") : "Day");
/** Materials that glow after dark share these, so one update reaches them all. */
export const lampMat = new THREE.MeshStandardMaterial({ color: "#fff0c0", emissive: "#ffd27a", emissiveIntensity: 0.3 });
export const glowMat = new THREE.MeshBasicMaterial({ color: "#ffbe5c", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
