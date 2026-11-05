// Price history kept in this browser. The tracker's saved history is merged in when it's set up, so the chart works either way.
import { rules as c, priceSnapshot, type Market, type PriceSnapshot } from "@nearverse/economy";

const KEY = "nearverse.prices.v1", MAX = 240;
let lastAt = 0, lastTick = -1;

export function readPrices(): PriceSnapshot[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
/** Saves at most every 15 seconds, or at once on a new market hour. */
export function samplePrices(market: Market, now = Date.now()) {
  if (market.tick === lastTick && now - lastAt < 15_000) return;
  lastAt = now; lastTick = market.tick;
  try { localStorage.setItem(KEY, JSON.stringify([...readPrices(), priceSnapshot(c, market, now)].slice(-MAX))); } catch { /* not remembered */ }
}
