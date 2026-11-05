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
  const kinds: Record<string, string> = { wood: "Timber stand", iron: "Iron seam", slate: "Slate outcrop", clay: "Clay bank", stone: "Stone quarry", sand: "Sand dune", reed: "Reed bed", coal: "Coal seam", copper: "Copper vein", limestone: "Limestone cut", hardwood: "Hardwood stand", salt: "Salt pan", resin: "Resin grove", wool: "Sheep pasture", tin: "Tin lode", ice: "Ice cave", silver: "Silver vein", obsidian: "Obsidian flow", amber: "Amber pit", quartz: "Quartz geode", gold: "Gold seam", sapphire: "Sapphire pocket", ruby: "Ruby pocket", meteorite: "Meteor crater" };
  const out: any[] = [];
  const add = (item: string, x: number, z: number, rich: number, region: string) => {
    const sc = it.resources.tier_scale[it.items[idx(item)].tier];
    out.push({ id: `spot-${out.length}`, name: kinds[item], region, item: idx(item), yield_qty: Math.max(1, Math.round((3 + rich * 5) * sc.yield / 100)), max_stock: Math.max(4, Math.round((30 + rich * 30) * sc.stock / 100)), regrow: Math.max(1, Math.round((3 + Math.round((1 - rich) * 3)) * sc.regrow / 100)),
      fuel_cost: 1 + Math.round(rich * 2), wear: Math.round(rich * rich * 14), rich: Math.round(rich * 100), x: Math.round(x), z: Math.round(z) });
  };
  for (const s of it.resources.starter_spots) add(s.item, s.x, s.z, 0, "Home");
  for (const g of it.resources.regions) for (let i = 0; i < g.count; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * g.spread, x = g.x + Math.cos(a) * d, z = g.z + Math.sin(a) * d;
    if (Math.hypot(x, z) > 960) { i--; continue; }
    let rich = Math.min(1, Math.pow(r(), 1.6) * 0.6 + (Math.hypot(x, z) / 1000) * 0.45);
    // Rarer materials are less likely, and only turn up at richer spots: the far end of each region's list is the rarest.
    const tierOf = (id: string) => it.items[idx(id)].tier as number;
    const allowed = g.items.filter((id: string) => tierOf(id) <= 2 || (tierOf(id) === 3 && rich >= 0.45) || (tierOf(id) === 4 && rich >= 0.68));
    const weight = (id: string) => [0, 50, 26, 9, 3][tierOf(id)];
    let roll = r() * allowed.reduce((a: number, id: string) => a + weight(id), 0), item = allowed[0];
    for (const id of allowed) { roll -= weight(id); if (roll <= 0) { item = id; break; } }
    // The first spots in each region cover its whole list, so every material exists somewhere, and rare ones sit at rich spots.
    if (i < g.items.length) { item = g.items[i]; rich = Math.max(rich, [0, 0, 0, 0.5, 0.75][tierOf(item)]); }
    add(item, x, z, rich, g.name);
  }
  return out;
}

const config = {
  tick_ms: r.time.tick_ms,
  max_catchup_ticks: r.time.max_catchup_ticks,
  floor_bps: r.price.floor_bps,
  ceiling_bps: r.price.ceiling_bps,
  items: it.items.map((i: any) => ({ id: i.id, name: i.name, base_price: i.base_price, tier: i.tier, color: i.color })),
  merchants: r.merchants.map((m: any) => ({
    id: m.id, name: m.name, personality: m.personality, k_quarters: m.k_quarters, spread_bps: m.spread_bps,
    premium_bps: m.premium_bps, start_cash: m.start_cash, cash_cap: m.cash_cap, stipend: m.stipend,
    reversion_bps: m.reversion_bps, x: m.x, z: m.z, targets: ids.map((id) => m.targets[id] ?? 0), // 0 means this merchant doesn't deal in it
  })),
  adapt_every_ticks: r.adaptation.every_ticks, adapt_band_bps: r.adaptation.band_bps, adapt_step_bps: r.adaptation.step_bps,
  adapt_min_bps: r.adaptation.target_min_bps, adapt_max_bps: r.adaptation.target_max_bps,
  blueprint_period_ticks: r.foreman_blueprint_period_ticks,
  event_period_ticks: r.events.period_ticks, event_duration_ticks: r.events.duration_ticks,
  events: r.events.list.map((e: any) => ({ id: e.id, title: e.title, text: e.text, item: idx(e.item), keep_bps: e.keep_bps })),
  nodes: makeNodes(),
  ...{
    start_coins: it.player.start_coins,
    plot_deadline_ms: it.player.plot_deadline_ms, gather_cooldown_ms: it.player.gather_cooldown_ms, travel_ms: it.player.travel_ms,
    max_trade_qty: it.player.max_trade_qty, ...it.credits,
  },
  quest_period_ticks: it.quests.period_ticks, quest_gathers: it.quests.gathers_required, quest_reward_qty: it.quests.reward_qty,
  blueprints: it.blueprints.map((b: any) => ({
    id: b.id, name: b.name,
    sections: b.sections.map((s: any) => ({ needs: ids.map((id) => s.needs[id] ?? 0), labor: s.labor })),
  })),
};
const merchantStalls: Record<string, string> = r.stalls.merchant_stalls;
const merchantIndex = (id: string) => { const n = r.merchants.findIndex((m: any) => m.id === id); if (n < 0) fail("unknown merchant " + id); return n; };
Object.assign(config, {
  ...it.vehicle_pricing,
  vehicles: it.vehicles.map((v: any) => {
    if (v.fuel_bps % 100) fail(`${v.id} fuel_bps must be a whole percent`);
    return { id: v.id, name: v.name, blurb: v.blurb, capacity: v.capacity, endurance: v.endurance, fuel_bps: v.fuel_bps, tank: v.tank, flair: v.flair, size: v.size, paint: v.paint };
  }),
  lots: it.stall_lots.map((l: any) => ({ id: l.id, name: l.name, x: l.x, z: l.z, price: l.price, needs: ids.map((id) => l.needs[id] ?? 0), accepts: l.accepts.map(idx), seeded: l.id in merchantStalls, seed_merchant: l.id in merchantStalls ? merchantIndex(merchantStalls[l.id]) : 0 })),
  closed_below_bps: r.closure.closed_below_bps, investor_cut_bps: r.closure.investor_cut_bps, max_investors: r.closure.max_investors,
  stall_k_quarters: r.stalls.k_quarters, stall_target: r.stalls.target_stock, stall_spread_bps: r.stalls.default_spread_bps,
  stall_min_spread_bps: r.stalls.min_spread_bps, stall_max_spread_bps: r.stalls.max_spread_bps, city_buyback_bps: r.stalls.city_buyback_bps,
  seed_price: r.stalls.seed_price, seed_stock: r.stalls.seed_stock, seed_cash: r.stalls.seed_cash,
});
if (![1, 2, 3, 4, 6, 8].includes(r.stalls.k_quarters)) fail("stalls k_quarters");
const out = config;
mkdirSync(root + "packages/economy/generated", { recursive: true });
writeFileSync(root + "packages/economy/generated/rules.json", JSON.stringify(out, null, 1) + "\n");
console.log("Wrote packages/economy/generated/rules.json");
