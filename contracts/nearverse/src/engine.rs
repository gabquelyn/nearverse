//! Pure game rules with no blockchain calls, so they can be replayed against TypeScript fixtures.
//! Mirrors packages/economy. Any change here must also change there; tests/parity.rs enforces it.
use near_sdk::near;

pub type R<T> = Result<T, &'static str>;

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Item { pub id: String, pub name: String, pub base_price: u64 }

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct MerchantRules {
    pub id: String, pub name: String, pub personality: String, pub k_quarters: u8,
    pub spread_bps: u64, pub premium_bps: u64, pub start_cash: u64, pub cash_cap: u64,
    pub stipend: u64, pub reversion_bps: u64, pub targets: Vec<u64>, pub x: i32, pub z: i32,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct EventRule { pub id: String, pub title: String, pub text: String, pub item: u32, pub keep_bps: u64 }

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct NodeRule {
    pub id: String, pub name: String, pub region: String, pub rich: u64, pub item: u32, pub yield_qty: u64, pub max_stock: u64, pub regrow: u64,
    pub fuel_cost: u64, pub wear: u64, pub x: i32, pub z: i32,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Section { pub needs: Vec<u64>, pub labor: u64 }

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Blueprint { pub id: String, pub name: String, pub sections: Vec<Section> }

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Vehicle { pub id: String, pub name: String, pub blurb: String, pub capacity: u64, pub endurance: u64, pub fuel_bps: u64, pub tank: u64, pub flair: u64, pub size: u64, pub paint: String }

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Lot { pub id: String, pub name: String, pub x: i32, pub z: i32, pub price: u64, pub needs: Vec<u64>, pub seeded: bool }

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Config {
    pub tick_ms: u64, pub max_catchup_ticks: u64, pub floor_bps: u64, pub ceiling_bps: u64,
    pub items: Vec<Item>, pub merchants: Vec<MerchantRules>,
    pub adapt_every_ticks: u64, pub adapt_band_bps: u64, pub adapt_step_bps: u64, pub adapt_min_bps: u64, pub adapt_max_bps: u64,
    pub blueprint_period_ticks: u64, pub event_period_ticks: u64, pub event_duration_ticks: u64, pub events: Vec<EventRule>,
    pub nodes: Vec<NodeRule>, pub start_coins: u64, pub start_fuel: u64, pub start_credits: u64, pub credits_per_near: u64, pub credits_per_fuel: u64, pub credits_per_repair: u64, pub meters_per_fuel: u64,
    pub gather_cooldown_ms: u64, pub travel_ms: u64, pub max_trade_qty: u64, pub quest_period_ticks: u64, pub quest_gathers: u64, pub quest_reward_qty: u64,
    pub blueprints: Vec<Blueprint>,
    pub vehicles: Vec<Vehicle>, pub price_per_capacity: i64, pub price_per_endurance: i64, pub price_per_fuel_percent: i64, pub price_per_flair: i64, pub price_per_size: i64,
    pub lots: Vec<Lot>, pub stall_k_quarters: u8, pub stall_target: u64, pub stall_spread_bps: u64, pub stall_min_spread_bps: u64, pub stall_max_spread_bps: u64, pub city_buyback_bps: u64,
    pub seed_owner: String, pub seed_price: u64, pub seed_stock: u64, pub seed_cash: u64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct MerchantState { pub stock: Vec<u64>, pub target: Vec<u64>, pub cash: u64 }

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct StallState { pub owner: Option<String>, pub built: bool, pub stock: Vec<u64>, pub cash: u64, pub spread_bps: u64, pub price: u64 }

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Market { pub tick: u64, pub merchants: Vec<MerchantState>, pub nodes: Vec<u64>, pub stalls: Vec<StallState> }

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Player {
    pub started: bool, pub coins: u64, pub credits: u64, pub fuel: u64, pub items: Vec<u64>, pub durability: u64,
    pub last_gather_ms: u64, pub last_trade_ms: u64, pub last_merchant: Option<u32>,
    pub blueprints: Vec<u64>, pub quest_window: u64, pub quest_progress: u64,
    pub vehicle: u32, pub owned_vehicles: Vec<bool>,
}

const SCALE: u128 = 1_000_000;
const MAX_RATIO: u128 = 100 * SCALE;

pub fn isqrt(n: u128) -> u128 {
    if n < 2 { return n; }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x { x = y; y = (x + n / x) / 2; }
    x
}

pub fn pow_ratio(target: u64, stock: u64, kq: u8) -> u128 {
    let s = stock.max(1) as u128;
    let r = ((target as u128 * SCALE) / s).min(MAX_RATIO);
    let half = isqrt(r * SCALE);
    let quarter = isqrt(half * SCALE);
    match kq {
        1 => quarter,
        2 => half,
        3 => half * quarter / SCALE,
        4 => r,
        6 => r * half / SCALE,
        8 => r * r / SCALE,
        _ => panic!("bad k_quarters"),
    }
}

pub fn stock_price(c: &Config, base: u64, target: u64, stock: u64, kq: u8) -> u64 {
    let raw = (base as u128 * pow_ratio(target, stock, kq)) / SCALE;
    let floor = (base as u128 * c.floor_bps as u128) / 10000;
    let ceil = (base as u128 * c.ceiling_bps as u128) / 10000;
    raw.clamp(floor, ceil) as u64
}

pub fn current_blueprint(c: &Config, tick: u64) -> usize {
    ((tick / c.blueprint_period_ticks) % c.blueprints.len() as u64) as usize
}

pub fn premium_for(c: &Config, merchant: usize, item: usize, tick: u64) -> u64 {
    let m = &c.merchants[merchant];
    if m.premium_bps == 0 { return 0; }
    let bp = &c.blueprints[current_blueprint(c, tick)];
    if bp.sections.iter().any(|s| s.needs[item] > 0) { m.premium_bps } else { 0 }
}

pub fn bid_at(c: &Config, merchant: usize, item: usize, tick: u64, target: u64, stock: u64) -> u64 {
    let m = &c.merchants[merchant];
    let p = stock_price(c, c.items[item].base_price, target, stock, m.k_quarters);
    let with_premium = p * (10000 + premium_for(c, merchant, item, tick)) / 10000;
    with_premium * (10000 - m.spread_bps) / 10000
}

pub fn ask_at(c: &Config, merchant: usize, item: usize, target: u64, stock: u64) -> u64 {
    let m = &c.merchants[merchant];
    let p = stock_price(c, c.items[item].base_price, target, stock, m.k_quarters);
    p * (10000 + m.spread_bps) / 10000
}

pub fn new_market(c: &Config) -> Market {
    Market {
        tick: 0,
        merchants: c.merchants.iter().map(|m| MerchantState { stock: m.targets.clone(), target: m.targets.clone(), cash: m.start_cash }).collect(),
        nodes: c.nodes.iter().map(|n| n.max_stock).collect(),
        stalls: c.lots.iter().map(|l| if l.seeded {
            StallState { owner: Some(c.seed_owner.clone()), built: true, stock: vec![c.seed_stock; c.items.len()], cash: c.seed_cash, spread_bps: c.stall_spread_bps, price: c.seed_price }
        } else {
            StallState { owner: None, built: false, stock: vec![0; c.items.len()], cash: 0, spread_bps: c.stall_spread_bps, price: 0 }
        }).collect(),
    }
}

pub fn tick_once(c: &Config, mk: &mut Market) {
    let t = mk.tick + 1;
    for (i, rules) in c.merchants.iter().enumerate() {
        let s = &mut mk.merchants[i];
        for it in 0..s.stock.len() {
            let diff = s.target[it] as i64 - s.stock[it] as i64;
            if diff != 0 {
                let mut step = diff * rules.reversion_bps as i64 / 10000;
                if step == 0 { step = if diff > 0 { 1 } else { -1 }; }
                s.stock[it] = (s.stock[it] as i64 + step) as u64;
            }
            if t % c.adapt_every_ticks == 0 {
                let low = s.stock[it] * 10000 < s.target[it] * (10000 - c.adapt_band_bps);
                let high = s.stock[it] * 10000 > s.target[it] * (10000 + c.adapt_band_bps);
                if low || high {
                    let step = (s.target[it] * c.adapt_step_bps / 10000).max(1);
                    let min = rules.targets[it] * c.adapt_min_bps / 10000;
                    let max = rules.targets[it] * c.adapt_max_bps / 10000;
                    let next = if low { s.target[it] + step } else { s.target[it].saturating_sub(step) };
                    s.target[it] = next.max(min).min(max);
                }
            }
        }
        if s.cash < rules.cash_cap { s.cash = (s.cash + rules.stipend).min(rules.cash_cap); }
    }
    for (i, n) in c.nodes.iter().enumerate() { mk.nodes[i] = (mk.nodes[i] + n.regrow).min(n.max_stock); }
    if t % c.event_period_ticks == 0 {
        let ev = &c.events[((t / c.event_period_ticks - 1) % c.events.len() as u64) as usize];
        for s in mk.merchants.iter_mut() {
            let it = ev.item as usize;
            s.stock[it] = (s.stock[it] * ev.keep_bps / 10000).max(1);
        }
    }
    mk.tick = t;
}

pub fn advance_to(c: &Config, mk: &mut Market, now_ms: u64, genesis_ms: u64) {
    let due = now_ms.saturating_sub(genesis_ms) / c.tick_ms;
    let mut budget = c.max_catchup_ticks;
    while mk.tick < due && budget > 0 { tick_once(c, mk); budget -= 1; }
}

pub fn new_player(c: &Config) -> Player {
    Player {
        started: false, coins: 0, credits: 0, fuel: 0, items: vec![0; c.items.len()], durability: 0,
        last_gather_ms: 0, last_trade_ms: 0, last_merchant: None,
        blueprints: vec![0; c.blueprints.len()], quest_window: 0, quest_progress: 0,
        vehicle: 0, owned_vehicles: c.vehicles.iter().enumerate().map(|(i, _)| i == 0).collect(),
    }
}

pub fn start_game(c: &Config, p: &mut Player) -> R<()> {
    if p.started { return Err("ALREADY_STARTED"); }
    p.started = true;
    p.coins += c.start_coins;
    p.credits += c.start_credits;
    p.fuel = c.start_fuel;
    p.durability = c.vehicles[0].endurance;
    Ok(())
}

pub fn vehicle_of<'a>(c: &'a Config, p: &Player) -> &'a Vehicle { &c.vehicles[p.vehicle as usize] }

pub fn fuel_burn(c: &Config, p: &Player, base: u64) -> u64 { (base * vehicle_of(c, p).fuel_bps).div_ceil(10000) }

fn need(p: &Player) -> R<()> { if p.started { Ok(()) } else { Err("NOT_STARTED") } }

pub fn cargo_used(_c: &Config, p: &Player) -> u64 { p.items.iter().sum() }

/// Returns (item minted, qty minted, optional quest reward (item, qty), fuel burned).
pub struct Gathered { pub item: usize, pub qty: u64, pub reward: Option<(usize, u64)>, pub fuel_burned: u64 }

pub fn gather(c: &Config, mk: &mut Market, p: &mut Player, node: usize, now: u64) -> R<Gathered> {
    need(p)?;
    let n = c.nodes.get(node).ok_or("BAD_NODE")?;
    if now < p.last_gather_ms + c.gather_cooldown_ms { return Err("COOLDOWN"); }
    if p.durability <= n.wear { return Err("TRUCK_DAMAGED"); }
    let burn = fuel_burn(c, p, n.fuel_cost);
    if p.fuel < burn { return Err("OUT_OF_FUEL"); }
    let qty = n.yield_qty.min(mk.nodes[node]);
    if qty == 0 { return Err("NODE_EMPTY"); }
    if cargo_used(c, p) + qty > vehicle_of(c, p).capacity { return Err("CARGO_FULL"); }
    p.fuel -= burn;
    p.durability -= n.wear;
    p.items[n.item as usize] += qty;
    mk.nodes[node] -= qty;
    p.last_gather_ms = now;
    let w = mk.tick / c.quest_period_ticks;
    if p.quest_window != w { p.quest_window = w; p.quest_progress = 0; }
    let mut reward = None;
    if node as u64 == w % c.nodes.len() as u64 && p.quest_progress < c.quest_gathers {
        p.quest_progress += 1;
        if p.quest_progress == c.quest_gathers {
            let it = (w % c.items.len() as u64) as usize;
            p.items[it] += c.quest_reward_qty;
            reward = Some((it, c.quest_reward_qty));
        }
    }
    Ok(Gathered { item: n.item as usize, qty, reward, fuel_burned: burn })
}

fn travel(c: &Config, p: &Player, merchant: usize, now: u64) -> R<()> {
    if merchant >= c.merchants.len() { return Err("BAD_MERCHANT"); }
    if let Some(last) = p.last_merchant {
        if last as usize != merchant && now < p.last_trade_ms + c.travel_ms { return Err("TRAVELING"); }
    }
    Ok(())
}

fn check_trade(c: &Config, item: usize, qty: u64) -> R<()> {
    if item >= c.items.len() { return Err("BAD_ITEM"); }
    if qty == 0 || qty > c.max_trade_qty { return Err("BAD_QTY"); }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn sell(c: &Config, mk: &mut Market, p: &mut Player, merchant: usize, item: usize, qty: u64, min_total: u64, now: u64) -> R<u64> {
    need(p)?; travel(c, p, merchant, now)?; check_trade(c, item, qty)?;
    if p.items[item] < qty { return Err("NOT_ENOUGH_ITEMS"); }
    let tick = mk.tick;
    let s = &mut mk.merchants[merchant];
    let (mut total, mut stock) = (0u64, s.stock[item]);
    for _ in 0..qty { total += bid_at(c, merchant, item, tick, s.target[item], stock); stock += 1; }
    if total < min_total { return Err("PRICE_MOVED"); }
    if s.cash < total { return Err("MERCHANT_OUT_OF_CASH"); }
    s.stock[item] = stock; s.cash -= total; p.coins += total; p.items[item] -= qty;
    p.last_trade_ms = now; p.last_merchant = Some(merchant as u32);
    Ok(total)
}

#[allow(clippy::too_many_arguments)]
pub fn buy(c: &Config, mk: &mut Market, p: &mut Player, merchant: usize, item: usize, qty: u64, max_total: u64, now: u64) -> R<u64> {
    need(p)?; travel(c, p, merchant, now)?; check_trade(c, item, qty)?;
    let s = &mut mk.merchants[merchant];
    if s.stock[item] < qty { return Err("MERCHANT_OUT_OF_STOCK"); }
    if cargo_used(c, p) + qty > vehicle_of(c, p).capacity { return Err("CARGO_FULL"); }
    let (mut total, mut stock) = (0u64, s.stock[item]);
    for _ in 0..qty { total += ask_at(c, merchant, item, s.target[item], stock); stock -= 1; }
    if total > max_total { return Err("PRICE_MOVED"); }
    if p.coins < total { return Err("NOT_ENOUGH_COINS"); }
    s.stock[item] = stock; s.cash += total; p.coins -= total; p.items[item] += qty;
    p.last_trade_ms = now; p.last_merchant = Some(merchant as u32);
    Ok(total)
}

fn foreman(c: &Config) -> usize { c.merchants.iter().position(|m| m.premium_bps > 0).expect("no foreman") }

// ---------- Credits: bought with NEAR, spent on fuel, repairs, vehicles and stall locations ----------
pub fn add_credits(p: &mut Player, credits: u64) -> R<()> { need(p)?; p.credits += credits; Ok(()) }

fn spend(p: &mut Player, credits: u64) -> R<()> {
    if p.credits < credits { return Err("NOT_ENOUGH_CREDITS"); }
    p.credits -= credits;
    Ok(())
}

pub fn repair(c: &Config, p: &mut Player) -> R<()> {
    need(p)?;
    let endurance = vehicle_of(c, p).endurance;
    let missing = endurance - p.durability;
    if missing == 0 { return Err("NOTHING_TO_REPAIR"); }
    spend(p, missing * c.credits_per_repair)?;
    p.durability = endurance;
    Ok(())
}

pub fn refuel(c: &Config, p: &mut Player, units: u64) -> R<()> {
    need(p)?;
    if units == 0 || units > vehicle_of(c, p).tank - p.fuel { return Err("BAD_QTY"); }
    spend(p, units * c.credits_per_fuel)?;
    p.fuel += units;
    Ok(())
}

/// Fuel used while driving, reported by the client. It can only hurt the player, so cheating here only skips a cost.
pub fn burn_fuel(c: &Config, p: &mut Player, units: u64) -> R<()> {
    need(p)?;
    if units == 0 || units > vehicle_of(c, p).tank { return Err("BAD_QTY"); }
    p.fuel = p.fuel.saturating_sub(units);
    Ok(())
}

/// Crash damage reported by the client. It can only hurt the player, so cheating here gains nothing.
pub fn take_damage(c: &Config, p: &mut Player, points: u64) -> R<()> {
    need(p)?;
    if points == 0 || points > vehicle_of(c, p).endurance { return Err("BAD_QTY"); }
    p.durability = p.durability.saturating_sub(points);
    Ok(())
}

pub fn build_section(c: &Config, mk: &mut Market, p: &mut Player, blueprint: usize) -> R<Vec<u64>> {
    need(p)?;
    let b = c.blueprints.get(blueprint).ok_or("BAD_BLUEPRINT")?;
    let sec = b.sections.get(p.blueprints[blueprint] as usize).ok_or("BLUEPRINT_DONE")?;
    if sec.needs.iter().enumerate().any(|(i, q)| p.items[i] < *q) { return Err("NOT_ENOUGH_ITEMS"); }
    if p.coins < sec.labor { return Err("NOT_ENOUGH_COINS"); }
    for (i, q) in sec.needs.iter().enumerate() { p.items[i] -= *q; }
    p.coins -= sec.labor;
    mk.merchants[foreman(c)].cash += sec.labor;
    p.blueprints[blueprint] += 1;
   
    Ok(sec.needs.clone())
}

pub fn net_worth(c: &Config, p: &Player) -> u64 {
    p.coins + p.items.iter().enumerate().map(|(i, q)| q * c.items[i].base_price).sum::<u64>()
}

// ---------- Vehicles ----------
pub fn vehicle_price(c: &Config, index: usize) -> u64 {
    let v = &c.vehicles[index];
    let saved = (10000 - v.fuel_bps as i64) / 100;
    let total = v.capacity as i64 * c.price_per_capacity + v.endurance as i64 * c.price_per_endurance
        + saved * c.price_per_fuel_percent + v.flair as i64 * c.price_per_flair + v.size as i64 * c.price_per_size;
    total.max(0) as u64
}

pub fn buy_vehicle(c: &Config, p: &mut Player, index: usize) -> R<u64> {
    need(p)?;
    if index >= c.vehicles.len() { return Err("BAD_VEHICLE"); }
    if p.owned_vehicles[index] { return Err("ALREADY_OWNED"); }
    let price = vehicle_price(c, index);
    spend(p, price)?;
    p.owned_vehicles[index] = true;
    Ok(price)
}

pub fn select_vehicle(c: &Config, p: &mut Player, index: usize) -> R<()> {
    need(p)?;
    if index >= c.vehicles.len() { return Err("BAD_VEHICLE"); }
    if !p.owned_vehicles[index] { return Err("NOT_OWNED"); }
    if cargo_used(c, p) > c.vehicles[index].capacity { return Err("CARGO_FULL"); }
    p.vehicle = index as u32;
    p.durability = p.durability.min(c.vehicles[index].endurance);
    p.fuel = p.fuel.min(c.vehicles[index].tank);
    Ok(())
}

// ---------- Player stalls ----------
fn stall_price(c: &Config, item: usize, stock: u64) -> u64 { stock_price(c, c.items[item].base_price, c.stall_target, stock, c.stall_k_quarters) }
pub fn stall_bid_at(c: &Config, item: usize, spread: u64, stock: u64) -> u64 { stall_price(c, item, stock) * (10000 - spread) / 10000 }
pub fn stall_ask_at(c: &Config, item: usize, spread: u64, stock: u64) -> u64 { stall_price(c, item, stock) * (10000 + spread) / 10000 }

fn owner_only<'a>(mk: &'a mut Market, lot: usize, who: &str) -> R<&'a mut StallState> {
    let s = mk.stalls.get_mut(lot).ok_or("BAD_LOT")?;
    if s.owner.as_deref() != Some(who) { return Err("NOT_YOUR_STALL"); }
    Ok(s)
}

fn built_owner<'a>(mk: &'a mut Market, lot: usize, who: &str) -> R<&'a mut StallState> {
    let s = owner_only(mk, lot, who)?;
    if !s.built { return Err("NOT_BUILT"); }
    Ok(s)
}

/// Buys a location with credits. Nothing stands there until the owner brings the materials.
pub fn claim_lot(c: &Config, mk: &mut Market, p: &mut Player, who: &str, lot: usize) -> R<()> {
    need(p)?;
    let s = mk.stalls.get_mut(lot).ok_or("BAD_LOT")?;
    if s.owner.is_some() { return Err("LOT_TAKEN"); }
    spend(p, c.lots[lot].price)?;
    s.owner = Some(who.to_string());
    s.built = false;
    s.spread_bps = c.stall_spread_bps;
    s.price = 0;
    Ok(())
}

/// Builds on a location you own. Bought or found materials both count, and they are used up.
pub fn build_stall(c: &Config, mk: &mut Market, p: &mut Player, who: &str, lot: usize) -> R<Vec<u64>> {
    need(p)?;
    let s = owner_only(mk, lot, who)?;
    if s.built { return Err("ALREADY_BUILT"); }
    let needs = &c.lots[lot].needs;
    if needs.iter().enumerate().any(|(i, q)| p.items[i] < *q) { return Err("NOT_ENOUGH_ITEMS"); }
    for (i, q) in needs.iter().enumerate() { p.items[i] -= *q; }
    s.built = true;
    Ok(needs.clone())
}

#[allow(clippy::too_many_arguments)]
fn stall_open(c: &Config, mk: &Market, p: &Player, who: &str, lot: usize, item: usize, qty: u64, now: u64) -> R<()> {
    need(p)?;
    let s = mk.stalls.get(lot).ok_or("BAD_LOT")?;
    match s.owner.as_deref() { None => return Err("NO_STALL"), Some(_) if !s.built => return Err("NO_STALL"), Some(o) if o == who => return Err("YOUR_OWN_STALL"), _ => {} }
    check_trade(c, item, qty)?;
    let place = 100 + lot as u32;
    if let Some(last) = p.last_merchant { if last != place && now < p.last_trade_ms + c.travel_ms { return Err("TRAVELING"); } }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn sell_to_stall(c: &Config, mk: &mut Market, p: &mut Player, who: &str, lot: usize, item: usize, qty: u64, min_total: u64, now: u64) -> R<u64> {
    stall_open(c, mk, p, who, lot, item, qty, now)?;
    if p.items[item] < qty { return Err("NOT_ENOUGH_ITEMS"); }
    let s = &mut mk.stalls[lot];
    let (mut total, mut stock) = (0u64, s.stock[item]);
    for _ in 0..qty { total += stall_bid_at(c, item, s.spread_bps, stock); stock += 1; }
    if total < min_total { return Err("PRICE_MOVED"); }
    if s.cash < total { return Err("MERCHANT_OUT_OF_CASH"); }
    s.stock[item] = stock; s.cash -= total; p.coins += total; p.items[item] -= qty;
    p.last_trade_ms = now; p.last_merchant = Some(100 + lot as u32);
    Ok(total)
}

#[allow(clippy::too_many_arguments)]
pub fn buy_from_stall(c: &Config, mk: &mut Market, p: &mut Player, who: &str, lot: usize, item: usize, qty: u64, max_total: u64, now: u64) -> R<u64> {
    stall_open(c, mk, p, who, lot, item, qty, now)?;
    let s = &mut mk.stalls[lot];
    if s.stock[item] < qty { return Err("MERCHANT_OUT_OF_STOCK"); }
    if cargo_used(c, p) + qty > vehicle_of(c, p).capacity { return Err("CARGO_FULL"); }
    let (mut total, mut stock) = (0u64, s.stock[item]);
    for _ in 0..qty { total += stall_ask_at(c, item, s.spread_bps, stock); stock -= 1; }
    if total > max_total { return Err("PRICE_MOVED"); }
    if p.coins < total { return Err("NOT_ENOUGH_COINS"); }
    s.stock[item] = stock; s.cash += total; p.coins -= total; p.items[item] += qty;
    p.last_trade_ms = now; p.last_merchant = Some(100 + lot as u32);
    Ok(total)
}

pub fn stock_stall(c: &Config, mk: &mut Market, p: &mut Player, who: &str, lot: usize, item: usize, qty: u64) -> R<()> {
    need(p)?;
    let s = built_owner(mk, lot, who)?;
    check_trade(c, item, qty)?;
    if p.items[item] < qty { return Err("NOT_ENOUGH_ITEMS"); }
    p.items[item] -= qty; s.stock[item] += qty;
    Ok(())
}

pub fn unstock_stall(c: &Config, mk: &mut Market, p: &mut Player, who: &str, lot: usize, item: usize, qty: u64) -> R<()> {
    need(p)?;
    let s = built_owner(mk, lot, who)?;
    check_trade(c, item, qty)?;
    if s.stock[item] < qty { return Err("MERCHANT_OUT_OF_STOCK"); }
    if cargo_used(c, p) + qty > vehicle_of(c, p).capacity { return Err("CARGO_FULL"); }
    s.stock[item] -= qty; p.items[item] += qty;
    Ok(())
}

pub fn fund_stall(mk: &mut Market, p: &mut Player, who: &str, lot: usize, cents: u64) -> R<()> {
    need(p)?;
    let s = built_owner(mk, lot, who)?;
    if cents == 0 { return Err("BAD_QTY"); }
    if p.coins < cents { return Err("NOT_ENOUGH_COINS"); }
    p.coins -= cents; s.cash += cents;
    Ok(())
}

pub fn collect_stall(mk: &mut Market, p: &mut Player, who: &str, lot: usize) -> R<u64> {
    need(p)?;
    let s = owner_only(mk, lot, who)?;
    let cash = s.cash; p.coins += cash; s.cash = 0;
    Ok(cash)
}

pub fn set_stall_spread(c: &Config, mk: &mut Market, p: &Player, who: &str, lot: usize, bps: u64) -> R<()> {
    need(p)?;
    let s = built_owner(mk, lot, who)?;
    if bps < c.stall_min_spread_bps || bps > c.stall_max_spread_bps { return Err("BAD_SPREAD"); }
    s.spread_bps = bps;
    Ok(())
}

/// Puts a stall up for sale. A price of 0 takes it off the market.
pub fn list_stall(mk: &mut Market, p: &Player, who: &str, lot: usize, price: u64) -> R<()> {
    need(p)?;
    built_owner(mk, lot, who)?.price = price;
    Ok(())
}

/// Buys a listed stall. Stock stays with the stall; its cash goes to the seller. Returns who to pay and how much.
pub fn buy_listed_stall(mk: &mut Market, p: &mut Player, who: &str, lot: usize) -> R<(String, u64)> {
    need(p)?;
    let s = mk.stalls.get_mut(lot).ok_or("BAD_LOT")?;
    let seller = match (&s.owner, s.price) { (Some(o), pr) if pr > 0 && s.built => o.clone(), _ => return Err("NOT_FOR_SALE") };
    if seller == who { return Err("YOUR_OWN_STALL"); }
    if p.coins < s.price { return Err("NOT_ENOUGH_COINS"); }
    let paid = s.price + s.cash;
    p.coins -= s.price; s.owner = Some(who.to_string()); s.price = 0; s.cash = 0;
    Ok((seller, paid))
}

pub fn city_buyback(c: &Config, lot: usize) -> u64 {
    c.lots[lot].needs.iter().enumerate().map(|(i, q)| q * c.items[i].base_price).sum::<u64>() * c.city_buyback_bps / 10000
}

/// Sells an empty stall to the city, paid in coins by the Foreman, and frees the location. Credits are not refunded.
pub fn sell_stall_to_city(c: &Config, mk: &mut Market, p: &mut Player, who: &str, lot: usize) -> R<u64> {
    need(p)?;
    let f = foreman(c);
    let s = owner_only(mk, lot, who)?;
    if s.stock.iter().any(|q| *q > 0) { return Err("STALL_NOT_EMPTY"); }
    let value = if s.built { city_buyback(c, lot) } else { 0 };
    let cash = s.cash;
    if mk.merchants[f].cash < value { return Err("MERCHANT_OUT_OF_CASH"); }
    mk.merchants[f].cash -= value;
    p.coins += value + cash;
    let s = &mut mk.stalls[lot];
    s.owner = None; s.built = false; s.cash = 0; s.price = 0;
    Ok(value)
}
