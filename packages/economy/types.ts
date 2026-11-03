export interface Item { id: string; name: string; base_price: number }
export interface MerchantRules { id: string; name: string; personality: string; k_quarters: number; spread_bps: number; premium_bps: number; start_cash: number; cash_cap: number; stipend: number; reversion_bps: number; targets: number[] }
export interface EventRule { id: string; title: string; text: string; item: number; keep_bps: number }
export interface NodeRule { id: string; item: number; yield_qty: number; max_stock: number; regrow: number; fuel_cost: number; wear: number; x: number; z: number }
export interface Section { needs: number[]; labor: number }
export interface Blueprint { id: string; name: string; sections: Section[] }
export interface Config {
  tick_ms: number; max_catchup_ticks: number; floor_bps: number; ceiling_bps: number;
  items: Item[]; merchants: MerchantRules[];
  adapt_every_ticks: number; adapt_band_bps: number; adapt_step_bps: number; adapt_min_bps: number; adapt_max_bps: number;
  blueprint_period_ticks: number; event_period_ticks: number; event_duration_ticks: number; events: EventRule[];
  nodes: NodeRule[]; start_coins: number; start_fuel: number; max_durability: number; cargo_capacity: number;
  gather_cooldown_ms: number; travel_ms: number; max_trade_qty: number; repair_points_per_iron: number;
  repair_cents_per_point: number; cents_per_near: number; quest_period_ticks: number; quest_gathers: number; quest_reward_qty: number;
  blueprints: Blueprint[]; fuel_item: number; iron_item: number;
}
export interface MerchantState { stock: number[]; target: number[]; cash: number }
export interface Market { tick: number; merchants: MerchantState[]; nodes: number[] }
export interface Player {
  started: boolean; coins: number; principal: number; items: number[]; durability: number;
  last_gather_ms: number; last_trade_ms: number; last_merchant: number | null;
  blueprints: number[]; quest_window: number; quest_progress: number;
}
