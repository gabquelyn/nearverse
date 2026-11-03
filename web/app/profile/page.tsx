"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { rules as c, coins } from "@nearverse/economy";
import { useGame, worth } from "@/lib/state/game";
import { Nav } from "@/components/ui/Nav";
import { Locations, MyStalls, Shop } from "@/components/ui/Shop";

export default function Profile() {
  const g = useGame();
  const [amount, setAmount] = useState("1");
  useEffect(() => { g.init(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="page">
      <header><h1>Profile</h1><Nav /></header>
      {g.toast && <div className="notice" role="status">{g.toast.text}</div>}
      <div className="grid2">
        <section>
          <h2 style={{ marginTop: 0 }}>Account</h2>
          {g.mode === "practice" ? <p>Practice mode. Progress lives in this browser and nothing goes on-chain. To play on testnet, deploy the contract and set <code>GAME_CONTRACT</code>.</p>
            : g.session ? <p style={{ overflowWrap: "anywhere" }}>Playing as {g.session.accountId} on NEAR testnet ({g.session.kind === "guest" ? "guest key in this browser" : "signed in"}).</p>
            : <p>No account yet. Claim test funds to play without a wallet, or sign in with a social or email login.</p>}
          <p>Net worth <b>{coins(worth(g.player))}</b>. Coins <b>{coins(g.player.coins)}</b>.</p>
          <div className="row">
            {g.mode === "chain" && !g.session && <button className="btn" onClick={() => g.useGuest().catch((e) => g.say(String(e.message), true))}>Claim test funds and play</button>}
            {g.mode === "chain" && <Link className="btn ghost" href="/signin">Sign in with Google or email</Link>}
            {g.mode === "chain" && g.session && <button className="btn ghost" onClick={g.signOut}>Forget this key</button>}
            {g.mode === "practice" && <button className="btn ghost" onClick={g.resetPractice}>Reset practice save</button>}
            {!g.player.started && <button className="btn" onClick={() => g.startDriving()}>Start game</button>}
          </div>
        </section>
        <section>
          <h2 style={{ marginTop: 0 }}>Credits</h2>
          <p>You have <b data-testid="profile-credits">{g.player.credits}</b> credits. 1 NEAR buys {c.credits_per_near} credits, which pay for fuel, repairs, vehicles and stall locations. Credit purchases are final.</p>
          {g.mode === "chain" && g.session && <p className="copyline">Fund this account with NEAR: <code>{g.session.accountId}</code><button className="btn small ghost" onClick={() => navigator.clipboard?.writeText(g.session!.accountId).then(() => g.say("Copied."), () => g.say("Copy it by hand.", true))}>Copy</button></p>}
          <div className="row">
            <label className="field">NEAR <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} /></label>
            <button className="btn action" onClick={() => g.buyCredits(Number(amount))}>Buy {Math.floor(Number(amount || 0) * c.credits_per_near)} credits</button>
          </div>
          {g.mode === "practice" && <p className="muted">Practice mode adds credits without spending real NEAR.</p>}
          <p className="muted">Coins are what you earn from trading and from your stall. Withdrawing coins as NEAR is planned for later.</p>
        </section>
      </div>
      <h2 id="shop">Vehicle shop</h2>
      <Shop />
      <h2>Your stalls</h2>
      <MyStalls />
      <h2>Stall locations</h2>
      <Locations />
      <h2>Top players</h2>
      {g.board.length ? <table className="prices"><thead><tr><th>Player</th><th className="num">Sections built</th><th className="num">Net worth</th></tr></thead><tbody>{g.board.slice(0, 10).map((r) => <tr key={r.account_id}><td style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{r.account_id}</td><td className="num">{r.sections_built}</td><td className="num">{coins(r.net_worth)}</td></tr>)}</tbody></table> : <p>The board fills in once this game runs on testnet.</p>}
    </div>
  );
}
