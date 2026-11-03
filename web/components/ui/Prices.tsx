"use client";
import { rules as c, explainPrice, coins, bid, ask } from "@nearverse/economy";
import { useState } from "react";
import { useGame } from "@/lib/state/game";
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
  return (
    <>
      <p>{rules.personality}. Cash on hand: <b>{coins(s.cash)}</b>{s.cash < 5000 ? ". Almost out, so it may stop buying." : "."}</p>
      <table className="prices">
        <thead><tr><th scope="col">Material</th><th scope="col" className="num">Pays</th><th scope="col" className="num">Charges</th><th scope="col" className="num">Stock / wants</th><th scope="col" className="num">You have</th><th scope="col"><span style={{ position: "absolute", left: -9999 }}>Trade</span></th></tr></thead>
        <tbody>
          {c.items.map((it, i) => (
            <tr key={it.id}>
              <td><span className="swatch" style={{ background: `var(--${it.id})`, marginRight: 6 }} />{it.name}</td>
              <td className="num"><Price merchant={merchant} item={i} side="bid" /></td>
              <td className="num"><Price merchant={merchant} item={i} side="ask" /></td>
              <td className="num">{s.stock[i]} / {s.target[i]}</td>
              <td className="num">{player.items[i]}</td>
              <td>
                <span className="row" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
                  <button className="btn small" aria-label={`Sell one ${it.name}`} disabled={!plain && player.items[i] < 1} onClick={() => act({ t: "sell", merchant, item: i, qty: 1 })}>Sell</button>
                  <button className="btn small" aria-label={`Sell all ${it.name}`} disabled={player.items[i] < 1} onClick={() => act({ t: "sell", merchant, item: i, qty: Math.min(player.items[i], c.max_trade_qty) })}>All</button>
                  <button className="btn small ghost" aria-label={`Buy one ${it.name}`} onClick={() => act({ t: "buy", merchant, item: i, qty: 1 })}>Buy</button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function Blueprints() {
  const player = useGame((x) => x.player), act = useGame((x) => x.act);
  return (
    <div>
      {c.blueprints.map((b, i) => {
        const done = player.blueprints[i], sec = b.sections[done];
        return (
          <div key={b.id} style={{ borderTop: "1px solid var(--line)", padding: "6px 0" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span><b>{b.name}</b> {done}/{b.sections.length} sections</span>
              <button className="btn small" disabled={!sec} onClick={() => act({ t: "build", blueprint: i })}>{sec ? "Build section" : "Finished"}</button>
            </div>
            {sec && <small>Needs {sec.needs.map((q, j) => (q ? `${player.items[j]}/${q} ${c.items[j].name.toLowerCase()}` : null)).filter(Boolean).join(", ")} and {coins(sec.labor)} labor</small>}
          </div>
        );
      })}
    </div>
  );
}
