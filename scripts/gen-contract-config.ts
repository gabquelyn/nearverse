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
const config = {
  tick_ms: r.time.tick_ms,
  max_catchup_ticks: r.time.max_catchup_ticks,
  floor_bps: r.price.floor_bps,
  ceiling_bps: r.price.ceiling_bps,
  items: it.items.map((i: any) => ({ id: i.id, name: i.name, base_price: i.base_price })),
  merchants: r.merchants.map((m: any) => ({
    id: m.id, name: m.name, personality: m.personality, k_quarters: m.k_quarters, spread_bps: m.spread_bps,
    premium_bps: m.premium_bps, start_cash: m.start_cash, cash_cap: m.cash_cap, stipend: m.stipend,
    reversion_bps: m.reversion_bps, targets: ids.map((id) => { if (m.targets[id] == null) fail(`${m.id} target ${id}`); return m.targets[id]; }),
  })),
  adapt_every_ticks: r.adaptation.every_ticks, adapt_band_bps: r.adaptation.band_bps, adapt_step_bps: r.adaptation.step_bps,
  adapt_min_bps: r.adaptation.target_min_bps, adapt_max_bps: r.adaptation.target_max_bps,
  blueprint_period_ticks: r.foreman_blueprint_period_ticks,
  event_period_ticks: r.events.period_ticks, event_duration_ticks: r.events.duration_ticks,
  events: r.events.list.map((e: any) => ({ id: e.id, title: e.title, text: e.text, item: idx(e.item), keep_bps: e.keep_bps })),
  nodes: it.nodes.map((n: any) => ({ id: n.id, item: idx(n.item), yield_qty: n.yield, max_stock: n.max_stock, regrow: n.regrow, fuel_cost: n.fuel_cost, wear: n.wear, x: n.x, z: n.z })),
  ...{
    start_coins: it.player.start_coins, start_fuel: it.player.start_fuel, max_durability: it.player.max_durability,
    cargo_capacity: it.player.cargo_capacity, gather_cooldown_ms: it.player.gather_cooldown_ms, travel_ms: it.player.travel_ms,
    max_trade_qty: it.player.max_trade_qty, repair_points_per_iron: it.player.repair_points_per_iron,
    repair_cents_per_point: it.player.repair_cents_per_point, cents_per_near: it.player.cents_per_near,
  },
  quest_period_ticks: it.quests.period_ticks, quest_gathers: it.quests.gathers_required, quest_reward_qty: it.quests.reward_qty,
  blueprints: it.blueprints.map((b: any) => ({
    id: b.id, name: b.name,
    sections: b.sections.map((s: any) => ({ needs: ids.map((id) => s.needs[id] ?? 0), labor: s.labor })),
  })),
};
const fuelIdx = ids.indexOf("fuel"), ironIdx = ids.indexOf("iron");
if (fuelIdx < 0 || ironIdx < 0) fail("fuel and iron are required");
const out = { ...config, fuel_item: fuelIdx, iron_item: ironIdx };
mkdirSync(root + "packages/economy/generated", { recursive: true });
writeFileSync(root + "packages/economy/generated/rules.json", JSON.stringify(out, null, 1) + "\n");
console.log("Wrote packages/economy/generated/rules.json");
