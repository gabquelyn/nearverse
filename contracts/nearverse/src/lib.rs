//! Nearverse game contract. State and init live here; see the sibling modules for each system.
use near_sdk::store::IterableMap;
use near_sdk::{env, near, AccountId, BorshStorageKey, PanicOnDefault};

pub mod bank;
pub mod engine;
pub mod market;
pub mod multi_token;
pub mod sinks;
pub mod world;

use engine::{Config, Market, Player};

#[near]
#[derive(BorshStorageKey)]
pub enum Key { Players }

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Nearverse {
    pub config: Config,
    pub market: Market,
    pub genesis_ms: u64,
    pub players: IterableMap<AccountId, Player>,
    /// Units of each item held by accounts. Merchant stock is market state, not tokens:
    /// selling to a merchant burns tokens and buying from one mints them.
    pub supply: Vec<u128>,
}

#[near(serializers = [json])]
pub struct LeaderRow { pub account_id: AccountId, pub net_worth: u64, pub sections_built: u64 }

#[near]
impl Nearverse {
    #[init]
    pub fn new(config: Config) -> Self {
        for m in &config.merchants {
            assert!(m.premium_bps < m.spread_bps, "premium must stay below spread");
            assert!([1, 2, 3, 4, 6, 8].contains(&m.k_quarters), "unsupported k_quarters");
            assert_eq!(m.targets.len(), config.items.len(), "targets must list every item");
        }
        let market = engine::new_market(&config);
        let supply = vec![0; config.items.len()];
        Self { config, market, genesis_ms: env::block_timestamp_ms(), players: IterableMap::new(Key::Players), supply }
    }

    // ---------- views: apply elapsed time to a copy, never saving it ----------
    pub fn get_market(&self) -> Market {
        let mut m = self.market.clone();
        engine::advance_to(&self.config, &mut m, env::block_timestamp_ms(), self.genesis_ms);
        m
    }
    pub fn get_config(&self) -> &Config { &self.config }
    pub fn get_genesis_ms(&self) -> u64 { self.genesis_ms }
    pub fn get_player(&self, account_id: AccountId) -> Option<Player> { self.players.get(&account_id).cloned() }

    /// Scans at most `limit` players from `from_index`. Testnet-sized by design.
    pub fn leaderboard(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<LeaderRow> {
        let mut rows: Vec<LeaderRow> = self.players.iter()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(100).min(200) as usize)
            .filter(|(_, p)| p.started)
            .map(|(a, p)| LeaderRow { account_id: a.clone(), net_worth: engine::net_worth(&self.config, p), sections_built: p.blueprints.iter().sum() })
            .collect();
        rows.sort_by(|a, b| b.net_worth.cmp(&a.net_worth));
        rows
    }

    /// Creates the player's record and grants starter coins and fuel. Callable once, with a session key.
    pub fn start_game(&mut self) {
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        ok(engine::start_game(&self.config, &mut p));
        let fuel = self.config.fuel_item as usize;
        let qty = self.config.start_fuel;
        self.mint(&id, &[(fuel, qty)], "starter fuel");
        self.players.insert(id, p);
    }
}

impl Nearverse {
    pub(crate) fn advance(&mut self) {
        engine::advance_to(&self.config, &mut self.market, env::block_timestamp_ms(), self.genesis_ms);
    }
    pub(crate) fn load(&self, id: &AccountId) -> Player {
        self.players.get(id).cloned().unwrap_or_else(|| engine::new_player(&self.config))
    }
}

/// Unwraps an engine result, turning the error code into a panic the client can read.
pub(crate) fn ok<T>(r: engine::R<T>) -> T {
    match r { Ok(v) => v, Err(code) => env::panic_str(code) }
}
