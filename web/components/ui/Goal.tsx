"use client";
// The player's next goal, worked out from what they own and carry right now, so it changes as they play.
import { memo, useMemo } from "react";
import { rules as c, bestPrices, coins, dealerName, merchantClosed, plotExpired, priceSnapshot, refuelQuote, repairQuote, vehicleOf, type Market, type Player } from "@nearverse/economy";
import { PRACTICE_ID, useGame } from "@/lib/state/game";
import { truck } from "../world/world";

export interface Goal { text: string; route?: { x: number; z: number; label: string } }

const low = (s: string) => s.toLowerCase();
const spotOf = (dealer: string) => { const n = Number(dealer.slice(1)); const p = dealer[0] === "m" ? c.merchants[n] : c.lots[n]; return { x: p.x, z: p.z, label: dealerName(c, dealer) }; };

/** Most urgent first. Exported on its own so it can be tested without a browser. */
export function nextGoal(p: Player, mk: Market, me: string, now: number, at: { x: number; z: number } = { x: 0, z: 0 }): Goal {
  if (!p.started) return { text: "Press Start driving to begin." };
  const v = vehicleOf(c, p);
  if (refuelQuote(c, p).missing > 0 && p.fuel < v.tank * 0.15) return { text: "You're nearly out of fuel. Refuel from the top panel." };
  if (repairQuote(c, p).missing > 0 && p.durability < v.endurance * 0.25) return { text: "Your vehicle is badly damaged. Repair it from the top panel." };

  const snap = priceSnapshot(c, mk, now), best = (i: number) => bestPrices(c, snap, i, (j) => merchantClosed(c, mk, j));
  const mine = c.lots.map((l, i) => ({ l, i, s: mk.stalls[i] })).filter((x) => x.s.owner === me);

  // A plot being built comes first: bring what you have, then get what's missing.
  const site = mine.filter((x) => !x.s.built).sort((a, b) => a.s.last_deposit_ms - b.s.last_deposit_ms)[0];
  if (site) {
    const here = { x: site.l.x, z: site.l.z, label: site.l.name };
    const missing = site.l.needs.flatMap((q, i) => (q > site.s.progress[i] ? [{ i, left: q - site.s.progress[i] }] : []));
    const carried = missing.filter((m) => p.items[m.i] > 0);
    if (carried.length) return { text: `Take your ${carried.map((m) => low(c.items[m.i].name)).join(" and ")} to ${site.l.name} and add it to your plot.`, route: here };
    const m = missing[0], buy = best(m.i).charges, name = low(c.items[m.i].name);
    if (buy && p.coins >= buy.price) return { text: `${site.l.name} still needs ${m.left} ${name}. Buy it from ${dealerName(c, buy.dealer)} at ${coins(buy.price)} each, or find some.`, route: spotOf(buy.dealer) };
    return { text: `${site.l.name} still needs ${m.left} ${name}. Hunt for it, or sell a load to afford it.` };
  }

  const open = mine.filter((x) => x.s.built);
  const till = open.find((x) => x.s.cash > 0 && x.s.stock.some((q) => q === 0));
  const empty = open.find((x) => x.s.stock.every((q) => q === 0));
  if (empty) {
    const stockable = c.lots[empty.i].accepts.find((i) => p.items[i] > 0);
    if (stockable !== undefined) return { text: `Your stall at ${empty.l.name} is empty. Stock it with ${low(c.items[stockable].name)} so it can earn.`, route: { x: empty.l.x, z: empty.l.z, label: empty.l.name } };
  }

  if (!mine.length) {
    const free = c.lots.map((l, i) => ({ l, i })).filter(({ i }) => !mk.stalls[i].owner || plotExpired(c, mk, i, now)).sort((a, b) => a.l.price - b.l.price)[0];
    if (free && p.credits >= free.l.price) return { text: `Buy a plot to build your own stall. ${free.l.name} costs ${free.l.price} credits.`, route: { x: free.l.x, z: free.l.z, label: free.l.name } };
  }

  const carried = p.items.flatMap((q, i) => (q > 0 ? [{ q, i, pays: best(i).pays }] : [])).filter((x) => x.pays).sort((a, b) => b.q * b.pays!.price - a.q * a.pays!.price)[0];
  if (carried) return { text: `Sell your ${low(c.items[carried.i].name)}. ${dealerName(c, carried.pays!.dealer)} pays the most: ${coins(carried.pays!.price)} each.`, route: spotOf(carried.pays!.dealer) };
  if (till) return { text: `Collect the coins in your till at ${till.l.name}.`, route: { x: till.l.x, z: till.l.z, label: till.l.name } };

  const spot = c.nodes.map((n, i) => ({ n, i })).filter(({ i }) => mk.nodes[i] > 0).sort((a, b) => Math.hypot(a.n.x - at.x, a.n.z - at.z) - Math.hypot(b.n.x - at.x, b.n.z - at.z))[0];
  return { text: mine.length ? "Hunt for more materials to stock your stall and sell." : "Hunt for materials and sell them. Credits from your profile buy a plot of your own.", route: spot ? { x: spot.n.x, z: spot.n.z, label: "A hidden spot" } : undefined };
}

export const GoalLine = memo(function GoalLine() {
  const player = useGame((s) => s.player), market = useGame((s) => s.market), me = useGame((s) => s.session?.accountId ?? PRACTICE_ID), setWaypoint = useGame((s) => s.setWaypoint), going = useGame((s) => s.waypoint?.label);
  // Fixed once per change of state, so the suggested spot doesn't flicker while you drive.
  const goal = useMemo(() => nextGoal(player, market, me, Date.now(), { x: truck.pos.x, z: truck.pos.z }), [player, market, me]);
  return (
    <div className="goal" data-testid="goal">
      <small>Your next goal</small>
      <p>{goal.text}</p>
      {goal.route && going !== goal.route.label && <button className="btn small action" onClick={() => setWaypoint(goal.route!)}>Show me the way</button>}
    </div>
  );
});
