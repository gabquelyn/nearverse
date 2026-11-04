//! Trading with merchants. The contract computes prices itself and never trusts a browser number.
use crate::{engine, ok, Nearverse, NearverseExt};
use near_sdk::{env, near};

#[near(serializers = [json])]
pub struct Quote { pub bid: u64, pub ask: u64, pub stock: u64, pub target: u64, pub cash: u64 }

#[near]
impl Nearverse {
    /// Sell qty units; fails with PRICE_MOVED if the total would be under min_total.
    pub fn sell(&mut self, merchant: u32, item: u32, qty: u64, min_total: u64) -> u64 {
        self.advance();
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        let total = ok(engine::sell(&self.config, &mut self.market, &mut p, merchant as usize, item as usize, qty, min_total, env::block_timestamp_ms()));
        self.burn(&id, &[(item as usize, qty)], "sold to merchant");
        self.players.insert(id, p);
        total
    }
    /// Puts coins into a merchant for good, for a share of what it sells. Reopens a closed shop.
    pub fn merchant_invest(&mut self, merchant: u32, cents: u64) {
        self.advance();
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        ok(engine::invest_in_merchant(&self.config, &mut self.market, &mut p, id.as_str(), merchant as usize, cents));
        self.players.insert(id, p);
    }
    /// Pays out this player's share of a merchant's sales so far.
    pub fn merchant_collect(&mut self, merchant: u32) -> u64 {
        self.advance();
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        let earned = ok(engine::collect_from_merchant(&mut self.market, &mut p, id.as_str(), merchant as usize));
        self.players.insert(id, p);
        earned
    }
    /// Buy qty units; fails with PRICE_MOVED if the total would be over max_total.
    pub fn buy(&mut self, merchant: u32, item: u32, qty: u64, max_total: u64) -> u64 {
        self.advance();
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        let total = ok(engine::buy(&self.config, &mut self.market, &mut p, merchant as usize, item as usize, qty, max_total, env::block_timestamp_ms()));
        self.mint(&id, &[(item as usize, qty)], "bought from merchant");
        self.players.insert(id, p);
        total
    }
    pub fn quote(&self, merchant: u32, item: u32) -> Quote {
        let mk = self.get_market();
        let (m, i) = (merchant as usize, item as usize);
        let s = &mk.merchants[m];
        Quote {
            bid: engine::bid_at(&self.config, m, i, mk.tick, s.target[i], s.stock[i]),
            ask: engine::ask_at(&self.config, m, i, s.target[i], s.stock[i]),
            stock: s.stock[i], target: s.target[i], cash: s.cash,
        }
    }
}
