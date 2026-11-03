"use client";
import Link from "next/link";
import { rules as c, activeEvent, coins, cargoUsed, currentBlueprint, repairQuote } from "@nearverse/economy";
import { useGame, worth } from "@/lib/state/game";
import { MerchantTable, Blueprints } from "./Prices";

const NODE_NAMES: Record<string, string> = { "birch-grove": "Birch grove", "clay-pit": "Clay pit", "pump-yard": "Pump yard", "slate-cut": "Slate cut", "old-iron-pit": "Old iron pit", "mine-field": "Mine field" };
export const nodeName = (id: string) => NODE_NAMES[id] ?? id;

export function Hud() {
  const { player, market, mode, toast, zone, gatherProgress, away, dismissAway, act, board, session } = useGame();
  const ev = activeEvent(c, market.tick);
  const fuel = player.items[c.fuel_item];
  const node = zone?.kind === "node" ? c.nodes[zone.index] : null;
  const questWindow = Math.floor(market.tick / c.quest_period_ticks);
  const questNode = c.nodes[questWindow % c.nodes.length];
  const progress = player.quest_window === questWindow ? player.quest_progress : 0;
  const rank = session ? board.findIndex((r) => r.account_id === session.accountId) + 1 : 0;
  const rq = repairQuote(c, player);
  return (
    <>
      <div className="hud">
        <div className="plate"><small>Coins</small><b>{coins(player.coins)}</b></div>
        <div className="plate"><small>Net worth{rank ? `, rank ${rank}` : ""}</small><b>{coins(worth(player))}</b></div>
        <div className="plate"><small>Fuel {fuel}</small><div className="gauge"><i className={fuel < 4 ? "low" : ""} style={{ width: `${Math.min(100, fuel * 5)}%` }} /></div>
          <small>Truck {player.durability}%</small><div className="gauge"><i className={player.durability < 30 ? "low" : ""} style={{ width: `${player.durability}%` }} /></div></div>
        <div className="plate"><small>Truck bed {cargoUsed(c, player)}/{c.cargo_capacity}</small>
          <div className="cargo">{c.items.map((it, i) => it.id === "fuel" ? null : <span key={it.id} title={it.name}><i className="swatch" style={{ background: `var(--${it.id})` }} />{player.items[i]}</span>)}</div></div>
        <div className="plate" style={{ maxWidth: 240 }}><small>Job this shift</small><br />{progress >= c.quest_gathers ? "Done. Reward paid." : `${c.quest_gathers - progress} loads at ${nodeName(questNode.id)} for ${c.quest_reward_qty} ${c.items[questWindow % c.items.length].name.toLowerCase()}`}</div>
      </div>
      <nav className="links" aria-label="Pages"><Link href="/judge">Judge view</Link><Link href="/profile">Profile</Link></nav>
      {toast && <div className={`toast ${toast.bad ? "bad" : ""}`} role="status">{toast.text}</div>}
      {away ? (
        <div className="away"><h3>While you were away</h3><ul>{away.map((a) => <li key={a}>{a}</li>)}</ul><button className="btn small" onClick={dismissAway}>Back to driving</button></div>
      ) : ev ? <div className="event"><b>{ev.title}</b>{ev.text}</div> : null}
      {node && (
        <div className="prompt">
          {nodeName(node.id)}: hold E to load {node.yield_qty} {c.items[node.item].name.toLowerCase()}
          <div style={{ fontWeight: 400, fontSize: 13 }}>{market.nodes[zone!.index]} left, costs {node.fuel_cost} fuel{node.wear ? ` and ${node.wear}% truck wear` : ""}</div>
          <div className="bar"><i style={{ width: `${gatherProgress * 100}%` }} /></div>
        </div>
      )}
      {zone?.kind === "stall" && (
        <section className="panel" aria-label={`${c.merchants[zone.index].name} stall`}>
          <h2>{c.merchants[zone.index].name}</h2>
          <MerchantTable merchant={zone.index} />
          {c.merchants[zone.index].premium_bps > 0 && <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}><span>Blueprint now: {c.blueprints[currentBlueprint(c, market.tick)].name}</span>
            <button className="btn small" disabled={rq.missing === 0} onClick={() => act({ t: "repair" })}>{rq.missing ? `Repair: ${rq.iron} iron, ${coins(rq.coins)}` : "Truck is fine"}</button></div>}
        </section>
      )}
      {zone?.kind === "plot" && <section className="panel" aria-label="Your plot"><h2>Your plot</h2><p>Finished blueprints stand here for good.</p><Blueprints /></section>}
      <div className="modebar">{mode === "practice" ? "Practice mode: this browser only, nothing on-chain." : session ? `Playing on NEAR testnet. Actions confirm in the background.` : "Viewing NEAR testnet."} WASD or arrows to drive, Shift boost, Space jump, H honk, R reset.</div>
    </>
  );
}
