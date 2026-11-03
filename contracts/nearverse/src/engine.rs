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
    pub stipend: u64, pub reversion_bps: u64, pub targets: Vec<u64>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct EventRule { pub id: String, pub title: String, pub text: String, pub item: u32, pub keep_bps: u64 }

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct NodeRule {
    pub id: String, pub item: u32, pub yield_qty: u64, pub max_stock: u64, pub regrow: u64,
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
pub struct Config {
    pub tick_ms: u64, pub max_catchup_ticks: u64, pub floor_bps: u64, pub ceiling_bps: u64,
    pub items: Vec<Item>, pub merchants: Vec<MerchantRules>,
    pub adapt_every_ticks: u64, pub adapt_band_bps: u64, pub adapt_step_bps: u64, pub adapt_min_bps: u64, pub adapt_max_bps: u64,
    pub blueprint_period_ticks: u64, pub event_period_ticks: u64, pub event_duration_ticks: u64, pub events: Vec<EventRule>,
    pub nodes: Vec<NodeRule>, pub start_coins: u64, pub start_fuel: u64, pub max_durability: u64, pub cargo_capacity: u64,
    pub gather_cooldown_ms: u64, pub travel_ms: u64, pub max_trade_qty: u64, pub repair_points_per_iron: u64,
    pub repair_cents_per_point: u64, pub cents_per_near: u64, pub quest_period_ticks: u64, pub quest_gathers: u64, pub quest_reward_qty: u64,
    pub blueprints: Vec<Blueprint>, pub fuel_item: u32, pub iron_item: u32,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct MerchantState { pub stock: Vec<u64>, pub target: Vec<u64>, pub cash: u64 }

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Market { pub tick: u64, pub merchants: Vec<MerchantState>, pub nodes: Vec<u64> }

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Player {
    pub started: bool, pub coins: u64, pub principal: u64, pub items: Vec<u64>, pub durability: u64,
    pub last_gather_ms: u64, pub last_trade_ms: u64, pub last_merchant: Option<u32>,
    pub blueprints: Vec<u64>, pub quest_window: u64, pub quest_progress: u64,
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
        started: false, coins: 0, principal: 0, items: vec![0; c.items.len()], durability: 0,
        last_gather_ms: 0, last_trade_ms: 0, last_merchant: None,
        blueprints: vec![0; c.blueprints.len()], quest_window: 0, quest_progress: 0,
    }
}

pub fn start_game(c: &Config, p: &mut Player) -> R<()> {
    if p.started { return Err("ALREADY_STARTED"); }
    p.started = true;
    p.coins += c.start_coins;
    p.items[c.fuel_item as usize] += c.start_fuel;
    p.durability = c.max_durability;
    Ok(())
}

fn need(p: &Player) -> R<()> { if p.started { Ok(()) } else { Err("NOT_STARTED") } }

pub fn cargo_used(c: &Config, p: &Player) -> u64 {
    p.items.iter().enumerate().filter(|(i, _)| *i != c.fuel_item as usize).map(|(_, q)| *q).sum()
}

/// Returns (item minted, qty minted, optional quest reward (item, qty), fuel burned).
pub struct Gathered { pub item: usize, pub qty: u64, pub reward: Option<(usize, u64)>, pub fuel_burned: u64 }

pub fn gather(c: &Config, mk: &mut Market, p: &mut Player, node: usize, now: u64) -> R<Gathered> {
    need(p)?;
    let n = c.nodes.get(node).ok_or("BAD_NODE")?;
    let fuel = c.fuel_item as usize;
    if now < p.last_gather_ms + c.gather_cooldown_ms { return Err("COOLDOWN"); }
    if p.durability <= n.wear { return Err("TRUCK_DAMAGED"); }
    if p.items[fuel] < n.fuel_cost { return Err("OUT_OF_FUEL"); }
    let qty = n.yield_qty.min(mk.nodes[node]);
    if qty == 0 { return Err("NODE_EMPTY"); }
    if n.item != c.fuel_item && cargo_used(c, p) + qty > c.cargo_capacity { return Err("CARGO_FULL"); }
    p.items[fuel] -= n.fuel_cost;
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
    Ok(Gathered { item: n.item as usize, qty, reward, fuel_burned: n.fuel_cost })
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
    if item != c.fuel_item as usize && cargo_used(c, p) + qty > c.cargo_capacity { return Err("CARGO_FULL"); }
    let (mut total, mut stock) = (0u64, s.stock[item]);
    for _ in 0..qty { total += ask_at(c, merchant, item, s.target[item], stock); stock -= 1; }
    if total > max_total { return Err("PRICE_MOVED"); }
    if p.coins < total { return Err("NOT_ENOUGH_COINS"); }
    s.stock[item] = stock; s.cash += total; p.coins -= total; p.items[item] += qty;
    p.last_trade_ms = now; p.last_merchant = Some(merchant as u32);
    Ok(total)
}

fn foreman(c: &Config) -> usize { c.merchants.iter().position(|m| m.premium_bps > 0).expect("no foreman") }

pub fn repair(c: &Config, mk: &mut Market, p: &mut Player) -> R<u64> {
    need(p)?;
    let missing = c.max_durability - p.durability;
    if missing == 0 { return Err("NOTHING_TO_REPAIR"); }
    let iron = missing.div_ceil(c.repair_points_per_iron);
    let coins = missing * c.repair_cents_per_point;
    let idx = c.iron_item as usize;
    if p.items[idx] < iron { return Err("NOT_ENOUGH_ITEMS"); }
    if p.coins < coins { return Err("NOT_ENOUGH_COINS"); }
    p.items[idx] -= iron; p.coins -= coins;
    mk.merchants[foreman(c)].cash += coins;
    p.durability = c.max_durability;
    Ok(iron)
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

pub fn deposit(p: &mut Player, cents: u64) -> R<()> { need(p)?; p.coins += cents; p.principal += cents; Ok(()) }

pub fn withdraw(p: &mut Player, cents: u64) -> R<()> {
    need(p)?;
    if cents == 0 || cents > p.principal { return Err("OVER_DEPOSIT_CAP"); }
    if cents > p.coins { return Err("NOT_ENOUGH_COINS"); }
    p.coins -= cents; p.principal -= cents;
    Ok(())
}

pub fn net_worth(c: &Config, p: &Player) -> u64 {
    p.coins + p.items.iter().enumerate().map(|(i, q)| q * c.items[i].base_price).sum::<u64>()
}
