"use client";
import { useEffect, useState } from "react";
import { Nav } from "@/components/ui/Nav";
import { CONTRACT, callGame, loadSession } from "@/lib/near/client";
import * as auth from "@/lib/near/login";

export default function Spike() {
  const [lines, setLines] = useState<string[]>([]);
  const [who, setWho] = useState<{ accountId: string; pub: string } | null>(null);
  const [pending, setPending] = useState(false);
  const log = (s: string) => setLines((l) => [...l, s]);
  useEffect(() => setPending(auth.hasPending()), []);
  const guard = (f: () => Promise<unknown>) => async () => { try { await f(); } catch (e) { log("Stopped: " + String((e as Error).message ?? e)); } };
  return (
    <div className="page">
      <header><h1>Sign in</h1><Nav /></header>
      <p style={{ maxWidth: "68ch", marginTop: 0 }}>Sign in with Google, Apple, email or a passkey, then approve once. After that the game signs for you, with a key that can only play and can&apos;t move NEAR. This flow is still being proven on testnet, so each step reports what happened.</p>
      {!CONTRACT && <div className="notice">Set GAME_CONTRACT first. Sign-in needs a deployed contract.</div>}
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn" disabled={!CONTRACT} onClick={guard(async () => setWho(await auth.login(log)))}>Sign in</button>
        <button className="btn" disabled={!who} onClick={guard(() => auth.fund(who!.accountId, log))}>Get test funds</button>
        <button className="btn" disabled={!who} onClick={guard(() => auth.requestSessionKey(who!.accountId, who!.pub, log))}>Approve game key</button>
        <button className="btn" disabled={!pending} onClick={guard(async () => { await auth.finishSessionKey(log); setPending(false); })}>Finish approval</button>
        <button className="btn ghost" onClick={guard(async () => {
          const s = loadSession(); if (!s) throw new Error("No game key yet."); const t0 = performance.now();
          await callGame(s, "start_game", {}).catch((e) => { if (!String(e).includes("ALREADY_STARTED")) throw e; });
          await callGame(s, "gather", { node: 0 });
          log(`Silent game call confirmed with no popup in ${Math.round(performance.now() - t0)} ms.`);
        })}>Test a silent game call</button>
      </div>
      <ol className="log" style={{ listStyle: "decimal", paddingLeft: 20 }} aria-live="polite">{lines.map((l, i) => <li key={i} style={{ overflowWrap: "anywhere" }}>{l}</li>)}</ol>
    </div>
  );
}
