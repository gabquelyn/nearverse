// What the price tracker and the browser save: every dealer's prices at one moment.
import { ask, bid, stallAskAt, stallBidAt } from "./price";
import type { Config, Market } from "./types";

/** d[dealer][item] = [pays, charges], in cents. A dealer is m<index> for a merchant, s<index> for a stall. */
export interface PriceSnapshot { t: number; tick: number; d: Record<string, Record<string, [number, number]>> }

export function priceSnapshot(c: Config, mk: Market, t: number): PriceSnapshot {
  const d: PriceSnapshot["d"] = {};
  mk.merchants.forEach((m, j) => {
    const row: Record<string, [number, number]> = {};
    c.items.forEach((_, i) => { if (m.target[i] > 0) row[i] = [bid(c, mk, j, i), ask(c, mk, j, i)]; });
    d[`m${j}`] = row;
  });
  mk.stalls.forEach((s, l) => {
    if (!s.owner || !s.built) return;
    const row: Record<string, [number, number]> = {};
    for (const i of c.lots[l].accepts) row[i] = [stallBidAt(c, i, s.spread_bps, s.stock[i]), stallAskAt(c, i, s.spread_bps, s.stock[i])];
    d[`s${l}`] = row;
  });
  return { t, tick: mk.tick, d };
}

export const dealerName = (c: Config, dealer: string) => {
  const n = Number(dealer.slice(1));
  return dealer[0] === "m" ? c.merchants[n]?.name ?? dealer : c.lots[n]?.name ?? dealer;
};

/** The best price for a material right now, ignoring anyone who doesn't deal in it or is closed. */
export function bestPrices(c: Config, snapshot: PriceSnapshot, item: number, closed: (j: number) => boolean) {
  let pays: { dealer: string; price: number } | null = null, charges: { dealer: string; price: number } | null = null;
  for (const [dealer, row] of Object.entries(snapshot.d)) {
    if (dealer[0] === "m" && closed(Number(dealer.slice(1)))) continue;
    const p = row[item]; if (!p) continue;
    if (p[0] > 0 && (!pays || p[0] > pays.price)) pays = { dealer, price: p[0] };
    if (p[1] > 0 && (!charges || p[1] < charges.price)) charges = { dealer, price: p[1] };
  }
  return { pays, charges };
}
