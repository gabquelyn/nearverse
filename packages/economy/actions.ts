// Player actions. Rules and error codes mirror contracts/nearverse/src/engine.rs.
import type { Config, Market, Player } from "./types";
import { bidAt, askAt } from "./price";

export class GameError extends Error { constructor(public code: string) { super(code); } }
const fail = (code: string): never => { throw new GameError(code); };

export const newPlayer = (c: Config): Player => ({
  started: false, coins: 0, principal: 0, items: c.items.map(() => 0), durability: 0,
  last_gather_ms: 0, last_trade_ms: 0, last_merchant: null,
  blueprints: c.blueprints.map(() => 0), quest_window: 0, quest_progress: 0,
});

export function startGame(c: Config, p: Player) {
  if (p.started) fail("ALREADY_STARTED");
  p.started = true; p.coins += c.start_coins; p.items[c.fuel_item] += c.start_fuel; p.durability = c.max_durability;
}
const need = (p: Player) => { if (!p.started) fail("NOT_STARTED"); };
export const cargoUsed = (c: Config, p: Player) => p.items.reduce((a, q, i) => (i === c.fuel_item ? a : a + q), 0);

export function gather(c: Config, mk: Market, p: Player, node: number, now: number): number {
  need(p);
  const n = c.nodes[node]; if (!n) return fail("BAD_NODE");
  if (now < p.last_gather_ms + c.gather_cooldown_ms) fail("COOLDOWN");
  if (p.durability <= n.wear) fail("TRUCK_DAMAGED");
  if (p.items[c.fuel_item] < n.fuel_cost) fail("OUT_OF_FUEL");
  const qty = Math.min(n.yield_qty, mk.nodes[node]);
  if (qty === 0) fail("NODE_EMPTY");
  if (n.item !== c.fuel_item && cargoUsed(c, p) + qty > c.cargo_capacity) fail("CARGO_FULL");
  p.items[c.fuel_item] -= n.fuel_cost; p.durability -= n.wear; p.items[n.item] += qty;
  mk.nodes[node] -= qty; p.last_gather_ms = now;
  const w = Math.floor(mk.tick / c.quest_period_ticks);
  if (p.quest_window !== w) { p.quest_window = w; p.quest_progress = 0; }
  if (node === w % c.nodes.length && p.quest_progress < c.quest_gathers) {
    p.quest_progress += 1;
    if (p.quest_progress === c.quest_gathers) p.items[w % c.items.length] += c.quest_reward_qty;
  }
  return qty;
}

function travel(c: Config, p: Player, merchant: number, now: number) {
  if (!c.merchants[merchant]) fail("BAD_MERCHANT");
  if (p.last_merchant !== null && p.last_merchant !== merchant && now < p.last_trade_ms + c.travel_ms) fail("TRAVELING");
}
function checkTrade(c: Config, item: number, qty: number) {
  if (!c.items[item]) fail("BAD_ITEM");
  if (qty === 0 || qty > c.max_trade_qty) fail("BAD_QTY");
}

export function sell(c: Config, mk: Market, p: Player, merchant: number, item: number, qty: number, minTotal: number, now: number): number {
  need(p); travel(c, p, merchant, now); checkTrade(c, item, qty);
  if (p.items[item] < qty) fail("NOT_ENOUGH_ITEMS");
  const s = mk.merchants[merchant];
  let total = 0, stock = s.stock[item];
  for (let i = 0; i < qty; i++) { total += bidAt(c, merchant, item, mk.tick, s.target[item], stock); stock += 1; }
  if (total < minTotal) fail("PRICE_MOVED");
  if (s.cash < total) fail("MERCHANT_OUT_OF_CASH");
  s.stock[item] = stock; s.cash -= total; p.coins += total; p.items[item] -= qty;
  p.last_trade_ms = now; p.last_merchant = merchant;
  return total;
}

export function buy(c: Config, mk: Market, p: Player, merchant: number, item: number, qty: number, maxTotal: number, now: number): number {
  need(p); travel(c, p, merchant, now); checkTrade(c, item, qty);
  const s = mk.merchants[merchant];
  if (s.stock[item] < qty) fail("MERCHANT_OUT_OF_STOCK");
  if (item !== c.fuel_item && cargoUsed(c, p) + qty > c.cargo_capacity) fail("CARGO_FULL");
  let total = 0, stock = s.stock[item];
  for (let i = 0; i < qty; i++) { total += askAt(c, merchant, item, s.target[item], stock); stock -= 1; }
  if (total > maxTotal) fail("PRICE_MOVED");
  if (p.coins < total) fail("NOT_ENOUGH_COINS");
  s.stock[item] = stock; s.cash += total; p.coins -= total; p.items[item] += qty;
  p.last_trade_ms = now; p.last_merchant = merchant;
  return total;
}

export const foremanIndex = (c: Config) => c.merchants.findIndex((m) => m.premium_bps > 0);

export function repairQuote(c: Config, p: Player) {
  const missing = c.max_durability - p.durability;
  return { missing, iron: Math.ceil(missing / c.repair_points_per_iron), coins: missing * c.repair_cents_per_point };
}
export function repair(c: Config, mk: Market, p: Player) {
  need(p);
  const q = repairQuote(c, p);
  if (q.missing === 0) fail("NOTHING_TO_REPAIR");
  if (p.items[c.iron_item] < q.iron) fail("NOT_ENOUGH_ITEMS");
  if (p.coins < q.coins) fail("NOT_ENOUGH_COINS");
  p.items[c.iron_item] -= q.iron; p.coins -= q.coins; mk.merchants[foremanIndex(c)].cash += q.coins; p.durability = c.max_durability;
}

export function buildSection(c: Config, mk: Market, p: Player, blueprint: number) {
  need(p);
  const b = c.blueprints[blueprint]; if (!b) return fail("BAD_BLUEPRINT");
  const sec = b.sections[p.blueprints[blueprint]]; if (!sec) return fail("BLUEPRINT_DONE");
  sec.needs.forEach((q, i) => { if (p.items[i] < q) fail("NOT_ENOUGH_ITEMS"); });
  if (p.coins < sec.labor) fail("NOT_ENOUGH_COINS");
  sec.needs.forEach((q, i) => { p.items[i] -= q; });
  p.coins -= sec.labor; mk.merchants[foremanIndex(c)].cash += sec.labor; p.blueprints[blueprint] += 1;
}

export function deposit(c: Config, p: Player, cents: number) {
  need(p); p.coins += cents; p.principal += cents;
}
export function withdraw(p: Player, cents: number) {
  need(p);
  if (cents === 0 || cents > p.principal) fail("OVER_DEPOSIT_CAP");
  if (cents > p.coins) fail("NOT_ENOUGH_COINS");
  p.coins -= cents; p.principal -= cents;
}
export const netWorth = (c: Config, p: Player) => p.items.reduce((a, q, i) => a + q * c.items[i].base_price, p.coins);
