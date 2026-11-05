"use client";
// The best deal for every material right now, one tap from setting a route there.
import { rules as c, bestPrices, coins, dealerName, merchantClosed, priceSnapshot } from "@nearverse/economy";
import { useGame } from "@/lib/state/game";

const spot = (dealer: string) => { const n = Number(dealer.slice(1)); return dealer[0] === "m" ? c.merchants[n] : c.lots[n]; };

export function PriceBoard({ onChart }: { onChart(item: number): void }) {
  const market = useGame((s) => s.market), setWaypoint = useGame((s) => s.setWaypoint), held = useGame((s) => s.player.items);
  const snap = priceSnapshot(c, market, 0);
  const go = (dealer: string) => { const p = spot(dealer); setWaypoint({ x: p.x, z: p.z, label: dealerName(c, dealer) }); };
  const cell = (b: { dealer: string; price: number } | null, what: string, name: string) => b ? <button className="linkish" aria-label={`Route to ${dealerName(c, b.dealer)}, ${what} ${coins(b.price)} for ${name}`} onClick={() => go(b.dealer)}><b>{coins(b.price)}</b> <small>{dealerName(c, b.dealer)}</small></button> : <span className="muted">Nobody</span>;
  return (
    <div className="priceboard" data-testid="price-board">
      <table className="prices">
        <thead><tr><th>Material</th><th className="num">You have</th><th>Best pay</th><th>Cheapest</th><th /></tr></thead>
        <tbody>{c.items.map((it, i) => {
          const b = bestPrices(c, snap, i, (j) => merchantClosed(c, market, j));
          return <tr key={it.id}><td><i className="swatch" style={{ background: it.color, marginRight: 6 }} />{it.name}</td><td className="num">{held[i]}</td><td>{cell(b.pays, "paying", it.name)}</td><td>{cell(b.charges, "charging", it.name)}</td><td><button className="btn small ghost" aria-label={`Chart ${it.name}`} onClick={() => onChart(i)}>Chart</button></td></tr>;
        })}</tbody>
      </table>
    </div>
  );
}
