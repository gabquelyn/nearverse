"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame } from "@/lib/state/game";
import { Hud } from "../ui/Hud";
import { keys } from "./Scene";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

const Hold = ({ code, label }: { code: string; label: string }) => (
  <button aria-label={label} onPointerDown={() => keys.add(code)} onPointerUp={() => keys.delete(code)} onPointerLeave={() => keys.delete(code)}>{label}</button>
);

export default function Game({ landing }: { landing?: boolean }) {
  const { init, ready, player, startDriving, toast } = useGame();
  const [starting, setStarting] = useState(false);
  useEffect(() => { init(); }, [init]);
  useEffect(() => { if (!landing && ready && !player.started) startDriving(); }, [landing, ready, player.started, startDriving]);
  const showIntro = landing && !player.started;
  return (
    <main className="game">
      <Scene />
      {!showIntro && <Hud />}
      {!showIntro && <div className="touch"><Hold code="KeyA" label="Left" /><Hold code="KeyD" label="Right" /><Hold code="KeyS" label="Back" /><Hold code="KeyW" label="Go" /><Hold code="KeyE" label="Load" /></div>}
      {showIntro && toast && <div className={`toast ${toast.bad ? "bad" : ""}`} role="alert">{toast.text}</div>}
      {showIntro && (
        <div className="overlay">
          <div>
            <h1>Haul it, sell it, build with it.</h1>
            <p>Drive a truck around the island and load up on materials. Merchants pay less for what everyone is selling and more for what they&apos;re short of. Knock the crates over on your way.</p>
          </div>
          <div className="row">
            <button className="btn big" disabled={starting || !ready} onClick={async () => { setStarting(true); await startDriving(); setStarting(false); (document.activeElement as HTMLElement | null)?.blur(); }}>{starting ? "Starting" : "Start driving"}</button>
            <Link className="btn ghost" href="/judge">Open judge view</Link>
          </div>
        </div>
      )}
    </main>
  );
}
