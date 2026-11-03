//! Gathering. The contract cannot verify driving; node stock, cooldown, fuel and wear are the on-chain limits.
use crate::{engine, ok, Nearverse, NearverseExt};
use near_sdk::{env, near};

#[near]
impl Nearverse {
    /// Gathers one batch and returns the quantity mined.
    pub fn gather(&mut self, node: u32) -> u64 {
        self.advance();
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        let g = ok(engine::gather(&self.config, &mut self.market, &mut p, node as usize, env::block_timestamp_ms()));
        let fuel = self.config.fuel_item as usize;
        self.burn(&id, &[(fuel, g.fuel_burned)], "trip fuel");
        self.mint(&id, &[(g.item, g.qty)], "gathered");
        if let Some((item, qty)) = g.reward { self.mint(&id, &[(item, qty)], "quest reward"); }
        self.players.insert(id, p);
        g.qty
    }
}
