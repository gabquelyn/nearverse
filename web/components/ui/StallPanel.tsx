"use client";
import { useState } from "react";
import { rules as c, coins, cityBuyback, explainStall, plotExpired } from "@nearverse/economy";
import { PRACTICE_ID, useGame } from "@/lib/state/game";
import { useOutside } from "@/lib/useOutside";
import { biomeName } from "../world/world";

const ownerLabel = (owner: string) => (owner.startsWith("merchant:") ? `the ${c.merchants.find((m) => `merchant:${m.id}` === owner)?.name ?? "merchant"}` : owner.length > 24 ? `${owner.slice(0, 10)}…${owner.slice(-6)}` : owner);

function StallPrice({ lot, item, side }: { lot: number; item: number; side: "bid" | "ask" }) {
  const market = useGame((s) => s.market);
  const e = explainStall(c, market, lot, item, side);
  const [open, setOpen] = useState(false);
  useOutside(open, ".tip-wrap", () => setOpen(false));
  return <span className={`tip-wrap ${open ? "open" : ""}`}><button className="tip-btn" aria-label={e.sentence} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{coins(e.price)}</button><span className="tip" role="tooltip"><b>{e.sentence}</b>{e.lines.map((l) => <span key={l} style={{ display: "block" }}>{l}</span>)}</span></span>;
}

export function LotPanel({ lot }: { lot: number }) {
  const market = useGame((x) => x.market), player = useGame((x) => x.player), act = useGame((x) => x.act), session = useGame((x) => x.session);
  const [fund, setFund] = useState("50"), [listPrice, setListPrice] = useState("500"), [margin, setMargin] = useState("");
  const l = c.lots[lot], s = market.stalls[lot], me = session?.accountId ?? PRACTICE_ID;
  const lapsed = plotExpired(c, market, lot, Date.now());
  const needed = c.items.map((it, i) => ({ it, i, need: l.needs[i], got: s.progress[i] })).filter((x) => x.need > 0);
  const total = needed.reduce((a, x) => a + x.need, 0), done = needed.reduce((a, x) => a + x.got, 0);
  if (!s.owner || (lapsed && s.owner !== me)) {
    return (
      <>
        <h2>{l.name}</h2>
        <p>{s.owner ? "The last owner ran out of time, so this plot is back on the market. Their deposits are lost." : "A plot for sale"}, in the {biomeName(l.x, l.z)}. Buy it with credits, then bring materials over as many trips as you like.</p>
        <ul className="needs">{needed.map((x) => <li key={x.i}><i className="swatch" style={{ background: x.it.color }} />{x.it.name}: {x.need}</li>)}</ul>
        <p className="muted">Trades in {l.accepts.map((i) => c.items[i].name.toLowerCase()).join(", ")} once open.</p>
        <button className="btn action" disabled={player.credits < l.price} onClick={() => act({ t: "claim_lot", lot })}>Buy this location for {l.price} credits</button>
      </>
    );
  }
  if (!s.built) {
    const bar = <div className="buildbar" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}><i style={{ width: `${(done / total) * 100}%` }} /></div>;
    if (s.owner !== me) return <><h2>{l.name}</h2><p>{ownerLabel(s.owner)} is building here: {done} of {total} materials in.</p>{bar}</>;
    const left = s.last_deposit_ms + c.plot_deadline_ms - Date.now(), hours = Math.ceil(left / 3600000);
    const usable = needed.filter((x) => x.got < x.need && player.items[x.i] > 0);
    return (
      <>
        <h2>{l.name}</h2>
        <p>Your plot. Bring materials in any amount, over as many trips as you like. {left > 0 ? `Add something within ${hours >= 48 ? `${Math.floor(hours / 24)} days` : `${hours} hours`} or the plot goes back on the market.` : "Time has run out: anyone can buy this plot now. Add materials to keep it."}</p>
        {bar}
        <ul className="needs" data-testid="build-progress">{needed.map((x) => <li key={x.i} className={x.got >= x.need ? "met" : ""}><i className="swatch" style={{ background: x.it.color }} />{x.it.name} {x.got}/{x.need}<button className="btn small" aria-label={`Add ${x.it.name}`} disabled={x.got >= x.need || player.items[x.i] < 1} onClick={() => act({ t: "stall_deposit", lot, item: x.i, qty: Math.min(x.need - x.got, player.items[x.i], c.max_trade_qty) })}>Add {Math.min(x.need - x.got, player.items[x.i], c.max_trade_qty) || ""}</button></li>)}</ul>
        <div className="row"><button className="btn action" disabled={!usable.length} onClick={() => usable.forEach((x) => act({ t: "stall_deposit", lot, item: x.i, qty: Math.min(x.need - x.got, player.items[x.i], c.max_trade_qty) }))}>Add all I carry</button>
          <button className="btn small ghost" onClick={() => act({ t: "stall_city", lot })}>Give up this plot</button></div>
        <p className="muted">Giving up sells the plot to the city. You get no credits or materials back.</p>
      </>
    );
  }
  if (s.owner !== me) {
    return (
      <>
        <h2>{l.name}</h2>
        <p>Owned by {ownerLabel(s.owner)}. Cash on hand: <b>{coins(s.cash)}</b>.</p>
        <table className="prices">
          <thead><tr><th>Material</th><th className="num">Pays</th><th className="num">Charges</th><th className="num">Stock</th><th className="num">You have</th><th /></tr></thead>
          <tbody>{c.items.map((it, i) => !l.accepts.includes(i) ? null : (
            <tr key={it.id}>
              <td><span className="swatch" style={{ background: it.color, marginRight: 6 }} />{it.name}</td>
              <td className="num"><StallPrice lot={lot} item={i} side="bid" /></td><td className="num"><StallPrice lot={lot} item={i} side="ask" /></td>
              <td className="num">{s.stock[i]}</td><td className="num">{player.items[i]}</td>
              <td><span className="row" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
                <button className="btn small" aria-label={`Sell one ${it.name} to this stall`} disabled={player.items[i] < 1} onClick={() => act({ t: "stall_sell", lot, item: i, qty: 1 })}>Sell</button>
                <button className="btn small ghost" aria-label={`Buy one ${it.name} from this stall`} disabled={s.stock[i] < 1} onClick={() => act({ t: "stall_buy", lot, item: i, qty: 1 })}>Buy</button>
              </span></td>
            </tr>
          ))}</tbody>
        </table>
        {s.price > 0 && <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}><span>For sale: <b>{coins(s.price)}</b> coins, stock included.</span><button className="btn action" onClick={() => act({ t: "stall_buy_listed", lot })}>Buy this stall</button></div>}
      </>
    );
  }
  const anyStock = s.stock.some((q) => q > 0);
  return (
    <>
      <h2>{l.name}</h2>
      <p>Your stall. Sell what you find here: stock it, and you earn coins when others buy. Coins in the till: <b>{coins(s.cash)}</b>. If the till is empty, it stops buying. Withdrawing coins as NEAR is planned for later.</p>
      <table className="prices">
        <thead><tr><th>Material</th><th className="num">In stall</th><th className="num">You have</th><th /></tr></thead>
        <tbody>{c.items.map((it, i) => !l.accepts.includes(i) ? null : (
          <tr key={it.id}>
            <td><span className="swatch" style={{ background: it.color, marginRight: 6 }} />{it.name}</td>
            <td className="num">{s.stock[i]}</td><td className="num">{player.items[i]}</td>
            <td><span className="row" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
              <button className="btn small" aria-label={`Stock one ${it.name}`} disabled={player.items[i] < 1} onClick={() => act({ t: "stall_stock", lot, item: i, qty: 1 })}>Stock</button>
              <button className="btn small ghost" aria-label={`Take one ${it.name}`} disabled={s.stock[i] < 1} onClick={() => act({ t: "stall_unstock", lot, item: i, qty: 1 })}>Take</button>
            </span></td>
          </tr>
        ))}</tbody>
      </table>
      <div className="manage">
        <div className="row"><label className="field">Coins <input inputMode="decimal" value={fund} onChange={(e) => setFund(e.target.value)} /></label><button className="btn small" onClick={() => act({ t: "stall_fund", lot, cents: Math.round(Number(fund) * 100) })}>Add to till</button><button className="btn small ghost" disabled={s.cash === 0} onClick={() => act({ t: "stall_collect", lot })}>Collect till</button></div>
        <div className="row"><label className="field">Margin % <input inputMode="decimal" placeholder={String(s.spread_bps / 100)} value={margin} onChange={(e) => setMargin(e.target.value)} /></label><button className="btn small ghost" onClick={() => act({ t: "stall_spread", lot, bps: Math.round(Number(margin || s.spread_bps / 100) * 100) })}>Set margin</button><small>{c.stall_min_spread_bps / 100}% to {c.stall_max_spread_bps / 100}%</small></div>
        <div className="row"><label className="field">Price <input inputMode="decimal" value={listPrice} onChange={(e) => setListPrice(e.target.value)} /></label>
          {s.price > 0 ? <><span>Listed at <b>{coins(s.price)}</b></span><button className="btn small ghost" onClick={() => act({ t: "stall_list", lot, price: 0 })}>Take off market</button></> : <button className="btn small" onClick={() => act({ t: "stall_list", lot, price: Math.round(Number(listPrice) * 100) })}>List for sale</button>}</div>
        <div className="row"><button className="btn small ghost" disabled={anyStock} onClick={() => act({ t: "stall_city", lot })}>Sell to the city for {coins(cityBuyback(c, lot))}</button>{anyStock && <small>Take all stock out first.</small>}</div>
      </div>
    </>
  );
}
