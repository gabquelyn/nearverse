//! Player-owned stalls: a location bought with credits, built from materials, stocked and funded by the owner,
//! traded with by other players, and sold to another player or back to the city.
//! As with merchants, stall stock is market state: moving items into a stall burns tokens and out of one mints them.
use crate::{engine, ok, Nearverse, NearverseExt};
use near_sdk::{env, near, AccountId};

#[near]
impl Nearverse {
    /// Buys a location with credits.
    pub fn claim_lot(&mut self, lot: u32) {
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        ok(engine::claim_lot(&self.config, &mut self.market, &mut p, id.as_str(), lot as usize));
        self.players.insert(id, p);
    }
    /// Builds on a location you own. Bought or found materials both count.
    pub fn build_stall(&mut self, lot: u32) {
        self.advance();
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        let used = ok(engine::build_stall(&self.config, &mut self.market, &mut p, id.as_str(), lot as usize));
        let list: Vec<(usize, u64)> = used.into_iter().enumerate().collect();
        self.burn(&id, &list, "built a stall");
        self.players.insert(id, p);
    }
    pub fn stall_sell(&mut self, lot: u32, item: u32, qty: u64, min_total: u64) -> u64 {
        self.advance();
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        let total = ok(engine::sell_to_stall(&self.config, &mut self.market, &mut p, id.as_str(), lot as usize, item as usize, qty, min_total, env::block_timestamp_ms()));
        self.burn(&id, &[(item as usize, qty)], "sold to a stall");
        self.players.insert(id, p);
        total
    }
    pub fn stall_buy(&mut self, lot: u32, item: u32, qty: u64, max_total: u64) -> u64 {
        self.advance();
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        let total = ok(engine::buy_from_stall(&self.config, &mut self.market, &mut p, id.as_str(), lot as usize, item as usize, qty, max_total, env::block_timestamp_ms()));
        self.mint(&id, &[(item as usize, qty)], "bought from a stall");
        self.players.insert(id, p);
        total
    }
    pub fn stall_stock(&mut self, lot: u32, item: u32, qty: u64) {
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        ok(engine::stock_stall(&self.config, &mut self.market, &mut p, id.as_str(), lot as usize, item as usize, qty));
        self.burn(&id, &[(item as usize, qty)], "stocked a stall");
        self.players.insert(id, p);
    }
    pub fn stall_unstock(&mut self, lot: u32, item: u32, qty: u64) {
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        ok(engine::unstock_stall(&self.config, &mut self.market, &mut p, id.as_str(), lot as usize, item as usize, qty));
        self.mint(&id, &[(item as usize, qty)], "took from a stall");
        self.players.insert(id, p);
    }
    pub fn stall_fund(&mut self, lot: u32, cents: u64) {
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        ok(engine::fund_stall(&mut self.market, &mut p, id.as_str(), lot as usize, cents));
        self.players.insert(id, p);
    }
    pub fn stall_collect(&mut self, lot: u32) -> u64 {
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        let cash = ok(engine::collect_stall(&mut self.market, &mut p, id.as_str(), lot as usize));
        self.players.insert(id, p);
        cash
    }
    pub fn stall_spread(&mut self, lot: u32, bps: u64) {
        let id = env::predecessor_account_id();
        let p = self.load(&id);
        ok(engine::set_stall_spread(&self.config, &mut self.market, &p, id.as_str(), lot as usize, bps));
    }
    /// A price of 0 takes the stall off the market.
    pub fn stall_list(&mut self, lot: u32, price: u64) {
        let id = env::predecessor_account_id();
        let p = self.load(&id);
        ok(engine::list_stall(&mut self.market, &p, id.as_str(), lot as usize, price));
    }
    pub fn stall_buy_listed(&mut self, lot: u32) {
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        let (seller, paid) = ok(engine::buy_listed_stall(&mut self.market, &mut p, id.as_str(), lot as usize));
        self.players.insert(id, p);
        let seller: AccountId = seller.parse().unwrap_or_else(|_| env::panic_str("BAD_SELLER"));
        let mut s = self.load(&seller);
        s.coins += paid;
        self.players.insert(seller, s);
    }
    pub fn stall_sell_to_city(&mut self, lot: u32) -> u64 {
        self.advance();
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        let value = ok(engine::sell_stall_to_city(&self.config, &mut self.market, &mut p, id.as_str(), lot as usize));
        self.players.insert(id, p);
        value
    }
}
