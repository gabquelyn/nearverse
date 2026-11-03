"use client";
// The map shows where you are, the regions, and every place you can sell. Resources are never on it.
import { useEffect, useRef, useState } from "react";
import { rules as c } from "@nearverse/economy";
import { PRACTICE_ID, useGame } from "@/lib/state/game";
import { others as liveCars, type OtherCar } from "@/lib/realtime";
import { DRIVE_RADIUS, REGIONS, biomeAt, biomeName, coast, truck } from "../world/world";

const SPAN = 1140; // world units from the map's centre to its edge
// The map stays fixed with +z up and +x on the left, which is how the view starts. The player arrow shows the heading.
const toPct = (x: number, z: number) => ({ left: 50 - (x / SPAN) * 50, top: 50 - (z / SPAN) * 50 });
const KEY = "nearverse.mapOpen";

let cached: string | null = null;
function paintMap() {
  if (cached) return cached;
  const S = 260, cv = document.createElement("canvas"); cv.width = cv.height = S;
  const g = cv.getContext("2d", { willReadFrequently: true })!, img = g.createImageData(S, S);
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const x = -((px + 0.5) / S - 0.5) * 2 * SPAN, z = -((py + 0.5) / S - 0.5) * 2 * SPAN, r = Math.hypot(x, z), i = (py * S + px) * 4;
    let col = [24, 76, 104];
    if (r < coast(Math.atan2(z, x))) {
      const b = biomeAt(x, z);
      col = [70, 112, 58];
      col = mix(col, [226, 234, 242], b.snow);
      col = mix(col, [206, 164, 98], b.desert);
      col = mix(col, [108, 110, 118], b.city);
      if (r > DRIVE_RADIUS + 3) col = [220, 196, 140];
    }
    img.data.set([col[0], col[1], col[2], 255], i);
  }
  g.putImageData(img, 0, 0);
  cached = cv.toDataURL("image/png");
  return cached;
}

export function TopMap() {
  const [open, setOpen] = useState(true);
  const [src, setSrc] = useState("");
  const [cars, setCars] = useState<OtherCar[]>([]);
  useEffect(() => { const id = setInterval(() => setCars(liveCars.size ? [...liveCars.values()].map((o) => ({ ...o })) : []), 1000); return () => clearInterval(id); }, []);
  const here = useRef<HTMLSpanElement>(null), dot = useRef<HTMLSpanElement>(null), needle = useRef<HTMLSpanElement>(null), dist = useRef<HTMLElement>(null);
  const waypoint = useGame((s) => s.waypoint), setWaypoint = useGame((s) => s.setWaypoint);
  const me = useGame((s) => s.session?.accountId ?? PRACTICE_ID);
  const mineKey = useGame((s) => s.market.stalls.map((st, i) => (st.owner === me ? i : -1)).filter((i) => i >= 0).join());
  const mine = mineKey ? mineKey.split(",").map(Number) : [];
  // Other players' finished stalls: a string, so this only redraws when the list really changes.
  const openKey = useGame((s) => s.market.stalls.map((st, i) => (st.owner && st.owner !== me && st.built ? i : -1)).filter((i) => i >= 0).join());
  const others = openKey ? openKey.split(",").map(Number) : [];
  const goNearest = () => {
    const places = [...c.merchants.map((m) => ({ x: m.x, z: m.z, label: m.name })), ...others.map((i) => ({ x: c.lots[i].x, z: c.lots[i].z, label: c.lots[i].name }))];
    let best = places[0], d = Infinity;
    for (const p of places) { const k = Math.hypot(p.x - truck.pos.x, p.z - truck.pos.z); if (k < d) { d = k; best = p; } }
    setWaypoint(best);
  };
  useEffect(() => { try { const v = localStorage.getItem(KEY); if (v !== null) setOpen(v === "1"); else if (innerWidth < 760) setOpen(false); } catch { /* use the default */ } setSrc(paintMap()); }, []);
  const toggle = (next: boolean) => { setOpen(next); try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* not remembered */ } };
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.code === "KeyM" && !(e.target instanceof HTMLInputElement)) setOpen((o) => { try { localStorage.setItem(KEY, o ? "0" : "1"); } catch { /* not remembered */ } return !o; }); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      if (here.current) here.current.textContent = biomeName(truck.pos.x, truck.pos.z);
      if (dot.current) { const p = toPct(truck.pos.x, truck.pos.z); dot.current.style.left = `${p.left}%`; dot.current.style.top = `${p.top}%`; dot.current.style.transform = `translate(-50%,-50%) rotate(${(-truck.yaw * 180) / Math.PI}deg)`; }
      const w = useGame.getState().waypoint;
      if (w) {
        const dx = w.x - truck.pos.x, dz = w.z - truck.pos.z;
        if (needle.current) needle.current.style.transform = `rotate(${(Math.atan2(-dx, dz) * 180) / Math.PI}deg)`;
        if (dist.current) dist.current.textContent = `${Math.round(Math.hypot(dx, dz))} m`;
      }
    }, 150);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={`topmap ${open ? "open" : ""}`} data-testid="map">
      <div className="bar"><span className="truckmini" aria-hidden="true" /><span ref={here} className="here" data-testid="here">Home</span><button className="btn small ghost" aria-expanded={open} onClick={() => toggle(!open)}>{open ? "Hide map" : "Show map"}</button></div>
      {open && (
        <>
          <div className="board" style={{ backgroundImage: src ? `url(${src})` : undefined }} role="img" aria-label="Map showing your location and the island's regions">
            {REGIONS.map((r) => { const p = toPct(r.x, r.z); return <span key={r.name} className="region" style={{ left: `${p.left}%`, top: `${p.top}%` }}>{r.name}</span>; })}
            <span className="pin home" style={{ left: "50%", top: "50%" }} title="Home" />
            {c.merchants.map((m) => { const p = toPct(m.x, m.z); return <button key={m.id} className="pin merchant" style={{ left: `${p.left}%`, top: `${p.top}%` }} title={`${m.name}: merchant`} aria-label={`Route to ${m.name}, a merchant`} onClick={() => setWaypoint({ x: m.x, z: m.z, label: m.name })} />; })}
            {others.map((i) => { const p = toPct(c.lots[i].x, c.lots[i].z); return <button key={i} className="pin other" style={{ left: `${p.left}%`, top: `${p.top}%` }} title={`${c.lots[i].name}: a player's stall`} aria-label={`Route to ${c.lots[i].name}, a player's stall`} onClick={() => setWaypoint({ x: c.lots[i].x, z: c.lots[i].z, label: c.lots[i].name })} />; })}
            {mine.map((i) => { const p = toPct(c.lots[i].x, c.lots[i].z); return <button key={i} className="pin stall" style={{ left: `${p.left}%`, top: `${p.top}%` }} title={`${c.lots[i].name}: your stall`} aria-label={`Route to ${c.lots[i].name}, your stall`} onClick={() => setWaypoint({ x: c.lots[i].x, z: c.lots[i].z, label: c.lots[i].name })} />; })}
            {waypoint && <span className="pin target" style={{ left: `${toPct(waypoint.x, waypoint.z).left}%`, top: `${toPct(waypoint.x, waypoint.z).top}%` }} />}
            {cars.map((o) => { const p = toPct(o.x, o.z); return <span key={o.id} className={`pin car ${o.kind}`} style={{ left: `${p.left}%`, top: `${p.top}%` }} title={o.name} />; })}
            <span ref={dot} className="truckdot small" />
          </div>
          <div className="maplegend"><span><i className="pin merchant" />Merchant</span><span><i className="pin other" />Player</span><span><i className="pin stall" />Yours</span></div>
          <div className="routes">
            {!waypoint && <button className="btn small action" onClick={goNearest}>Nearest stall</button>}
            {!waypoint && <button className="btn small" onClick={() => setWaypoint({ x: 0, z: 0, label: "Home" })}>Go home</button>}
            {!waypoint && mine.map((i) => <button key={i} className="btn small" onClick={() => setWaypoint({ x: c.lots[i].x, z: c.lots[i].z, label: c.lots[i].name })}>Go to my stall: {c.lots[i].name}</button>)}
          </div>
        </>
      )}
      {waypoint && <div className="going"><span ref={needle} className="needle" aria-hidden="true" /><div style={{ flex: 1 }}><b>{waypoint.label}</b><small ref={dist} /></div><button className="btn small ghost" onClick={() => setWaypoint(null)}>Clear</button></div>}
    </div>
  );
}
