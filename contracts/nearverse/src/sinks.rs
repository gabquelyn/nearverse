//! Spending that isn't trade: repairs and fuel cost coins, or credits if coins run short; building uses materials and coins.
use crate::{engine, ok, Nearverse, NearverseExt};
use near_sdk::{env, near};

#[near]
impl Nearverse {
    pub fn repair(&mut self) {
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        ok(engine::repair(&self.config, &mut p));
        self.players.insert(id, p);
    }
    pub fn refuel(&mut self, units: u64) {
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        ok(engine::refuel(&self.config, &mut p, units));
        self.players.insert(id, p);
    }
    pub fn burn_fuel(&mut self, units: u64) {
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        ok(engine::burn_fuel(&self.config, &mut p, units));
        self.players.insert(id, p);
    }
    pub fn take_damage(&mut self, points: u64) {
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        ok(engine::take_damage(&self.config, &mut p, points));
        self.players.insert(id, p);
    }
    pub fn build_section(&mut self, blueprint: u32) -> u64 {
        self.advance();
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        let used = ok(engine::build_section(&self.config, &mut self.market, &mut p, blueprint as usize));
        let list: Vec<(usize, u64)> = used.into_iter().enumerate().collect();
        self.burn(&id, &list, "built");
        let done = p.blueprints[blueprint as usize];
        self.players.insert(id, p);
        done
    }
}
