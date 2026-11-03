// The price rule. Must match contracts/nearverse/src/engine.rs exactly; fixtures check both.
import type { Config, Market } from "./types";
const SCALE = 1_000_000n;
const MAX_RATIO = 100n * SCALE;

export function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}

/** (target/stock)^(kq/4) in 1e6 fixed point, computed with integer roots only. */
export function powRatio(target: number, stock: number, kq: number): bigint {
  const s = BigInt(Math.max(stock, 1));
  let r = (BigInt(target) * SCALE) / s;
  if (r > MAX_RATIO) r = MAX_RATIO;
  const half = isqrt(r * SCALE);
  const quarter = isqrt(half * SCALE);
  switch (kq) {
    case 1: return quarter;
    case 2: return half;
    case 3: return (half * quarter) / SCALE;
    case 4: return r;
    case 6: return (r * half) / SCALE;
    case 8: return (r * r) / SCALE;
    default: throw new Error("bad k_quarters");
  }
}

export function stockPrice(c: Config, base: number, target: number, stock: number, kq: number): number {
  const raw = (BigInt(base) * powRatio(target, stock, kq)) / SCALE;
  const floor = BigInt(Math.floor((base * c.floor_bps) / 10000));
  const ceil = BigInt(Math.floor((base * c.ceiling_bps) / 10000));
  const p = raw < floor ? floor : raw > ceil ? ceil : raw;
  return Number(p);
}

export const currentBlueprint = (c: Config, tick: number) =>
  Math.floor(tick / c.blueprint_period_ticks) % c.blueprints.length;

/** Whether this merchant currently pays a premium for this item. */
export function premiumFor(c: Config, merchant: number, item: number, tick: number): number {
  const m = c.merchants[merchant];
  if (m.premium_bps === 0) return 0;
  const bp = c.blueprints[currentBlueprint(c, tick)];
  return bp.sections.some((s) => s.needs[item] > 0) ? m.premium_bps : 0;
}

export function bidAt(c: Config, merchant: number, item: number, tick: number, target: number, stock: number): number {
  const m = c.merchants[merchant];
  const p = stockPrice(c, c.items[item].base_price, target, stock, m.k_quarters);
  const withPremium = Math.floor((p * (10000 + premiumFor(c, merchant, item, tick))) / 10000);
  return Math.floor((withPremium * (10000 - m.spread_bps)) / 10000);
}

export function askAt(c: Config, merchant: number, item: number, target: number, stock: number): number {
  const m = c.merchants[merchant];
  const p = stockPrice(c, c.items[item].base_price, target, stock, m.k_quarters);
  return Math.floor((p * (10000 + m.spread_bps)) / 10000);
}

export function bid(c: Config, mk: Market, merchant: number, item: number) {
  const s = mk.merchants[merchant];
  return bidAt(c, merchant, item, mk.tick, s.target[item], s.stock[item]);
}
export function ask(c: Config, mk: Market, merchant: number, item: number) {
  const s = mk.merchants[merchant];
  return askAt(c, merchant, item, s.target[item], s.stock[item]);
}

/** Total the merchant pays for qty units, walking the price down as stock rises. */
export function quoteSell(c: Config, mk: Market, merchant: number, item: number, qty: number): number {
  const s = mk.merchants[merchant];
  let total = 0, stock = s.stock[item];
  for (let i = 0; i < qty; i++) { total += bidAt(c, merchant, item, mk.tick, s.target[item], stock); stock += 1; }
  return total;
}
export function quoteBuy(c: Config, mk: Market, merchant: number, item: number, qty: number): number {
  const s = mk.merchants[merchant];
  let total = 0, stock = s.stock[item];
  for (let i = 0; i < qty; i++) { total += askAt(c, merchant, item, s.target[item], stock); stock -= 1; }
  return total;
}
