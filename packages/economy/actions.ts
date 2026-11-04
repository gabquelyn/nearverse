// Player actions. Rules and error codes mirror contracts/nearverse/src/engine.rs.
import type { Config, Market, MerchantState, Player } from "./types";
import { merchantClosed } from "./tick";
import { bidAt, askAt, stallBidAt, stallAskAt } from "./price";

export class GameError extends Error { constructor(public code: string) { super(code); } }
const fail = (code: string): never => { throw new GameError(code); };

export const newPlayer = (c: Config): Player => ({
  started: false, coins: 0, credits: 0, fuel: 0, items: c.items.map(() => 0), durability: 0,
  last_gather_ms: 0, last_trade_ms: 0, last_merchant: null,
  blueprints: c.blueprints.map(() => 0), quest_window: 0, quest_progress: 0,
  vehicle: 0, owned_vehicles: c.vehicles.map((_, i) => i === 0),
});

export function startGame(c: Config, p: Player) {
  if (p.started) fail("ALREADY_STARTED");
  p.started = true; p.coins += c.start_coins; p.credits += c.start_credits; p.fuel = c.start_fuel; p.durability = c.vehicles[0].endurance;
}
export const vehicleOf = (c: Config, p: Player) => c.vehicles[p.vehicle];
const need = (p: Player) => { if (!p.started) fail("NOT_STARTED"); };
export const cargoUsed = (_c: Config, p: Player) => p.items.reduce((a, q) => a + q, 0);

export const fuelBurn = (c: Config, p: Player, base: number) => Math.ceil((base * vehicleOf(c, p).fuel_bps) / 10000);

export function gather(c: Config, mk: Market, p: Player, node: number, now: number): number {
  need(p);
  const n = c.nodes[node]; if (!n) return fail("BAD_NODE");
  if (now < p.last_gather_ms + c.gather_cooldown_ms) fail("COOLDOWN");
  if (p.durability <= n.wear) fail("TRUCK_DAMAGED");
  const burn = fuelBurn(c, p, n.fuel_cost);
  if (p.fuel < burn) fail("OUT_OF_FUEL");
  const qty = Math.min(n.yield_qty, mk.nodes[node]);
  if (qty === 0) fail("NODE_EMPTY");
  if (cargoUsed(c, p) + qty > vehicleOf(c, p).capacity) fail("CARGO_FULL");
  p.fuel -= burn; p.durability -= n.wear; p.items[n.item] += qty; p.coins += n.rich * c.rich_bonus_per_point;
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
  if (merchantClosed(c, mk, merchant)) fail("MERCHANT_CLOSED");
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
  if (merchantClosed(c, mk, merchant)) fail("MERCHANT_CLOSED");
  const s = mk.merchants[merchant];
  if (s.stock[item] < qty) fail("MERCHANT_OUT_OF_STOCK");
  if (cargoUsed(c, p) + qty > vehicleOf(c, p).capacity) fail("CARGO_FULL");
  let total = 0, stock = s.stock[item];
  for (let i = 0; i < qty; i++) { total += askAt(c, merchant, item, s.target[item], stock); stock -= 1; }
  if (total > maxTotal) fail("PRICE_MOVED");
  if (p.coins < total) fail("NOT_ENOUGH_COINS");
  s.stock[item] = stock; s.cash += total - shareWithInvestors(c, s, total); p.coins -= total; p.items[item] += qty;
  p.last_trade_ms = now; p.last_merchant = merchant;
  return total;
}

/** Sets aside investors' cut of a sale, split by stake. Returns what was set aside. */
function shareWithInvestors(c: Config, s: MerchantState, sale: number) {
  const staked = s.investors.reduce((a, i) => a + i.stake, 0);
  if (staked === 0) return 0;
  const cut = Math.floor((sale * c.investor_cut_bps) / 10000);
  let paid = 0;
  for (const i of s.investors) { const e = Math.floor((cut * i.stake) / staked); i.earned += e; paid += e; }
  return paid;
}

/** Puts coins into a merchant's cash for good, in return for a share of what it sells. This is how a closed shop reopens. */
export function investInMerchant(c: Config, mk: Market, p: Player, who: string, merchant: number, cents: number) {
  need(p);
  const s = mk.merchants[merchant]; if (!s) return fail("BAD_MERCHANT");
  if (cents === 0) fail("BAD_QTY");
  if (p.coins < cents) fail("NOT_ENOUGH_COINS");
  const mine = s.investors.find((i) => i.who === who);
  if (!mine && s.investors.length >= c.max_investors) fail("INVESTORS_FULL");
  p.coins -= cents; s.cash += cents;
  if (mine) mine.stake += cents; else s.investors.push({ who, stake: cents, earned: 0 });
}

export function collectFromMerchant(mk: Market, p: Player, who: string, merchant: number) {
  need(p);
  const s = mk.merchants[merchant]; if (!s) return fail("BAD_MERCHANT");
  const mine = s.investors.find((i) => i.who === who);
  if (!mine || mine.earned === 0) return fail("NOTHING_TO_COLLECT");
  const earned = mine.earned;
  p.coins += earned; mine.earned = 0;
  return earned;
}

export const foremanIndex = (c: Config) => c.merchants.findIndex((m) => m.premium_bps > 0);

// ---------- Credits: bought with NEAR, spent on fuel, repairs, vehicles and stall locations ----------
export function addCredits(p: Player, credits: number) { need(p); p.credits += credits; }
const spend = (p: Player, credits: number) => { if (p.credits < credits) fail("NOT_ENOUGH_CREDITS"); p.credits -= credits; };

/** Upkeep comes out of coins. With too few, the same amount is charged in credits, so nobody gets stranded. */
function payUpkeep(p: Player, cents: number) {
  if (p.coins >= cents) { p.coins -= cents; return; }
  spend(p, Math.ceil(cents / 100));
}
export function repairQuote(c: Config, p: Player) {
  const missing = vehicleOf(c, p).endurance - p.durability;
  return { missing, cost: missing * c.coins_per_repair };
}
export function repair(c: Config, p: Player) {
  need(p);
  const q = repairQuote(c, p);
  if (q.missing === 0) fail("NOTHING_TO_REPAIR");
  payUpkeep(p, q.cost);
  p.durability = vehicleOf(c, p).endurance;
}
export function refuelQuote(c: Config, p: Player) {
  const missing = vehicleOf(c, p).tank - p.fuel;
  return { missing, cost: missing * c.coins_per_fuel };
}
export function refuel(c: Config, p: Player, units: number) {
  need(p);
  if (units === 0 || units > refuelQuote(c, p).missing) fail("BAD_QTY");
  payUpkeep(p, units * c.coins_per_fuel);
  p.fuel += units;
}
/** Fuel used while driving, reported by the client. It can only hurt the player, so cheating here only skips a cost. */
export function burnFuel(c: Config, p: Player, units: number) {
  need(p);
  if (units === 0 || units > vehicleOf(c, p).tank) fail("BAD_QTY");
  p.fuel = Math.max(0, p.fuel - units);
}

/** Crash damage reported by the client. It can only hurt the player, so cheating here gains nothing. */
export function takeDamage(c: Config, p: Player, points: number) {
  need(p);
  if (points === 0 || points > vehicleOf(c, p).endurance) fail("BAD_QTY");
  p.durability = Math.max(0, p.durability - points);
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

export const netWorth = (c: Config, p: Player) => p.items.reduce((a, q, i) => a + q * c.items[i].base_price, p.coins);

// ---------- Vehicles ----------
export function vehiclePrice(c: Config, index: number): number {
  const v = c.vehicles[index];
  const total = v.capacity * c.price_per_capacity + v.endurance * c.price_per_endurance + ((10000 - v.fuel_bps) / 100) * c.price_per_fuel_percent + v.flair * c.price_per_flair + v.size * c.price_per_size;
  return Math.max(0, total);
}
export function buyVehicle(c: Config, p: Player, index: number) {
  need(p);
  if (!c.vehicles[index]) fail("BAD_VEHICLE");
  if (p.owned_vehicles[index]) fail("ALREADY_OWNED");
  const price = vehiclePrice(c, index);
  spend(p, price);
  p.owned_vehicles[index] = true;
  return price;
}
export function selectVehicle(c: Config, p: Player, index: number) {
  need(p);
  if (!c.vehicles[index]) fail("BAD_VEHICLE");
  if (!p.owned_vehicles[index]) fail("NOT_OWNED");
  if (cargoUsed(c, p) > c.vehicles[index].capacity) fail("CARGO_FULL");
  p.vehicle = index; p.durability = Math.min(p.durability, c.vehicles[index].endurance); p.fuel = Math.min(p.fuel, c.vehicles[index].tank);
}

// ---------- Player stalls ----------
const lotOf = (c: Config, mk: Market, lot: number) => { if (!c.lots[lot]) fail("BAD_LOT"); return mk.stalls[lot]; };
const ownerOnly = (c: Config, mk: Market, lot: number, who: string) => { const s = lotOf(c, mk, lot); if (s.owner !== who) fail("NOT_YOUR_STALL"); return s; };
const builtOwner = (c: Config, mk: Market, lot: number, who: string) => { const s = ownerOnly(c, mk, lot, who); if (!s.built) fail("NOT_BUILT"); return s; };

/** Buys a location with credits. Nothing stands there until the owner brings the materials. */
export function claimLot(c: Config, mk: Market, p: Player, who: string, lot: number) {
  need(p);
  const s = lotOf(c, mk, lot);
  if (s.owner !== null) fail("LOT_TAKEN");
  spend(p, c.lots[lot].price);
  s.owner = who; s.built = false; s.spread_bps = c.stall_spread_bps; s.price = 0;
}
/** Builds on a location you own. Bought or found materials both count, and they are used up. */
export function buildStall(c: Config, mk: Market, p: Player, who: string, lot: number) {
  need(p);
  const s = ownerOnly(c, mk, lot, who);
  if (s.built) fail("ALREADY_BUILT");
  const needs = c.lots[lot].needs;
  needs.forEach((q, i) => { if (p.items[i] < q) fail("NOT_ENOUGH_ITEMS"); });
  needs.forEach((q, i) => { p.items[i] -= q; });
  s.built = true;
}
const stallOpen = (c: Config, mk: Market, p: Player, who: string, lot: number, item: number, qty: number, now: number) => {
  need(p);
  const s = lotOf(c, mk, lot);
  if (s.owner === null || !s.built) fail("NO_STALL");
  if (s.owner === who) fail("YOUR_OWN_STALL");
  checkTrade(c, item, qty);
  const place = 100 + lot;
  if (p.last_merchant !== null && p.last_merchant !== place && now < p.last_trade_ms + c.travel_ms) fail("TRAVELING");
  return s;
};
export function sellToStall(c: Config, mk: Market, p: Player, who: string, lot: number, item: number, qty: number, minTotal: number, now: number): number {
  const s = stallOpen(c, mk, p, who, lot, item, qty, now);
  if (p.items[item] < qty) fail("NOT_ENOUGH_ITEMS");
  let total = 0, stock = s.stock[item];
  for (let i = 0; i < qty; i++) { total += stallBidAt(c, item, s.spread_bps, stock); stock += 1; }
  if (total < minTotal) fail("PRICE_MOVED");
  if (s.cash < total) fail("MERCHANT_OUT_OF_CASH");
  s.stock[item] = stock; s.cash -= total; p.coins += total; p.items[item] -= qty;
  p.last_trade_ms = now; p.last_merchant = 100 + lot;
  return total;
}
export function buyFromStall(c: Config, mk: Market, p: Player, who: string, lot: number, item: number, qty: number, maxTotal: number, now: number): number {
  const s = stallOpen(c, mk, p, who, lot, item, qty, now);
  if (s.stock[item] < qty) fail("MERCHANT_OUT_OF_STOCK");
  if (cargoUsed(c, p) + qty > vehicleOf(c, p).capacity) fail("CARGO_FULL");
  let total = 0, stock = s.stock[item];
  for (let i = 0; i < qty; i++) { total += stallAskAt(c, item, s.spread_bps, stock); stock -= 1; }
  if (total > maxTotal) fail("PRICE_MOVED");
  if (p.coins < total) fail("NOT_ENOUGH_COINS");
  s.stock[item] = stock; s.cash += total; p.coins -= total; p.items[item] += qty;
  p.last_trade_ms = now; p.last_merchant = 100 + lot;
  return total;
}
export function stockStall(c: Config, mk: Market, p: Player, who: string, lot: number, item: number, qty: number) {
  need(p); const s = builtOwner(c, mk, lot, who); checkTrade(c, item, qty);
  if (p.items[item] < qty) fail("NOT_ENOUGH_ITEMS");
  p.items[item] -= qty; s.stock[item] += qty;
}
export function unstockStall(c: Config, mk: Market, p: Player, who: string, lot: number, item: number, qty: number) {
  need(p); const s = builtOwner(c, mk, lot, who); checkTrade(c, item, qty);
  if (s.stock[item] < qty) fail("MERCHANT_OUT_OF_STOCK");
  if (cargoUsed(c, p) + qty > vehicleOf(c, p).capacity) fail("CARGO_FULL");
  s.stock[item] -= qty; p.items[item] += qty;
}
export function fundStall(c: Config, mk: Market, p: Player, who: string, lot: number, cents: number) {
  need(p); const s = builtOwner(c, mk, lot, who);
  if (cents === 0) fail("BAD_QTY");
  if (p.coins < cents) fail("NOT_ENOUGH_COINS");
  p.coins -= cents; s.cash += cents;
}
export function collectStall(c: Config, mk: Market, p: Player, who: string, lot: number) {
  need(p); const s = ownerOnly(c, mk, lot, who);
  const cash = s.cash; p.coins += cash; s.cash = 0; return cash;
}
export function setStallSpread(c: Config, mk: Market, p: Player, who: string, lot: number, bps: number) {
  need(p); const s = builtOwner(c, mk, lot, who);
  if (bps < c.stall_min_spread_bps || bps > c.stall_max_spread_bps) fail("BAD_SPREAD");
  s.spread_bps = bps;
}
/** Puts a stall up for sale. A price of 0 takes it off the market. */
export function listStall(c: Config, mk: Market, p: Player, who: string, lot: number, price: number) {
  need(p); builtOwner(c, mk, lot, who).price = price;
}
/** Buys a listed stall. Stock stays with the stall; its cash goes to the seller. Returns who to pay and how much. */
export function buyListedStall(c: Config, mk: Market, p: Player, who: string, lot: number) {
  need(p);
  const s = lotOf(c, mk, lot);
  if (s.owner === null || !s.built || s.price === 0) fail("NOT_FOR_SALE");
  if (s.owner === who) fail("YOUR_OWN_STALL");
  if (p.coins < s.price) fail("NOT_ENOUGH_COINS");
  const seller = s.owner as string, paid = s.price + s.cash;
  p.coins -= s.price; s.owner = who; s.price = 0; s.cash = 0;
  // A merchant's stall pays into its cash, which can reopen a closed shop.
  const shop = c.merchants.findIndex((m) => `merchant:${m.id}` === seller);
  if (shop >= 0) { mk.merchants[shop].cash += paid; return { seller: "", paid }; }
  return { seller, paid };
}
export const cityBuyback = (c: Config, lot: number) =>
  Math.floor((c.lots[lot].needs.reduce((a, q, i) => a + q * c.items[i].base_price, 0) * c.city_buyback_bps) / 10000);
/** Sells an empty stall to the city, paid in coins by the Foreman, and frees the location. Credits are not refunded. */
export function sellStallToCity(c: Config, mk: Market, p: Player, who: string, lot: number) {
  need(p); const s = ownerOnly(c, mk, lot, who);
  if (s.stock.some((q) => q > 0)) fail("STALL_NOT_EMPTY");
  const value = s.built ? cityBuyback(c, lot) : 0, f = mk.merchants[foremanIndex(c)];
  if (f.cash < value) fail("MERCHANT_OUT_OF_CASH");
  f.cash -= value; p.coins += value + s.cash; s.owner = null; s.built = false; s.cash = 0; s.price = 0;
  return value;
}
