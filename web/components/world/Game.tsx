"use client";
import { Welcome } from "../ui/Welcome";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame } from "@/lib/state/game";
import { Hud } from "../ui/Hud";
import { listenForNotes, startRealtime } from "@/lib/realtime";
import { truck } from "./world";
import { TouchControls, TurnPhone } from "./TouchControls";
import { enterLandscape } from "@/lib/landscape";
import { LEVELS, perf } from "./perf";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

function PerfReadout() {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("perf")) return;
    const id = setInterval(() => setText(`${perf.fps} fps, ${LEVELS[perf.level].name} detail`), 500);
    return () => clearInterval(id);
  }, []);
  return text ? <div className="plate" style={{ position: "absolute", right: 12, top: 62 }}>{text}</div> : null;
}

/** "rtrtrt.nverse.testnet" shows as "rtrtrt". Guests have a long hex account, so they show as "Driver" and its last 4 characters. */
function driverName(id: string) {
  if (/^[0-9a-f]{64}$/.test(id)) return `Driver ${id.slice(-4)}`;
  return id.split(".")[0] || "Driver";
}

export default function Game({ landing }: { landing?: boolean }) {
  const init = useGame((s) => s.init), ready = useGame((s) => s.ready), started = useGame((s) => s.player.started), startDriving = useGame((s) => s.startDriving), toast = useGame((s) => s.toast), worldReady = useGame((s) => s.worldReady), mode = useGame((s) => s.mode), hasSession = useGame((s) => Boolean(s.session));
  const [starting, setStarting] = useState(false);
  useEffect(() => { init(); }, [init]);
  useEffect(() => {
    // Connected from the first screen, so you can see others before you start. You only appear once you do.
    listenForNotes((text) => useGame.setState((s) => ({ activity: [{ id: Date.now() + Math.random(), text }, ...s.activity].slice(0, 20) })));
    const stop = startRealtime(() => {
      const s = useGame.getState();
      if (!s.player.started) return null;
      return { name: s.session ? driverName(s.session.accountId) : "Driver", x: truck.pos.x, z: truck.pos.z, yaw: truck.yaw, speed: truck.speed, vehicle: s.player.vehicle };
    });
    return () => { stop(); listenForNotes(null); };
  }, []);
  // On the live game, nobody becomes a guest by accident: with no wallet, /play offers the same choice as the home page.
  const choosing = mode === "chain" && !hasSession;
  useEffect(() => { if (!landing && ready && !started && !choosing) startDriving(); }, [landing, ready, started, startDriving, choosing]);
  // If starting failed because the network was down, keep trying once it's back, without another press.
  useEffect(() => {
    if (landing || !ready || started || choosing) return;
    const id = setInterval(() => { if (!useGame.getState().player.started) startDriving(); }, 10_000);
    return () => clearInterval(id);
  }, [landing, ready, started, startDriving, choosing]);
  const showIntro = (landing || choosing) && !started;
  return (
    <main className="game">
      <Scene />
      <PerfReadout />
      {!worldReady && <div className="veil" role="status"><b>Loading the island</b><span>Getting everything ready so the drive stays smooth.</span></div>}
      {!showIntro && <Hud />}
      {!showIntro && <TouchControls />}
      <TurnPhone />
      <Welcome />
      {showIntro && toast && <div className={`toast ${toast.bad ? "bad" : ""}`} role="alert">{toast.text}</div>}
      {showIntro && (
        <div className="overlay">
          <div>
            <h1>Hunt it, haul it, sell it.</h1>
            <p>A huge island, and the riches aren&apos;t on the map. Hunt for materials, sell them to merchants or from a stall of your own, and upgrade your truck. Knock the crates over on your way.</p>
          </div>
          <div className="row">
            <button className="btn big" disabled={starting || !ready} onClick={async () => { enterLandscape(); setStarting(true); await startDriving(); setStarting(false); (document.activeElement as HTMLElement | null)?.blur(); }}>{starting ? "Starting" : !ready ? "Getting ready" : mode === "chain" && !hasSession ? "Play as a guest" : "Start driving"}</button>
            {mode === "chain" && !hasSession && <Link className="btn action" href="/signin">Sign in with Google or email</Link>}
            <Link className="btn ghost" href="/judge">Open judge view</Link>
          </div>
        </div>
      )}
    </main>
  );
}
