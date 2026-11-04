"use client";
import { useState } from "react";
import { rules as c, coins, cityBuyback, explainStall } from "@nearverse/economy";
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
  if (!s.owner) {
    return (
      <>
        <h2>{l.name}</h2>
        <p>A location for sale, in the {biomeName(l.x, l.z)}. It needs {l.needs.map((q, i) => (q ? `${q} ${c.items[i].name.toLowerCase()}` : null)).filter(Boolean).join(", ")} to build on.</p>
        <button className="btn action" disabled={player.credits < l.price} onClick={() => act({ t: "claim_lot", lot })}>Buy this location for {l.price} credits</button>
      </>
    );
  }
  if (!s.built) {
    if (s.owner !== me) return <><h2>{l.name}</h2><p>Reserved by {ownerLabel(s.owner)}. No stall has been built yet.</p></>;
    const ready = l.needs.every((q, i) => player.items[i] >= q);
    return (
      <>
        <h2>{l.name}</h2>
        <p>Your location. Bring these to build your stall. Materials you bought or found both count.</p>
        <ul className="needs">{l.needs.map((q, i) => (q ? <li key={i} className={player.items[i] >= q ? "met" : ""}><i className="swatch" style={{ background: `var(--${c.items[i].id})` }} />{c.items[i].name}: {player.items[i]} of {q}</li> : null))}</ul>
        <button className="btn action" disabled={!ready} onClick={() => act({ t: "build_stall", lot })}>{ready ? "Build this stall" : "Bring more materials"}</button>
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
          <tbody>{c.items.map((it, i) => (
            <tr key={it.id}>
              <td><span className="swatch" style={{ background: `var(--${it.id})`, marginRight: 6 }} />{it.name}</td>
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
        <tbody>{c.items.map((it, i) => (
          <tr key={it.id}>
            <td><span className="swatch" style={{ background: `var(--${it.id})`, marginRight: 6 }} />{it.name}</td>
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
