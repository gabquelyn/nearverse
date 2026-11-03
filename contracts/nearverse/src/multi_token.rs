//! NEP-245 core: every item type lives in this one contract. near-contract-standards 5.30 has no
//! multi-token module, so the standard's methods are implemented here. Approvals are not implemented.
use crate::{Nearverse, NearverseExt};
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{assert_one_yocto, env, ext_contract, near, AccountId, Gas, NearToken, Promise, PromiseOrValue};

const GAS_ON_TRANSFER: Gas = Gas::from_tgas(50);
const GAS_RESOLVE: Gas = Gas::from_tgas(20);
const MAX_CALLBACK_RESULT: usize = 4096;

#[near(serializers = [json])]
pub struct Token { pub token_id: String, pub owner_id: Option<AccountId> }

#[ext_contract(ext_receiver)]
pub trait MtReceiver {
    fn mt_on_transfer(&mut self, sender_id: AccountId, previous_owner_ids: Vec<AccountId>, token_ids: Vec<String>, amounts: Vec<U128>, msg: String) -> PromiseOrValue<Vec<U128>>;
}

#[near]
impl Nearverse {
    // ---------- change methods. All need 1 yocto, so session keys cannot move tokens. ----------
    #[payable]
    pub fn mt_transfer(&mut self, receiver_id: AccountId, token_id: String, amount: U128, approval: Option<(AccountId, u64)>, memo: Option<String>) {
        assert_one_yocto();
        no_approval(approval.is_some());
        let sender = env::predecessor_account_id();
        self.move_tokens(&sender, &receiver_id, &[token_id], &[amount], memo);
    }

    #[payable]
    pub fn mt_batch_transfer(&mut self, receiver_id: AccountId, token_ids: Vec<String>, amounts: Vec<U128>, approvals: Option<Vec<Option<(AccountId, u64)>>>, memo: Option<String>) {
        assert_one_yocto();
        no_approval(approvals.is_some_and(|a| a.iter().any(|x| x.is_some())));
        let sender = env::predecessor_account_id();
        self.move_tokens(&sender, &receiver_id, &token_ids, &amounts, memo);
    }

    #[payable]
    pub fn mt_transfer_call(&mut self, receiver_id: AccountId, token_id: String, amount: U128, approval: Option<(AccountId, u64)>, memo: Option<String>, msg: String) -> Promise {
        assert_one_yocto();
        no_approval(approval.is_some());
        self.transfer_call(receiver_id, vec![token_id], vec![amount], memo, msg)
    }

    #[payable]
    pub fn mt_batch_transfer_call(&mut self, receiver_id: AccountId, token_ids: Vec<String>, amounts: Vec<U128>, approvals: Option<Vec<Option<(AccountId, u64)>>>, memo: Option<String>, msg: String) -> Promise {
        assert_one_yocto();
        no_approval(approvals.is_some_and(|a| a.iter().any(|x| x.is_some())));
        self.transfer_call(receiver_id, token_ids, amounts, memo, msg)
    }

    /// Refunds whatever the receiver reports as unused, or everything if its call failed.
    #[private]
    pub fn mt_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, token_ids: Vec<String>, amounts: Vec<U128>) -> Vec<U128> {
        let unused: Vec<U128> = env::promise_result_checked(0, MAX_CALLBACK_RESULT).ok()
            .and_then(|v| near_sdk::serde_json::from_slice::<Vec<U128>>(&v).ok())
            .filter(|u| u.len() == amounts.len())
            .unwrap_or_else(|| amounts.clone());
        let mut used = Vec::with_capacity(amounts.len());
        let mut back_ids = vec![];
        let mut back_amounts = vec![];
        for (i, a) in amounts.iter().enumerate() {
            let item = self.item_index(&token_ids[i]);
            let held = self.load(&receiver_id).items[item] as u128;
            let refund = unused[i].0.min(a.0).min(held);
            used.push(U128(a.0 - refund));
            if refund > 0 { back_ids.push(token_ids[i].clone()); back_amounts.push(U128(refund)); }
        }
        if !back_ids.is_empty() { self.move_tokens(&receiver_id, &sender_id, &back_ids, &back_amounts, Some("refund".into())); }
        used
    }

    // ---------- views ----------
    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<Token>> {
        token_ids.into_iter().map(|t| self.find_item(&t).map(|_| Token { token_id: t, owner_id: None })).collect()
    }
    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        let item = self.item_index(&token_id);
        U128(self.players.get(&account_id).map_or(0, |p| p.items[item] as u128))
    }
    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids.into_iter().map(|t| self.mt_balance_of(account_id.clone(), t)).collect()
    }
    pub fn mt_supply(&self, token_id: String) -> Option<U128> { self.find_item(&token_id).map(|i| U128(self.supply[i])) }
    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        token_ids.into_iter().map(|t| self.mt_supply(t)).collect()
    }
    /// Enumeration extension.
    pub fn mt_tokens(&self, from_index: Option<U128>, limit: Option<u32>) -> Vec<Token> {
        self.config.items.iter().skip(from_index.map_or(0, |f| f.0 as usize)).take(limit.unwrap_or(u32::MAX) as usize)
            .map(|i| Token { token_id: i.id.clone(), owner_id: None }).collect()
    }
    pub fn mt_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u32>) -> Vec<Token> {
        let Some(p) = self.players.get(&account_id) else { return vec![] };
        self.config.items.iter().enumerate().filter(|(i, _)| p.items[*i] > 0)
            .skip(from_index.map_or(0, |f| f.0 as usize)).take(limit.unwrap_or(u32::MAX) as usize)
            .map(|(_, i)| Token { token_id: i.id.clone(), owner_id: Some(account_id.clone()) }).collect()
    }
}

fn no_approval(present: bool) {
    if present { env::panic_str("APPROVALS_NOT_SUPPORTED"); }
}

impl Nearverse {
    fn find_item(&self, id: &str) -> Option<usize> { self.config.items.iter().position(|i| i.id == id) }
    pub(crate) fn item_index(&self, id: &str) -> usize { self.find_item(id).unwrap_or_else(|| env::panic_str("BAD_ITEM")) }
    pub(crate) fn token_id(&self, item: usize) -> String { self.config.items[item].id.clone() }

    fn move_tokens(&mut self, from: &AccountId, to: &AccountId, ids: &[String], amounts: &[U128], memo: Option<String>) {
        if ids.len() != amounts.len() { env::panic_str("LENGTH_MISMATCH"); }
        if ids.is_empty() { env::panic_str("BAD_QTY"); }
        if from == to { env::panic_str("SELF_TRANSFER"); }
        let mut a = self.load(from);
        let mut b = self.load(to);
        for (id, amt) in ids.iter().zip(amounts) {
            let i = self.item_index(id);
            let q = u64::try_from(amt.0).unwrap_or_else(|_| env::panic_str("BAD_QTY"));
            if q == 0 { env::panic_str("BAD_QTY"); }
            if a.items[i] < q { env::panic_str("NOT_ENOUGH_ITEMS"); }
            a.items[i] -= q;
            b.items[i] += q;
        }
        self.players.insert(from.clone(), a);
        self.players.insert(to.clone(), b);
        emit("mt_transfer", json!({ "old_owner_id": from, "new_owner_id": to, "token_ids": ids, "amounts": amounts, "memo": memo }));
    }

    fn transfer_call(&mut self, receiver: AccountId, ids: Vec<String>, amounts: Vec<U128>, memo: Option<String>, msg: String) -> Promise {
        let sender = env::predecessor_account_id();
        self.move_tokens(&sender, &receiver, &ids, &amounts, memo);
        ext_receiver::ext(receiver.clone()).with_static_gas(GAS_ON_TRANSFER).with_attached_deposit(NearToken::from_yoctonear(0))
            .mt_on_transfer(sender.clone(), vec![sender.clone(); ids.len()], ids.clone(), amounts.clone(), msg)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_RESOLVE).mt_resolve_transfer(sender, receiver, ids, amounts))
    }

    pub(crate) fn mint(&mut self, owner: &AccountId, list: &[(usize, u64)], memo: &str) {
        let list: Vec<_> = list.iter().filter(|(_, q)| *q > 0).copied().collect();
        if list.is_empty() { return; }
        for (i, q) in &list { self.supply[*i] += *q as u128; }
        emit("mt_mint", json!({ "owner_id": owner, "token_ids": list.iter().map(|(i, _)| self.token_id(*i)).collect::<Vec<_>>(), "amounts": list.iter().map(|(_, q)| q.to_string()).collect::<Vec<_>>(), "memo": memo }));
    }
    pub(crate) fn burn(&mut self, owner: &AccountId, list: &[(usize, u64)], memo: &str) {
        let list: Vec<_> = list.iter().filter(|(_, q)| *q > 0).copied().collect();
        if list.is_empty() { return; }
        for (i, q) in &list { self.supply[*i] -= *q as u128; }
        emit("mt_burn", json!({ "owner_id": owner, "token_ids": list.iter().map(|(i, _)| self.token_id(*i)).collect::<Vec<_>>(), "amounts": list.iter().map(|(_, q)| q.to_string()).collect::<Vec<_>>(), "memo": memo }));
    }
}

fn emit(event: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!("EVENT_JSON:{}", json!({ "standard": "nep245", "version": "1.0.0", "event": event, "data": [data] })));
}

