// Asks for full screen and landscape. Android browsers allow this after a tap. iPhones don't, so they see the turn-your-phone screen.
export const isTouch = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
export const canForceLandscape = () => typeof document !== "undefined" && Boolean(document.documentElement.requestFullscreen) && "orientation" in screen && "lock" in screen.orientation;

export async function enterLandscape() {
  if (!isTouch() || !canForceLandscape()) return;
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    await (screen.orientation as unknown as { lock(o: string): Promise<void> }).lock("landscape");
  } catch { /* this browser refused, and the turn-your-phone screen still applies */ }
}
