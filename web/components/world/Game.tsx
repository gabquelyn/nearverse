"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame } from "@/lib/state/game";
import { Hud } from "../ui/Hud";
import { keys } from "./world";
import { LEVELS, perf } from "./perf";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

const Hold = ({ code, label }: { code: string; label: string }) => (
  <button aria-label={label} onPointerDown={() => keys.add(code)} onPointerUp={() => keys.delete(code)} onPointerLeave={() => keys.delete(code)}>{label}</button>
);

function PerfReadout() {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("perf")) return;
    const id = setInterval(() => setText(`${perf.fps} fps, ${LEVELS[perf.level].name} detail`), 500);
    return () => clearInterval(id);
  }, []);
  return text ? <div className="plate" style={{ position: "absolute", right: 12, top: 62 }}>{text}</div> : null;
}

export default function Game({ landing }: { landing?: boolean }) {
  const init = useGame((s) => s.init), ready = useGame((s) => s.ready), started = useGame((s) => s.player.started), startDriving = useGame((s) => s.startDriving), toast = useGame((s) => s.toast), worldReady = useGame((s) => s.worldReady), mode = useGame((s) => s.mode);
  const [starting, setStarting] = useState(false);
  useEffect(() => { init(); }, [init]);
  useEffect(() => { if (!landing && ready && !started) startDriving(); }, [landing, ready, started, startDriving]);
  const showIntro = landing && !started;
  return (
    <main className="game">
      <Scene />
      <PerfReadout />
      {!worldReady && <div className="veil" role="status"><b>Loading the island</b><span>Getting everything ready so the drive stays smooth.</span></div>}
      {!showIntro && <Hud />}
      {!showIntro && <div className="touch"><Hold code="KeyA" label="Left" /><Hold code="KeyD" label="Right" /><Hold code="KeyS" label="Back" /><Hold code="KeyW" label="Go" /><Hold code="KeyE" label="Load" /></div>}
      {showIntro && toast && <div className={`toast ${toast.bad ? "bad" : ""}`} role="alert">{toast.text}</div>}
      {showIntro && (
        <div className="overlay">
          <div>
            <h1>Hunt it, haul it, sell it.</h1>
            <p>A huge island, and the riches aren&apos;t on the map. Hunt for materials, sell them to merchants or from a stall of your own, and upgrade your truck. Knock the crates over on your way.</p>
          </div>
          <div className="row">
            <button className="btn big" disabled={starting || !ready} onClick={async () => { setStarting(true); await startDriving(); setStarting(false); (document.activeElement as HTMLElement | null)?.blur(); }}>{starting ? "Starting" : mode === "chain" ? "Play as a guest" : "Start driving"}</button>
            {mode === "chain" && <Link className="btn action" href="/signin">Sign in with Google or email</Link>}
            <Link className="btn ghost" href="/judge">Open judge view</Link>
          </div>
        </div>
      )}
    </main>
  );
}
