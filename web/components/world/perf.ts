// Runtime detail control. Keeps the same world and obstacles on every device; only drawing detail changes.
export const LEVELS = [
  { name: "high", dpr: 1.5, grass: 1, cards: 1, leaves: 1, shadowEvery: 2 },
  { name: "medium", dpr: 1.2, grass: 0.6, cards: 0.8, leaves: 0.6, shadowEvery: 3 },
  { name: "low", dpr: 1, grass: 0.32, cards: 0.6, leaves: 0.3, shadowEvery: 4 },
  { name: "lowest", dpr: 0.8, grass: 0.14, cards: 0.42, leaves: 0.15, shadowEvery: 8 },
];
// While warming, everything is drawn once behind the loading screen, so nothing compiles mid-drive.
export const perf = { level: 1, fps: 0, forced: false, warming: true };
export const MAX_GRASS = 110000;
export const MAX_LEAVES = 80;
