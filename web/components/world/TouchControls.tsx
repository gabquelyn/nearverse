"use client";
// Phone controls: a thumb stick on the left, pedals and actions on the right. Each thumb is tracked on its own.
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useGame } from "@/lib/state/game";
import { canForceLandscape, enterLandscape } from "@/lib/landscape";
import { stick } from "./world";

const RANGE = 46, DEAD = 0.12;
const press = (type: "keydown" | "keyup", code: string) => window.dispatchEvent(new KeyboardEvent(type, { code }));

function Stick() {
  const knob = useRef<HTMLDivElement>(null), held = useRef<number | null>(null);
  const place = (x: number, y: number) => {
    const len = Math.hypot(x, y) || 1, n = Math.min(1, len / RANGE), dx = (x / len) * n, dy = (y / len) * n;
    stick.x = Math.abs(dx) < DEAD ? 0 : dx; stick.y = Math.abs(dy) < DEAD ? 0 : -dy;
    if (knob.current) knob.current.style.transform = `translate(${dx * RANGE}px, ${dy * RANGE}px)`;
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== held.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    place(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  };
  const release = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== held.current) return;
    held.current = null; stick.x = 0; stick.y = 0;
    if (knob.current) knob.current.style.transform = "";
  };
  useEffect(() => () => { stick.x = 0; stick.y = 0; }, []);
  return (
    <div className="stick" data-testid="stick" role="presentation"
      onPointerDown={(e) => { held.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
      onPointerMove={move} onPointerUp={release} onPointerCancel={release}>
      <div className="knob" ref={knob} />
    </div>
  );
}

function Hold({ code, label, className }: { code: string; label: string; className: string }) {
  const [on, setOn] = useState(false), held = useRef(false);
  const stop = () => { if (held.current) press("keyup", code); held.current = false; setOn(false); };
  useEffect(() => () => { press("keyup", code); }, [code]);
  return (
    <button className={`${className}${on ? " on" : ""}`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); press("keydown", code); held.current = true; setOn(true); }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onContextMenu={(e) => e.preventDefault()}>{label}</button>
  );
}

export function TouchControls() {
  const atNode = useGame((s) => s.zone?.kind === "node");
  useEffect(() => {
    window.addEventListener("pointerdown", enterLandscape, { once: true });
    return () => window.removeEventListener("pointerdown", enterLandscape);
  }, []);
  return (
    <div className="touch">
      <Stick />
      <div className="pad">
        <Hold code="KeyW" label="Gas" className="gas" />
        <Hold code="KeyS" label="Brake" className="brake" />
        <Hold code="ShiftLeft" label="Boost" className="boost" />
        <Hold code="Space" label="Jump" className="jump" />
        <Hold code="KeyH" label="Horn" className="horn" />
        {atNode && <Hold code="KeyE" label="Load" className="load" />}
      </div>
    </div>
  );
}

export function TurnPhone() {
  const [canAsk, setCanAsk] = useState(false);
  useEffect(() => setCanAsk(canForceLandscape()), []);
  return (
    <div className="turn" role="alert">
      <div className="phone" aria-hidden />
      <b>Turn your phone sideways</b>
      <span>Nearverse plays in landscape.</span>
      {canAsk ? <button className="btn action" onClick={enterLandscape}>Switch to landscape</button> : <small>If nothing happens, turn off rotation lock.</small>}
    </div>
  );
}
