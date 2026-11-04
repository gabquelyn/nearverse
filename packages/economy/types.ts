export interface Item { id: string; name: string; base_price: number }
export interface MerchantRules { id: string; name: string; personality: string; k_quarters: number; spread_bps: number; premium_bps: number; start_cash: number; cash_cap: number; stipend: number; reversion_bps: number; targets: number[]; x: number; z: number }
export interface EventRule { id: string; title: string; text: string; item: number; keep_bps: number }
export interface NodeRule { id: string; name: string; region: string; rich: number; item: number; yield_qty: number; max_stock: number; regrow: number; fuel_cost: number; wear: number; x: number; z: number }
export interface Section { needs: number[]; labor: number }
export interface Blueprint { id: string; name: string; sections: Section[] }
export interface Vehicle { id: string; name: string; blurb: string; capacity: number; endurance: number; fuel_bps: number; tank: number; flair: number; size: number; paint: string }
export interface Lot { id: string; name: string; x: number; z: number; price: number; needs: number[]; seeded: boolean; seed_merchant: number }
export interface Config {
  tick_ms: number; max_catchup_ticks: number; floor_bps: number; ceiling_bps: number;
  items: Item[]; merchants: MerchantRules[];
  adapt_every_ticks: number; adapt_band_bps: number; adapt_step_bps: number; adapt_min_bps: number; adapt_max_bps: number;
  blueprint_period_ticks: number; event_period_ticks: number; event_duration_ticks: number; events: EventRule[];
  nodes: NodeRule[]; start_coins: number; start_fuel: number; start_credits: number; credits_per_near: number; coins_per_fuel: number; coins_per_repair: number; rich_bonus_per_point: number; meters_per_fuel: number;
  gather_cooldown_ms: number; travel_ms: number; max_trade_qty: number; quest_period_ticks: number; quest_gathers: number; quest_reward_qty: number;
  blueprints: Blueprint[];
  vehicles: Vehicle[]; price_per_capacity: number; price_per_endurance: number; price_per_fuel_percent: number; price_per_flair: number; price_per_size: number;
  lots: Lot[]; stall_k_quarters: number; stall_target: number; stall_spread_bps: number; stall_min_spread_bps: number; stall_max_spread_bps: number; city_buyback_bps: number;
  closed_below_bps: number; investor_cut_bps: number; max_investors: number; seed_price: number; seed_stock: number; seed_cash: number;
}
export interface Investor { who: string; stake: number; earned: number }
export interface MerchantState { stock: number[]; target: number[]; cash: number; investors: Investor[] }
export interface StallState { owner: string | null; built: boolean; stock: number[]; cash: number; spread_bps: number; price: number }
export interface Market { tick: number; merchants: MerchantState[]; nodes: number[]; stalls: StallState[] }
export interface Player {
  started: boolean; coins: number; credits: number; fuel: number; items: number[]; durability: number;
  last_gather_ms: number; last_trade_ms: number; last_merchant: number | null;
  blueprints: number[]; quest_window: number; quest_progress: number;
  vehicle: number; owned_vehicles: boolean[];
}
