"use client";
import { rules as c, explainPrice, coins, bid, ask, merchantClosed } from "@nearverse/economy";
import { useState } from "react";
import { PRACTICE_ID, useGame } from "@/lib/state/game";
import { useOutside } from "@/lib/useOutside";

function Price({ merchant, item, side }: { merchant: number; item: number; side: "bid" | "ask" }) {
  const market = useGame((s) => s.market);
  const e = explainPrice(c, market, merchant, item, side);
  const [open, setOpen] = useState(false);
  useOutside(open, ".tip-wrap", () => setOpen(false));
  return (
    <span className={`tip-wrap ${open ? "open" : ""}`}>
      <button className="tip-btn" aria-label={e.sentence} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{coins(e.price)}</button>
      <span className="tip" role="tooltip"><b>{e.sentence}</b>{e.lines.map((l) => <span key={l} style={{ display: "block" }}>{l}</span>)}</span>
    </span>
  );
}

export function MerchantTable({ merchant, plain = false }: { merchant: number; plain?: boolean }) {
  const market = useGame((x) => x.market), player = useGame((x) => x.player), act = useGame((x) => x.act);
  const s = market.merchants[merchant], rules = c.merchants[merchant];
  void bid; void ask;
  const closed = merchantClosed(c, market, merchant);
  return (
    <>
      <p>{rules.personality}. Cash on hand: <b>{coins(s.cash)}</b>.</p>
      {closed && <div className="notice" data-testid="closed">This shop is broke and closed. It won&apos;t trade or earn until players invest {coins(Math.ceil((rules.start_cash * c.closed_below_bps) / 10000) - s.cash)} more.</div>}
      <table className="prices">
        <thead><tr><th scope="col">Material</th><th scope="col" className="num">Pays</th><th scope="col" className="num">Charges</th><th scope="col" className="num">Stock / wants</th><th scope="col" className="num">You have</th><th scope="col"><span style={{ position: "absolute", left: -9999 }}>Trade</span></th></tr></thead>
        <tbody>
          {c.items.map((it, i) => s.target[i] === 0 ? null : (
            <tr key={it.id}>
              <td><span className="swatch" style={{ background: it.color, marginRight: 6 }} />{it.name}</td>
              <td className="num"><Price merchant={merchant} item={i} side="bid" /></td>
              <td className="num"><Price merchant={merchant} item={i} side="ask" /></td>
              <td className="num">{s.stock[i]} / {s.target[i]}</td>
              <td className="num">{player.items[i]}</td>
              <td>
                <span className="row" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
                  <button className="btn small" aria-label={`Sell one ${it.name}`} disabled={closed || (!plain && player.items[i] < 1)} onClick={() => act({ t: "sell", merchant, item: i, qty: 1 })}>Sell</button>
                  <button className="btn small" aria-label={`Sell all ${it.name}`} disabled={closed || player.items[i] < 1} onClick={() => act({ t: "sell", merchant, item: i, qty: Math.min(player.items[i], c.max_trade_qty) })}>All</button>
                  <button className="btn small ghost" aria-label={`Buy one ${it.name}`} disabled={closed} onClick={() => act({ t: "buy", merchant, item: i, qty: 1 })}>Buy</button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Invest merchant={merchant} />
    </>
  );
}

/** Players can back a merchant with coins for a share of its sales. That's also how a broke shop reopens. */
function Invest({ merchant }: { merchant: number }) {
  const investors = useGame((x) => x.market.merchants[merchant].investors), coinsHeld = useGame((x) => x.player.coins), act = useGame((x) => x.act), me = useGame((x) => x.session?.accountId ?? PRACTICE_ID);
  const [amount, setAmount] = useState("50");
  const mine = investors.find((i) => i.who === me), staked = investors.reduce((a, i) => a + i.stake, 0), cents = Math.round(Number(amount) * 100);
  return (
    <div className="invest" data-testid="invest">
      <p>Invest coins for good, and earn your share of {c.investor_cut_bps / 100}% of what this merchant sells.{mine ? ` Your stake: ${coins(mine.stake)} of ${coins(staked)}. Earned: ${coins(mine.earned)}.` : ""}</p>
      <div className="row">
        <label className="field">Coins <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} /></label>
        <button className="btn small action" disabled={!(cents > 0) || cents > coinsHeld} onClick={() => act({ t: "invest", merchant, cents })}>Invest</button>
        {mine && mine.earned > 0 && <button className="btn small" onClick={() => act({ t: "merchant_collect", merchant })}>Collect {coins(mine.earned)}</button>}
      </div>
    </div>
  );
}
