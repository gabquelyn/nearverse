//! Credits. Players pay NEAR and get credits; the NEAR stays with the game as revenue.
//! Paying needs a full signature, because a session key cannot attach NEAR.
use crate::{engine, ok, Nearverse, NearverseExt};
use near_sdk::json_types::U128;
use near_sdk::{assert_one_yocto, env, near, Gas, NearToken, Promise};

const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;

#[near]
impl Nearverse {
    /// Attach NEAR to buy credits at the rate in the rules file. Anything below one credit is refunded.
    #[payable]
    pub fn buy_credits(&mut self) -> u64 {
        let id = env::predecessor_account_id();
        let yocto_per_credit = ONE_NEAR / self.config.credits_per_near as u128;
        let attached = env::attached_deposit().as_yoctonear();
        let credits = attached / yocto_per_credit;
        if credits == 0 { env::panic_str("DEPOSIT_TOO_SMALL"); }
        let mut p = self.load(&id);
        ok(engine::add_credits(&mut p, credits as u64));
        self.players.insert(id.clone(), p);
        let paid = credits * yocto_per_credit;
        self.revenue_yocto += paid;
        if attached > paid { let _ = Promise::new(id).transfer(NearToken::from_yoctonear(attached - paid)); }
        credits as u64
    }

    /// NEAR earned from credit sales and not yet withdrawn.
    pub fn revenue(&self) -> U128 { U128(self.revenue_yocto) }
    pub fn get_owner(&self) -> &near_sdk::AccountId { &self.owner_id }

    /// The game owner withdraws earned NEAR. Player-to-earn withdrawals for stall owners are a future plan.
    #[payable]
    pub fn withdraw_revenue(&mut self, amount: U128) -> Promise {
        assert_one_yocto();
        if env::predecessor_account_id() != self.owner_id { env::panic_str("NOT_OWNER"); }
        if amount.0 == 0 || amount.0 > self.revenue_yocto { env::panic_str("OVER_REVENUE"); }
        self.revenue_yocto -= amount.0;
        Promise::new(self.owner_id.clone()).transfer(NearToken::from_yoctonear(amount.0))
            .then(Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(10)).on_withdraw_revenue(amount))
    }

    /// Restores the balance if the transfer failed.
    #[private]
    pub fn on_withdraw_revenue(&mut self, amount: U128) -> bool {
        if env::promise_results_count() == 1 && env::promise_result_checked(0, 64).is_ok() { return true; }
        self.revenue_yocto += amount.0;
        false
    }
}
