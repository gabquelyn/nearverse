//! Runs the contract in near-sdk's mocked runtime. Covers NEP-245 and bank behavior.
use near_sdk::json_types::U128;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{serde_json, testing_env, AccountId, NearToken};
use nearverse::engine::Config;
use nearverse::Nearverse;

fn cfg() -> Config { serde_json::from_str(include_str!("../../../packages/economy/generated/rules.json")).unwrap() }
fn acc(s: &str) -> AccountId { s.parse().unwrap() }
fn ctx(who: &str, ms: u64, yocto: u128) {
    testing_env!(VMContextBuilder::new().current_account_id(acc("game.testnet")).predecessor_account_id(acc(who)).signer_account_id(acc(who))
        .block_timestamp(ms * 1_000_000).attached_deposit(NearToken::from_yoctonear(yocto)).account_balance(NearToken::from_near(100)).build());
}
const ONE: u128 = 10u128.pow(24);
fn game() -> Nearverse { ctx("game.testnet", 0, 0); Nearverse::new(cfg()) }

#[test]
fn gather_mints_nep245_and_sale_burns() {
    let mut g = game();
    ctx("a.testnet", 10_000, 0); g.start_game();
    let got = g.gather(0);
    assert_eq!(got, 3);
    assert!(get_logs().iter().any(|l| l.contains("\"standard\":\"nep245\"") && l.contains("mt_mint") && l.contains("wood")));
    assert_eq!(g.mt_balance_of(acc("a.testnet"), "wood".into()), U128(3));
    assert_eq!(g.mt_supply("wood".into()), Some(U128(3)));
    let coins = g.get_player(acc("a.testnet")).unwrap().coins;
    let paid = g.sell(0, 0, 3, 0);
    assert!(get_logs().iter().any(|l| l.contains("mt_burn")));
    assert_eq!(g.get_player(acc("a.testnet")).unwrap().coins, coins + paid);
    assert_eq!(g.mt_supply("wood".into()), Some(U128(0)));
}

#[test]
fn one_contract_holds_every_item() {
    let g = game();
    let t = g.mt_tokens(None, None);
    assert_eq!(t.iter().map(|x| x.token_id.as_str()).collect::<Vec<_>>(), ["wood", "iron", "slate", "clay", "fuel"]);
}

#[test]
fn transfer_needs_one_yocto_and_moves_balance() {
    let mut g = game();
    ctx("a.testnet", 10_000, 0); g.start_game(); g.gather(0);
    ctx("a.testnet", 10_000, 1); g.mt_transfer(acc("b.testnet"), "wood".into(), U128(2), None, None);
    assert_eq!(g.mt_batch_balance_of(acc("b.testnet"), vec!["wood".into()]), vec![U128(2)]);
    assert!(get_logs()[0].contains("mt_transfer"));
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn session_key_cannot_transfer() {
    let mut g = game();
    ctx("a.testnet", 10_000, 0); g.start_game(); g.gather(0);
    g.mt_transfer(acc("b.testnet"), "wood".into(), U128(1), None, None);
}

#[test]
fn deposit_credits_and_earnings_cannot_leave() {
    let mut g = game();
    ctx("a.testnet", 1, 0); g.start_game();
    ctx("a.testnet", 1, ONE); assert_eq!(g.deposit(), 100_000);
    assert_eq!(g.withdrawable(acc("a.testnet")), U128(100_000));
    ctx("a.testnet", 1, 1); let _ = g.withdraw(40_000);
    assert_eq!(g.withdrawable(acc("a.testnet")), U128(60_000));
}

#[test]
#[should_panic(expected = "OVER_DEPOSIT_CAP")]
fn starter_coins_cannot_be_withdrawn() {
    let mut g = game();
    ctx("a.testnet", 1, 0); g.start_game();
    ctx("a.testnet", 1, 1); let _ = g.withdraw(1);
}

#[test]
fn market_advances_lazily_and_views_do_not_save() {
    let mut g = game();
    let tick_ms = g.get_config().tick_ms;
    ctx("a.testnet", tick_ms * 5 + 1, 0);
    assert_eq!(g.get_market().tick, 5);
    assert_eq!(g.market.tick, 0);
    g.start_game(); g.gather(0);
    assert_eq!(g.market.tick, 5);
}

#[test]
fn a_long_absence_catches_up_in_bounded_steps() {
    let mut g = game();
    let c = g.get_config().clone();
    ctx("a.testnet", c.tick_ms * 1000, 0); g.start_game(); g.gather(0);
    assert_eq!(g.market.tick, c.max_catchup_ticks);
}

#[test]
fn leaderboard_ranks_players() {
    let mut g = game();
    ctx("a.testnet", 1, 0); g.start_game();
    ctx("b.testnet", 1, 0); g.start_game();
    ctx("b.testnet", 10_000, 0); g.gather(0);
    let r = g.leaderboard(None, None);
    assert_eq!(r.len(), 2);
    assert_eq!(r[0].account_id, acc("b.testnet"));
}
