"use client";
// Your pre-judging check: everything here should say OK.
import { useEffect, useState } from "react";
import { Nav } from "@/components/ui/Nav";

interface Status { contract: string | null; balances: { treasury: number | null; game: number | null; googleParent: number | null }; lastGhostMs: number | null; features: { liveCars: boolean; google: boolean } }
const LOW = { treasury: 5, game: 3, googleParent: 3 };

function Row({ name, ok, value, hint }: { name: string; ok: boolean; value: string; hint: string }) {
  return <tr><td>{name}</td><td className={ok ? "okay" : "needs"}>{ok ? "OK" : "Check"}</td><td>{value}</td><td className="muted">{ok ? "" : hint}</td></tr>;
}

export default function StatusPage() {
  const [s, setS] = useState<Status | null>(null), [now, setNow] = useState(0);
  useEffect(() => { const read = () => { fetch("/api/status").then((r) => r.json()).then(setS).catch(() => {}); setNow(Date.now()); }; read(); const id = setInterval(read, 30_000); return () => clearInterval(id); }, []);
  const near = (v: number | null) => (v === null ? "Not found" : `${v.toFixed(2)} NEAR`);
  const mins = s?.lastGhostMs ? Math.round((now - s.lastGhostMs) / 60_000) : null;
  return (
    <div className="page">
      <header><h1>Status</h1><Nav /></header>
      {!s ? <p>Checking.</p> : <table className="prices" data-testid="status"><tbody>
        <Row name="Contract" ok={Boolean(s.contract)} value={s.contract ?? "Not set"} hint="Set GAME_CONTRACT." />
        <Row name="Game account" ok={(s.balances.game ?? 0) >= LOW.game} value={near(s.balances.game)} hint="Refill from near-faucet.io." />
        <Row name="Treasury" ok={(s.balances.treasury ?? 0) >= LOW.treasury} value={near(s.balances.treasury)} hint="Refill from near-faucet.io. The faucet pauses under 3 NEAR." />
        <Row name="Ghost traders" ok={mins !== null && mins < 10} value={mins === null ? "No trades found" : `Last trade ${mins} min ago`} hint="Start them with the ghosts command." />
        <Row name="Google sign-in" ok={s.features.google && (s.balances.googleParent ?? 0) >= LOW.googleParent} value={s.features.google ? near(s.balances.googleParent) : "Not set up"} hint="Check the Google settings and refill the parent account." />
        <Row name="Other cars" ok={s.features.liveCars} value={s.features.liveCars ? "On" : "Off"} hint="Set ABLY_API_KEY." />
      </tbody></table>}
    </div>
  );
}
