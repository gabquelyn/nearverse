//! Vehicles. Prices come from each vehicle's stats, computed here from the rules file.
use crate::{engine, ok, Nearverse, NearverseExt};
use near_sdk::{env, near};

#[near]
impl Nearverse {
    pub fn vehicle_price(&self, vehicle: u32) -> u64 { engine::vehicle_price(&self.config, vehicle as usize) }

    pub fn buy_vehicle(&mut self, vehicle: u32) -> u64 {
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        let price = ok(engine::buy_vehicle(&self.config, &mut p, vehicle as usize));
        self.players.insert(id, p);
        price
    }

    pub fn select_vehicle(&mut self, vehicle: u32) {
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        ok(engine::select_vehicle(&self.config, &mut p, vehicle as usize));
        self.players.insert(id, p);
    }
}
