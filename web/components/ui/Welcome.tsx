"use client";
// Shown once, the first time someone opens the game, so they know what it's about before anything else.
import { memo, useEffect, useState } from "react";

const KEY = "nearverse.welcomed";

export const Welcome = memo(function Welcome() {
  const [open, setOpen] = useState(false);
  useEffect(() => { try { if (localStorage.getItem(KEY) !== "1") setOpen(true); } catch { setOpen(true); } }, []);
  const close = () => { setOpen(false); try { localStorage.setItem(KEY, "1"); } catch { /* shown again next visit */ } };
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter") close(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  if (!open) return null;
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" data-testid="welcome">
      <div className="welcomecard">
        <h2 id="welcome-title">Welcome to Nearverse</h2>
        <p>Drive across a huge island, hunt for hidden materials, and build your own place in a market run by its players.</p>
        <ul>
          <li><b>Hunt.</b> Materials aren&apos;t on the map. Rare ones are hard to find, and the rarest are guarded by bombs.</li>
          <li><b>Trade.</b> Sell to merchants and stalls. Every trade moves the price, so watch for the best deal.</li>
          <li><b>Build.</b> Buy a plot, bring its materials over as many trips as you like, and open a stall that earns for you.</li>
          <li><b>Own it.</b> What you hold is really yours, saved on the NEAR network. The game handles that for you, so you just play.</li>
        </ul>
        <button className="btn action big" autoFocus onClick={close}>Let&apos;s go</button>
      </div>
    </div>
  );
});
