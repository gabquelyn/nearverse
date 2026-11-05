let ctx: AudioContext | null = null;
function tone(f: number, t: number, type: OscillatorType = "square", vol = 0.05) {
  if (!ctx) return;
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + t);
  } catch { /* no audio available */ }
}
/** Looping filtered noise for water, wind and the city's hum. All share one buffer, and each is only a volume to turn. */
const beds: Partial<Record<"water" | "wind" | "city", GainNode>> = {};
function startAmbience() {
  if (!ctx) return;
  const c = ctx, buf = c.createBuffer(1, c.sampleRate * 3, c.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const bed = (name: "water" | "wind" | "city", type: BiquadFilterType, f: number, q: number, offset: number) => {
    const src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; src.loop = true; flt.type = type; flt.frequency.value = f; flt.Q.value = q; g.gain.value = 0;
    src.connect(flt).connect(g).connect(c.destination); src.start(0, offset);
    beds[name] = g;
  };
  bed("water", "bandpass", 1500, 0.7, 0); bed("wind", "lowpass", 380, 0.5, 1); bed("city", "lowpass", 180, 0.4, 2);
}
export const sfx = {
  /** Fades each background sound towards how close you are to it, each from 0 to 1. */
  ambience: (mix: { water: number; wind: number; city: number }) => {
    if (!ctx || ctx.state !== "running") return;
    const peak = { water: 0.05, wind: 0.035, city: 0.05 }, t = ctx.currentTime;
    (Object.keys(mix) as (keyof typeof mix)[]).forEach((k) => beds[k]?.gain.setTargetAtTime(mix[k] * peak[k], t, 0.8));
  },
  /** Browsers only allow audio after an input, and starting it is slow, so do it on the first key press. */
  prepare: () => {
    if (ctx) { if (ctx.state === "suspended") ctx.resume().catch(() => {}); return; }
    try {
      ctx = new AudioContext({ latencyHint: "interactive" });
      // Sound output goes to sleep when idle and takes a moment to wake, which delayed every hit. A silent signal keeps it awake.
      const hush = ctx.createConstantSource(), g = ctx.createGain(); g.gain.value = 0.0001; hush.connect(g).connect(ctx.destination); hush.start();
      startAmbience();
    } catch { /* no audio available */ }
  },
  honk: () => { tone(370, 0.3); tone(466, 0.3); },
  boom: () => { if (ctx?.state === "suspended") ctx.resume().catch(() => {}); tone(900, 0.05, "square", 0.1); tone(70, 0.5, "sawtooth", 0.14); },
  // The short high click is what you hear as the moment of impact. A low thud alone sounds late.
  crash: () => { if (ctx?.state === "suspended") ctx.resume().catch(() => {}); tone(1400, 0.04, "square", 0.08); tone(110, 0.22, "sawtooth", 0.1); tone(62, 0.3, "square", 0.06); },
  load: () => tone(660, 0.12, "triangle", 0.09),
};
