"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { rules as c, coins } from "@nearverse/economy";
import { useGame, worth } from "@/lib/state/game";
import { Nav } from "@/components/ui/Nav";
import { Locations, MyStalls, Shop } from "@/components/ui/Shop";
import { WalletExport } from "@/components/ui/WalletExport";
import { dripNear, fetchBalance, shortAccount } from "@/lib/near/client";

const dripKey = (id: string) => `nearverse.nextDrip.${id}`;
const waitText = (ms: number) => { const m = Math.ceil(ms / 60_000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

function CopyAddress() {
  const session = useGame((s) => s.session), say = useGame((s) => s.say);
  return <button className="btn small ghost" onClick={() => navigator.clipboard?.writeText(session!.accountId).then(() => say("Address copied."), () => say("Copy it by hand.", true))}>Copy</button>;
}

/** The wallet's NEAR balance and the test NEAR faucet. */
function Wallet({ accountId }: { accountId: string }) {
  const say = useGame((s) => s.say);
  const [balance, setBalance] = useState<string | null | undefined>(undefined), [nextAt, setNextAt] = useState(0), [busy, setBusy] = useState(false), [now, setNow] = useState(0);
  const refresh = useCallback(() => fetchBalance(accountId).then(setBalance), [accountId]);
  useEffect(() => {
    refresh(); setNow(Date.now());
    try { setNextAt(Number(localStorage.getItem(dripKey(accountId))) || 0); } catch { /* not remembered */ }
    const id = setInterval(() => { refresh(); setNow(Date.now()); }, 15_000);
    return () => clearInterval(id);
  }, [accountId, refresh]);
  const wait = nextAt - now;
  const drip = async () => {
    setBusy(true);
    const out = await dripNear(accountId).catch(() => ({ error: "Test funds are unavailable right now.", nextAt: undefined }));
    if (out.nextAt) { setNextAt(out.nextAt); setNow(Date.now()); try { localStorage.setItem(dripKey(accountId), String(out.nextAt)); } catch { /* not remembered */ } }
    if (out.error) say(out.error, true); else { say("1 test NEAR sent."); setTimeout(refresh, 2500); }
    setBusy(false);
  };
  return (
    <div className="wallet">
      <div><small>NEAR balance</small><b data-testid="near-balance">{balance === undefined ? "..." : balance ?? "0"}</b></div>
      <button className="btn" disabled={busy || wait > 0} onClick={drip}>{busy ? "Sending" : wait > 0 ? `Next in ${waitText(wait)}` : "Get 1 test NEAR"}</button>
      <small className="muted">One free test NEAR every 2 hours.</small>
    </div>
  );
}

export default function Profile() {
  const g = useGame();
  const [amount, setAmount] = useState("1"), [forgetting, setForgetting] = useState(false);
  useEffect(() => { g.init(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="page">
      <header><h1>Profile</h1><Nav /></header>
      {g.toast && <div className="notice" role="status">{g.toast.text}</div>}
      <div className="grid2">
        <section>
          <h2 style={{ marginTop: 0 }}>Account</h2>
          {g.mode === "practice" ? <p>Practice mode. Progress lives in this browser and nothing goes on-chain. To play on testnet, deploy the contract and set <code>GAME_CONTRACT</code>.</p>
            : g.session ? <p className="copyline">Playing as <code title={g.session.accountId}>{shortAccount(g.session.accountId)}</code><CopyAddress /> <span className="muted">{g.session.kind === "guest" ? "Guest key in this browser" : "Signed in"}, NEAR testnet</span></p>
            : <p>No account yet. Claim test funds to play without a wallet, or sign in with a social or email login.</p>}
          <p>Net worth <b>{coins(worth(g.player))}</b>. Coins <b>{coins(g.player.coins)}</b>.</p>
          <div className="row">
            {g.mode === "chain" && !g.session && <button className="btn" onClick={() => g.useGuest().catch((e) => g.say(String(e.message), true))}>Claim test funds and play</button>}
            {g.mode === "chain" && !g.session && <Link className="btn ghost" href="/signin">Sign in with Google or email</Link>}
            {g.mode === "chain" && g.session && <WalletExport />}
            {g.mode === "chain" && g.session && !forgetting && <button className="btn ghost" onClick={() => (g.session!.kind === "guest" ? setForgetting(true) : g.signOut())}>Forget this key</button>}
            {g.mode === "practice" && <button className="btn ghost" onClick={g.resetPractice}>Reset practice save</button>}
            {!g.player.started && <button className="btn" onClick={() => g.startDriving()}>Start game</button>}
          </div>
          {forgetting && <div className="notice">
            <p style={{ marginTop: 0 }}>This guest wallet has no other key. Without an export, its NEAR and progress are lost for good.</p>
            <div className="row"><button className="btn danger" onClick={() => { setForgetting(false); g.signOut(); }}>Forget it anyway</button><button className="btn ghost" onClick={() => setForgetting(false)}>Keep it</button></div>
          </div>}
        </section>
        <section>
          <h2 style={{ marginTop: 0 }}>Credits</h2>
          {g.mode === "chain" && g.session && <Wallet accountId={g.session.accountId} />}
          <p>You have <b data-testid="profile-credits">{g.player.credits}</b> credits. 1 NEAR buys {c.credits_per_near} credits, which pay for fuel, repairs, vehicles and stall locations. Credit purchases are final.</p>
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
      {g.board.length ? <table className="prices"><thead><tr><th>Player</th><th className="num">Sections built</th><th className="num">Net worth</th></tr></thead><tbody>{g.board.slice(0, 10).map((r) => <tr key={r.account_id}><td title={r.account_id}>{shortAccount(r.account_id)}</td><td className="num">{r.sections_built}</td><td className="num">{coins(r.net_worth)}</td></tr>)}</tbody></table> : <p>The board fills in once this game runs on testnet.</p>}
    </div>
  );
}
