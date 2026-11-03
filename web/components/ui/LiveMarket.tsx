"use client";
// The economy at a glance: who's trading, how much cash each merchant has left, and who's ahead.
import { memo, useState } from "react";
import { createPortal } from "react-dom";
import { rules as c, coins } from "@nearverse/economy";
import { useGame } from "@/lib/state/game";
import { shortAccount } from "@/lib/near/client";
import { useOutside } from "@/lib/useOutside";

export const LiveMarket = memo(function LiveMarket() {
  const merchants = useGame((s) => s.market.merchants), activity = useGame((s) => s.activity), board = useGame((s) => s.board), mode = useGame((s) => s.mode), me = useGame((s) => s.session?.accountId);
  const rank = me ? board.findIndex((r) => r.account_id === me) : -1;
  return (
    <div className="livemarket" data-testid="live-market">
      <div>
        <h3>Merchant cash</h3>
        {merchants.map((m, j) => (
          <div className="cashrow" key={c.merchants[j].id}><span>{c.merchants[j].name}</span><b>{coins(m.cash)}</b><div className="gauge"><i className={m.cash < c.merchants[j].start_cash * 0.15 ? "low" : ""} style={{ width: `${Math.min(100, (m.cash / c.merchants[j].start_cash) * 100)}%` }} /></div></div>
        ))}
      </div>
      <div>
        <h3>Recent trades</h3>
        {activity.length ? <ul>{activity.slice(0, 6).map((a) => <li key={a.id}>{a.text}</li>)}</ul> : <p className="muted">{mode === "practice" ? "Trades you make appear here." : "Waiting for the next trade."}</p>}
      </div>
      {mode === "chain" && <div>
        <h3>Top players{rank >= 0 ? `: you're #${rank + 1}` : ""}</h3>
        {board.length ? <ol>{board.slice(0, 3).map((r) => <li key={r.account_id} title={r.account_id}>{shortAccount(r.account_id)} <b>{coins(r.net_worth)}</b></li>)}</ol> : <p className="muted">No players yet.</p>}
      </div>}
    </div>
  );
});

export function MarketButton() {
  const [open, setOpen] = useState(false);
  useOutside(open, ".livepanel", () => setOpen(false));
  return (
    <>
      <button className="btn small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Market</button>
      {/* Drawn on the game layer, so the button row's position can't squeeze it. */}
      {open && createPortal(<section className="livepanel" aria-label="Live market"><LiveMarket /></section>, document.querySelector(".game") ?? document.body)}
    </>
  );
}
