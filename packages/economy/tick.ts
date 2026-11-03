// Advances market time: stock reversion, stipends, adaptation, node regrowth and events.
import type { Config, Market } from "./types";

export function newMarket(c: Config): Market {
  return {
    tick: 0,
    merchants: c.merchants.map((m) => ({ stock: [...m.targets], target: [...m.targets], cash: m.start_cash })),
    nodes: c.nodes.map((n) => n.max_stock),
    stalls: c.lots.map((l) => l.seeded
      ? { owner: c.seed_owner, built: true, stock: c.items.map(() => c.seed_stock), cash: c.seed_cash, spread_bps: c.stall_spread_bps, price: c.seed_price }
      : { owner: null, built: false, stock: c.items.map(() => 0), cash: 0, spread_bps: c.stall_spread_bps, price: 0 }),
  };
}

export function tickOnce(c: Config, mk: Market): void {
  const t = mk.tick + 1;
  c.merchants.forEach((rules, i) => {
    const s = mk.merchants[i];
    for (let it = 0; it < s.stock.length; it++) {
      const diff = s.target[it] - s.stock[it];
      if (diff !== 0) {
        let step = Math.trunc((diff * rules.reversion_bps) / 10000);
        if (step === 0) step = diff > 0 ? 1 : -1;
        s.stock[it] += step;
      }
      if (t % c.adapt_every_ticks === 0) {
        const low = s.stock[it] * 10000 < s.target[it] * (10000 - c.adapt_band_bps);
        const high = s.stock[it] * 10000 > s.target[it] * (10000 + c.adapt_band_bps);
        if (low || high) {
          const step = Math.max(1, Math.floor((s.target[it] * c.adapt_step_bps) / 10000));
          const min = Math.floor((rules.targets[it] * c.adapt_min_bps) / 10000);
          const max = Math.floor((rules.targets[it] * c.adapt_max_bps) / 10000);
          s.target[it] = Math.min(max, Math.max(min, low ? s.target[it] + step : s.target[it] - step));
        }
      }
    }
    if (s.cash < rules.cash_cap) s.cash = Math.min(rules.cash_cap, s.cash + rules.stipend);
  });
  c.nodes.forEach((n, i) => { mk.nodes[i] = Math.min(n.max_stock, mk.nodes[i] + n.regrow); });
  if (t % c.event_period_ticks === 0) {
    const ev = c.events[(t / c.event_period_ticks - 1) % c.events.length];
    for (const s of mk.merchants) s.stock[ev.item] = Math.max(1, Math.floor((s.stock[ev.item] * ev.keep_bps) / 10000));
  }
  mk.tick = t;
}

/** Catches the market up to wall-clock time, at most max_catchup_ticks per call. */
export function advanceTo(c: Config, mk: Market, nowMs: number, genesisMs: number): void {
  const due = Math.floor((nowMs - genesisMs) / c.tick_ms);
  let budget = c.max_catchup_ticks;
  while (mk.tick < due && budget-- > 0) tickOnce(c, mk);
}

export function activeEvent(c: Config, tick: number) {
  const n = Math.floor(tick / c.event_period_ticks);
  if (n === 0) return null;
  if (tick - n * c.event_period_ticks >= c.event_duration_ticks) return null;
  return c.events[(n - 1) % c.events.length];
}
