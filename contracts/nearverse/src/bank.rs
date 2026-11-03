//! Deposit and withdraw. Earnings stay in the game: withdrawals are capped at what was deposited.
use crate::{engine, ok, Nearverse, NearverseExt};
use near_sdk::json_types::U128;
use near_sdk::{assert_one_yocto, env, near, AccountId, Gas, NearToken, Promise};

const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;

#[near]
impl Nearverse {
    /// Attach NEAR to credit coins. Dust below one cent is refunded. Needs a full-access signature.
    #[payable]
    pub fn deposit(&mut self) -> u64 {
        let id = env::predecessor_account_id();
        let yocto_per_cent = ONE_NEAR / self.config.cents_per_near as u128;
        let attached = env::attached_deposit().as_yoctonear();
        let cents = attached / yocto_per_cent;
        if cents == 0 { env::panic_str("DEPOSIT_TOO_SMALL"); }
        let mut p = self.load(&id);
        ok(engine::deposit(&mut p, cents as u64));
        self.players.insert(id.clone(), p);
        let dust = attached - cents * yocto_per_cent;
        if dust > 0 { let _ = Promise::new(id).transfer(NearToken::from_yoctonear(dust)); }
        cents as u64
    }

    /// Returns deposited NEAR. Requires 1 yocto, which session keys cannot attach, so a stolen one can't call this.
    #[payable]
    pub fn withdraw(&mut self, cents: u64) -> Promise {
        assert_one_yocto();
        let id = env::predecessor_account_id();
        let mut p = self.load(&id);
        ok(engine::withdraw(&mut p, cents));
        self.players.insert(id.clone(), p);
        let yocto = cents as u128 * (ONE_NEAR / self.config.cents_per_near as u128);
        Promise::new(id.clone()).transfer(NearToken::from_yoctonear(yocto))
            .then(Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(10)).on_withdraw(id, cents))
    }

    /// Restores coins if the transfer failed.
    #[private]
    pub fn on_withdraw(&mut self, account_id: AccountId, cents: u64) -> bool {
        if env::promise_results_count() == 1 && env::promise_result_checked(0, 64).is_ok() { return true; }
        let mut p = self.load(&account_id);
        p.coins += cents; p.principal += cents;
        self.players.insert(account_id, p);
        false
    }

    pub fn withdrawable(&self, account_id: AccountId) -> U128 {
        U128(self.players.get(&account_id).map_or(0, |p| p.principal.min(p.coins) as u128))
    }
}
