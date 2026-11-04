// Fast-forward engine: a labeled, in-memory simulation on a copy of live state. Sends no transactions.
import type { Config, Market } from "./types";
import { newPlayer, startGame, sell, buy, gather, repair, investInMerchant, GameError, netWorth } from "./actions";
import { bid, ask } from "./price";
import { tickOnce, activeEvent, merchantClosed } from "./tick";

/** Small deterministic PRNG, so a run with one seed can be replayed. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface HourSample {
  tick: number;
  /** Average merchant sell-to-player price per item. */
  prices: number[];
  cash: number[];
  targets: number[];
  event: string | null;
  trades: number;
  /** Merchants closed at the end of this hour. */
  closed: number[];
  /** Merchants that simulated traders reopened this hour. */
  reopened: number[];
}

export interface Sim {
  mk: Market; c: Config; rand: () => number; traders: ReturnType<typeof newPlayer>[]; now: number; history: HourSample[]; playerSold: number[]; closedFor: number[]
}

export const cloneMarket = (m: Market): Market => JSON.parse(JSON.stringify(m));

export function createSim(c: Config, from: Market, traders = 14, seed = 7): Sim {
  const mk = cloneMarket(from);
  const ts = Array.from({ length: traders }, () => { const p = newPlayer(c); startGame(c, p); p.fuel = 1e9; p.credits = 1e9; return p; });
  return { mk, c, rand: rng(seed), traders: ts, now: 0, history: [], playerSold: c.items.map(() => 0), closedFor: c.merchants.map(() => 0) };
}

const tryDo = (f: () => unknown) => { try { f(); return true; } catch (e) { if (e instanceof GameError) return false; throw e; } };

/** One simulated trader takes one simple, greedy decision. */
function act(sim: Sim, t: ReturnType<typeof newPlayer>): "trade" | null {
  const { c, mk } = sim;
  sim.now += 20_000;
  if (t.durability < 25) tryDo(() => repair(c, t));
  // sell what is priced above base, otherwise gather
  let best = -1, bestM = 0, bestRatio = 1.0;
  t.items.forEach((q, it) => {
    if (q < 3) return;
    c.merchants.forEach((_, m) => { const r = bid(c, mk, m, it) / c.items[it].base_price; if (r > bestRatio) { bestRatio = r; best = it; bestM = m; } });
  });
  const full = t.items.reduce((a, q) => a + q, 0) > c.vehicles[t.vehicle].capacity - 8;
  if (best < 0 && full) {
    best = t.items.indexOf(Math.max(...t.items));
    bestM = Math.floor(sim.rand() * c.merchants.length);
  }
  if (best >= 0 && t.items[best] > 0) {
    const qty = Math.min(t.items[best], 6);
    if (tryDo(() => sell(c, mk, t, bestM, best, qty, 0, sim.now))) { sim.playerSold[best] += qty; return "trade"; }
  }
  // now and then, stock up on whatever is cheap
  if (t.coins > 6000 && sim.rand() < 0.2) {
    const m = Math.floor(sim.rand() * c.merchants.length), it = Math.floor(sim.rand() * c.items.length);
    if (ask(c, mk, m, it) < c.items[it].base_price && tryDo(() => buy(c, mk, t, m, it, 2, 1e9, sim.now))) return "trade";
  }
  const pick = { i: Math.floor(sim.rand() * c.nodes.length) };
  tryDo(() => gather(c, mk, t, pick.i, sim.now));
  return null;
}

const REOPEN_AFTER_HOURS = 8;

/** Judge button: drains a merchant's cash, so its shop closes and investors have to save it. */
export function bankruptMerchant(sim: Sim, merchant: number) { sim.mk.merchants[merchant].cash = 0; }

/** Advances one market hour. */
export function stepHour(sim: Sim): HourSample {
  const { c, mk } = sim;
  let trades = 0;
  // The richest trader reopens any closed shop, for the share of its sales.
  const reopened: number[] = [];
  c.merchants.forEach((m, i) => {
    if (!merchantClosed(c, mk, i)) { sim.closedFor[i] = 0; return; }
    // Traders wait a few hours first, so you can see the shop sit closed.
    if (++sim.closedFor[i] <= REOPEN_AFTER_HOURS) return;
    const who = sim.traders.reduce((best, t) => (t.coins > best.coins ? t : best), sim.traders[0]);
    const cents = Math.floor((m.start_cash * c.closed_below_bps) / 10000) * 2;
    if (who.coins >= cents && tryDo(() => investInMerchant(c, mk, who, `sim-${sim.traders.indexOf(who)}`, i, cents))) reopened.push(i);
  });
  for (const t of sim.traders) {
    for (let a = 0; a < 3; a++) { if (act(sim, t) === "trade") trades++; }
  }
  tickOnce(c, mk);
  const sample: HourSample = {
    tick: mk.tick,
    prices: c.items.map((_, it) => Math.round(c.merchants.reduce((a, __, m) => a + ask(c, mk, m, it), 0) / c.merchants.length)),
    cash: mk.merchants.map((m) => m.cash),
    targets: c.items.map((_, it) => mk.merchants.reduce((a, m) => a + m.target[it], 0)),
    event: activeEvent(c, mk.tick)?.title ?? null,
    trades, closed: c.merchants.flatMap((_, i) => (merchantClosed(c, mk, i) ? [i] : [])), reopened,
  };
  sim.history.push(sample);
  return sample;
}

/** Judge button: dump iron (or anything else) on every merchant at once. */
export function floodMarket(sim: Sim, item: number, units: number) {
  for (const s of sim.mk.merchants) s.stock[item] += units;
}

export const standings = (sim: Sim) => sim.traders.map((t) => netWorth(sim.c, t)).sort((a, b) => b - a);
