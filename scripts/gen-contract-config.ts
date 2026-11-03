// merchants.rules.yaml + items.yaml -> one JSON used as contract init args and by the economy package.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parse } from "yaml";
const root = new URL("..", import.meta.url).pathname;
const r = parse(readFileSync(root + "config/merchants.rules.yaml", "utf8"));
const it = parse(readFileSync(root + "config/items.yaml", "utf8"));
const ids: string[] = it.items.map((i: any) => i.id);
const idx = (id: string) => { const n = ids.indexOf(id); if (n < 0) throw new Error("unknown item " + id); return n; };
const fail = (m: string) => { throw new Error("Invalid rules: " + m); };
for (const m of r.merchants) {
  if (![1, 2, 3, 4, 6, 8].includes(m.k_quarters)) fail(`${m.id} k_quarters`);
  if (m.premium_bps >= m.spread_bps) fail(`${m.id} premium must stay below spread`);
}
// Deterministic, so every build places resources in the same spots.
function makeNodes() {
  let seed = it.resources.seed;
  const r = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const kinds: Record<string, string> = { wood: "Timber stand", iron: "Iron seam", slate: "Slate outcrop", clay: "Clay bank" };
  const out: any[] = [];
  const add = (item: string, x: number, z: number, rich: number, region: string) => {
    out.push({ id: `spot-${out.length}`, name: kinds[item], region, item: idx(item), yield_qty: 3 + Math.round(rich * 5), max_stock: 30 + Math.round(rich * 30), regrow: 3 + Math.round((1 - rich) * 3),
      fuel_cost: 1 + Math.round(rich * 2), wear: Math.round(rich * rich * 14), rich: Math.round(rich * 100), x: Math.round(x), z: Math.round(z) });
  };
  for (const s of it.resources.starter_spots) add(s.item, s.x, s.z, 0, "Home");
  for (const g of it.resources.regions) for (let i = 0; i < g.count; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * g.spread, x = g.x + Math.cos(a) * d, z = g.z + Math.sin(a) * d;
    if (Math.hypot(x, z) > 960) { i--; continue; }
    add(g.items[Math.floor(r() * g.items.length)], x, z, Math.min(1, Math.pow(r(), 1.6) * 0.6 + (Math.hypot(x, z) / 1000) * 0.45), g.name);
  }
  return out;
}

const config = {
  tick_ms: r.time.tick_ms,
  max_catchup_ticks: r.time.max_catchup_ticks,
  floor_bps: r.price.floor_bps,
  ceiling_bps: r.price.ceiling_bps,
  items: it.items.map((i: any) => ({ id: i.id, name: i.name, base_price: i.base_price })),
  merchants: r.merchants.map((m: any) => ({
    id: m.id, name: m.name, personality: m.personality, k_quarters: m.k_quarters, spread_bps: m.spread_bps,
    premium_bps: m.premium_bps, start_cash: m.start_cash, cash_cap: m.cash_cap, stipend: m.stipend,
    reversion_bps: m.reversion_bps, x: m.x, z: m.z, targets: ids.map((id) => { if (m.targets[id] == null) fail(`${m.id} target ${id}`); return m.targets[id]; }),
  })),
  adapt_every_ticks: r.adaptation.every_ticks, adapt_band_bps: r.adaptation.band_bps, adapt_step_bps: r.adaptation.step_bps,
  adapt_min_bps: r.adaptation.target_min_bps, adapt_max_bps: r.adaptation.target_max_bps,
  blueprint_period_ticks: r.foreman_blueprint_period_ticks,
  event_period_ticks: r.events.period_ticks, event_duration_ticks: r.events.duration_ticks,
  events: r.events.list.map((e: any) => ({ id: e.id, title: e.title, text: e.text, item: idx(e.item), keep_bps: e.keep_bps })),
  nodes: makeNodes(),
  ...{
    start_coins: it.player.start_coins,
    gather_cooldown_ms: it.player.gather_cooldown_ms, travel_ms: it.player.travel_ms,
    max_trade_qty: it.player.max_trade_qty, ...it.credits,
  },
  quest_period_ticks: it.quests.period_ticks, quest_gathers: it.quests.gathers_required, quest_reward_qty: it.quests.reward_qty,
  blueprints: it.blueprints.map((b: any) => ({
    id: b.id, name: b.name,
    sections: b.sections.map((s: any) => ({ needs: ids.map((id) => s.needs[id] ?? 0), labor: s.labor })),
  })),
};
const seedLots: string[] = r.stalls.seed_lots;
Object.assign(config, {
  ...it.vehicle_pricing,
  vehicles: it.vehicles.map((v: any) => {
    if (v.fuel_bps % 100) fail(`${v.id} fuel_bps must be a whole percent`);
    return { id: v.id, name: v.name, blurb: v.blurb, capacity: v.capacity, endurance: v.endurance, fuel_bps: v.fuel_bps, tank: v.tank, flair: v.flair, size: v.size, paint: v.paint };
  }),
  lots: it.stall_lots.map((l: any) => ({ id: l.id, name: l.name, x: l.x, z: l.z, price: l.price, needs: ids.map((id) => l.needs[id] ?? 0), seeded: seedLots.includes(l.id) })),
  stall_k_quarters: r.stalls.k_quarters, stall_target: r.stalls.target_stock, stall_spread_bps: r.stalls.default_spread_bps,
  stall_min_spread_bps: r.stalls.min_spread_bps, stall_max_spread_bps: r.stalls.max_spread_bps, city_buyback_bps: r.stalls.city_buyback_bps,
  seed_owner: r.stalls.seed_owner, seed_price: r.stalls.seed_price, seed_stock: r.stalls.seed_stock, seed_cash: r.stalls.seed_cash,
});
if (![1, 2, 3, 4, 6, 8].includes(r.stalls.k_quarters)) fail("stalls k_quarters");
const out = config;
mkdirSync(root + "packages/economy/generated", { recursive: true });
writeFileSync(root + "packages/economy/generated/rules.json", JSON.stringify(out, null, 1) + "\n");
console.log("Wrote packages/economy/generated/rules.json");
