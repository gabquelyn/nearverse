//! Repairs and building. Materials burn here, and coin fees return to the Foreman so cash keeps circulating.
use crate::{engine, ok, Nearverse, NearverseExt};
use near_sdk::{env, near};

#[near]
impl Nearverse {
    pub fn repair(&mut self) {
        self.advance();
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        let iron = ok(engine::repair(&self.config, &mut self.market, &mut p));
        let item = self.config.iron_item as usize;
        self.burn(&id, &[(item, iron)], "repair");
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
