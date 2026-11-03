let ctx: AudioContext | null = null;
function tone(f: number, t: number, type: OscillatorType = "square", vol = 0.05) {
  if (!ctx) return;
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + t);
  } catch { /* no audio available */ }
}
export const sfx = {
  /** Browsers only allow audio after an input, and starting it is slow, so do it on the first key press. */
  prepare: () => { if (ctx) return; try { ctx = new AudioContext(); } catch { /* no audio available */ } },
  honk: () => { tone(370, 0.3); tone(466, 0.3); },
  boom: () => tone(70, 0.5, "sawtooth", 0.14),
  crash: () => { tone(110, 0.22, "sawtooth", 0.1); tone(62, 0.3, "square", 0.06); },
  load: () => tone(660, 0.12, "triangle", 0.09),
};
