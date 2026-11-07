"use client";
// Walks a new player through one full loop: find, load, sell. It only points the way when asked.
import { memo, useEffect, useState } from "react";
import { rules as c } from "@nearverse/economy";
import { useGame } from "@/lib/state/game";
import { truck } from "../world/world";
import { Fold } from "./Fold";

const KEY = "nearverse.coachDone";
const nearest = <T extends { x: number; z: number }>(list: T[]) => list.reduce((best, p) => (Math.hypot(p.x - truck.pos.x, p.z - truck.pos.z) < Math.hypot(best.x - truck.pos.x, best.z - truck.pos.z) ? p : best), list[0]);

export const Coach = memo(function Coach() {
  const held = useGame((s) => s.player.items.reduce((a, b) => a + b, 0)), hasZone = useGame((s) => Boolean(s.zone)), waypoint = useGame((s) => Boolean(s.waypoint)), setWaypoint = useGame((s) => s.setWaypoint);
  const toured = useGame((s) => s.toured);
  const [gone, setGone] = useState(true), [loaded, setLoaded] = useState(false), [sold, setSold] = useState(false);
  useEffect(() => { try { setGone(localStorage.getItem(KEY) === "1"); } catch { setGone(false); } }, []);
  const finish = () => { setGone(true); try { localStorage.setItem(KEY, "1"); } catch { /* shown again next visit */ } };
  useEffect(() => { if (held > 0) setLoaded(true); else if (loaded) setSold(true); }, [held, loaded]);
  useEffect(() => { if (!sold) return; const id = setTimeout(finish, 9000); return () => clearTimeout(id); }, [sold]);
  if (gone || !toured || (hasZone && !sold)) return null;
  const point = () => {
    if (held > 0) { const m = nearest(c.merchants); setWaypoint({ x: m.x, z: m.z, label: m.name }); return; }
    const market = useGame.getState().market, n = nearest(c.nodes.filter((_, i) => market.nodes[i] > 0));
    setWaypoint({ x: n.x, z: n.z, label: "A hidden spot" });
  };
  const tip = sold ? "Sold. Every trade moves the price, so check why a merchant pays what it does, then come back when it pays more." : held > 0 ? "Now sell it. A merchant short of stock pays more." : "Find your first load. Resources aren't on the map, so drive and look around.";
  return (
    <Fold label="Tip" text={tip} className="coach" testId="coach">
      {(fold) => <>
        <span>{tip}</span>
        {!sold && !waypoint && <button className="btn small action" onClick={() => { point(); fold(); }}>{held > 0 ? "Nearest merchant" : "Point me to one"}</button>}
        <button className="btn small ghost" onClick={finish}>{sold ? "Got it" : "Skip"}</button>
      </>}
    </Fold>
  );
});
