// A short rising chime for a rare find, made in the browser so there's no sound file to load.
export function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext, a = new Ctx(), t = a.currentTime;
    [660, 880, 1320].forEach((f, i) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.11); g.gain.linearRampToValueAtTime(0.14, t + i * 0.11 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.11 + 0.55);
      o.connect(g).connect(a.destination); o.start(t + i * 0.11); o.stop(t + i * 0.11 + 0.6);
    });
    setTimeout(() => a.close().catch(() => {}), 1500);
  } catch { /* no sound on this device */ }
}
