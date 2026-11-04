"use client";
// A hint when a resource is close, and the zoom buttons. Both read the world directly, so they never redraw the game.
import { memo, useEffect, useRef, useState } from "react";
import { rules as c } from "@nearverse/economy";
import { useGame } from "@/lib/state/game";
import { truck, view } from "../world/world";

const RANGE = 150;

export const Nearby = memo(function Nearby() {
  const [text, setText] = useState("");
  useEffect(() => {
    const id = setInterval(() => {
      const { market, zone, player } = useGame.getState();
      if (!player.started || zone?.kind === "node") { setText(""); return; }
      let best = RANGE, name = "";
      c.nodes.forEach((n, i) => { const d = Math.hypot(n.x - truck.pos.x, n.z - truck.pos.z); if (d < best && market.nodes[i] > 0) { best = d; name = n.name; } });
      setText(name ? `${name} ${Math.round(best / 10) * 10} m away` : "");
    }, 500);
    return () => clearInterval(id);
  }, []);
  return text ? <div className="nearby" role="status" data-testid="nearby">{text}</div> : null;
});

const KEY = "nearverse.zoom", MIN = 1, MAX = 1.9, STEP = 0.3;

export const ZoomButtons = memo(function ZoomButtons() {
  const [zoom, setZoom] = useState(1);
  const live = useRef(setZoom); live.current = setZoom;
  const change = (next: number) => {
    const z = Math.min(MAX, Math.max(MIN, Math.round(next * 10) / 10));
    view.zoom = z; live.current(z);
    try { localStorage.setItem(KEY, String(z)); } catch { /* not remembered */ }
  };
  useEffect(() => {
    try { const saved = Number(localStorage.getItem(KEY)); if (saved >= MIN && saved <= MAX) { view.zoom = saved; live.current(saved); } } catch { /* use the default */ }
    const wheel = (e: WheelEvent) => { if ((e.target as Element)?.tagName === "CANVAS") change(view.zoom + Math.sign(e.deltaY) * STEP / 2); };
    window.addEventListener("wheel", wheel, { passive: true });
    return () => window.removeEventListener("wheel", wheel);
  }, []);
  return (
    <div className="zoom">
      <button className="btn small" aria-label="Zoom in" disabled={zoom <= MIN} onClick={() => change(zoom - STEP)}>+</button>
      <button className="btn small" aria-label="Zoom out" disabled={zoom >= MAX} onClick={() => change(zoom + STEP)}>−</button>
    </div>
  );
});
