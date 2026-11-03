// Fast-forward engine: a labeled, in-memory simulation on a copy of live state. Sends no transactions.
import type { Config, Market } from "./types";
import { newPlayer, startGame, sell, buy, gather, repair, buildSection, GameError, netWorth } from "./actions";
import { bid, ask } from "./price";
import { tickOnce, activeEvent } from "./tick";

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
  built: number;
}

export interface Sim {
  mk: Market; c: Config; rand: () => number; traders: ReturnType<typeof newPlayer>[]; now: number; history: HourSample[]; playerSold: number[]
}

export const cloneMarket = (m: Market): Market => JSON.parse(JSON.stringify(m));

export function createSim(c: Config, from: Market, traders = 14, seed = 7): Sim {
  const mk = cloneMarket(from);
  const ts = Array.from({ length: traders }, () => { const p = newPlayer(c); startGame(c, p); p.items[c.fuel_item] += 60; return p; });
  return { mk, c, rand: rng(seed), traders: ts, now: 0, history: [], playerSold: c.items.map(() => 0) };
}

const tryDo = (f: () => unknown) => { try { f(); return true; } catch (e) { if (e instanceof GameError) return false; throw e; } };

/** One simulated trader takes one simple, greedy decision. */
function act(sim: Sim, t: ReturnType<typeof newPlayer>): "trade" | "build" | null {
  const { c, mk } = sim;
  sim.now += 20_000;
  if (t.durability < 25) tryDo(() => repair(c, mk, t));
  if (t.items[c.fuel_item] < 4) {
    // Fill up for free at the pump when it has fuel; otherwise pay a merchant, like a player would.
    const pump = c.nodes.findIndex((n) => n.item === c.fuel_item);
    if (mk.nodes[pump] > 0 && tryDo(() => gather(c, mk, t, pump, sim.now))) return null;
    const m = Math.floor(sim.rand() * c.merchants.length);
    tryDo(() => buy(c, mk, t, m, c.fuel_item, 3, 1e9, sim.now));
  }
  const bpIdx = t.blueprints.findIndex((done, i) => done < c.blueprints[i].sections.length);
  if (bpIdx >= 0 && tryDo(() => buildSection(c, mk, t, bpIdx))) return "build";
  // sell what is priced above base, otherwise gather
  let best = -1, bestM = 0, bestRatio = 1.0;
  t.items.forEach((q, it) => {
    if (it === c.fuel_item || q < 3) return;
    c.merchants.forEach((_, m) => { const r = bid(c, mk, m, it) / c.items[it].base_price; if (r > bestRatio) { bestRatio = r; best = it; bestM = m; } });
  });
  const full = t.items.reduce((a, q, i) => (i === c.fuel_item ? a : a + q), 0) > c.cargo_capacity - 8;
  if (best < 0 && full) {
    best = t.items.indexOf(Math.max(...t.items.filter((_, i) => i !== c.fuel_item)));
    bestM = Math.floor(sim.rand() * c.merchants.length);
  }
  if (best >= 0 && t.items[best] > 0) {
    const qty = Math.min(t.items[best], 6);
    if (tryDo(() => sell(c, mk, t, bestM, best, qty, 0, sim.now))) { sim.playerSold[best] += qty; return "trade"; }
  }
  // needs of the first unfinished blueprint guide what to fetch
  const sec = bpIdx >= 0 ? c.blueprints[bpIdx].sections[t.blueprints[bpIdx]] : null;
  const missing = sec ? sec.needs.findIndex((q, i) => t.items[i] < q) : -1;
  if (missing >= 0 && t.coins > 6000 && sim.rand() < 0.35) {
    const m = Math.floor(sim.rand() * c.merchants.length);
    if (ask(c, mk, m, missing) < c.items[missing].base_price * 1.5 && tryDo(() => buy(c, mk, t, m, missing, 2, 1e9, sim.now))) return "trade";
  }
  const nodes = c.nodes.map((n, i) => ({ n, i })).filter(({ n }) => (missing < 0 || n.item === missing || sim.rand() < 0.25));
  const pick = nodes[Math.floor(sim.rand() * nodes.length)] ?? { i: 0 };
  tryDo(() => gather(c, mk, t, pick.i, sim.now));
  return null;
}

/** Advances one market hour. */
export function stepHour(sim: Sim): HourSample {
  const { c, mk } = sim;
  let trades = 0, built = 0;
  for (const t of sim.traders) {
    for (let a = 0; a < 3; a++) { const r = act(sim, t); if (r === "trade") trades++; if (r === "build") built++; }
  }
  tickOnce(c, mk);
  const sample: HourSample = {
    tick: mk.tick,
    prices: c.items.map((_, it) => Math.round(c.merchants.reduce((a, __, m) => a + ask(c, mk, m, it), 0) / c.merchants.length)),
    cash: mk.merchants.map((m) => m.cash),
    targets: c.items.map((_, it) => mk.merchants.reduce((a, m) => a + m.target[it], 0)),
    event: activeEvent(c, mk.tick)?.title ?? null,
    trades, built,
  };
  sim.history.push(sample);
  return sample;
}

/** Judge button: dump iron (or anything else) on every merchant at once. */
export function floodMarket(sim: Sim, item: number, units: number) {
  for (const s of sim.mk.merchants) s.stock[item] += units;
}

export const standings = (sim: Sim) => sim.traders.map((t) => netWorth(sim.c, t)).sort((a, b) => b - a);
