//! Replays fixtures produced by the TypeScript engine against the Rust engine.
use near_sdk::serde_json::{self, Value};
use nearverse::engine::*;

const WHO: &str = "me.testnet";

fn cfg() -> Config { serde_json::from_str(include_str!("../../../packages/economy/generated/rules.json")).unwrap() }

#[test]
fn price_vectors_match() {
    let c = cfg();
    let v: Vec<Value> = serde_json::from_str(include_str!("../../../packages/economy/fixtures/price-vectors.json")).unwrap();
    assert!(v.len() >= 400);
    for x in v {
        let (m, i, t, tg, s) = (x["merchant"].as_u64().unwrap() as usize, x["item"].as_u64().unwrap() as usize, x["tick"].as_u64().unwrap(), x["target"].as_u64().unwrap(), x["stock"].as_u64().unwrap());
        assert_eq!(bid_at(&c, m, i, t, tg, s), x["bid"].as_u64().unwrap(), "bid {x}");
        assert_eq!(ask_at(&c, m, i, tg, s), x["ask"].as_u64().unwrap(), "ask {x}");
    }
}

#[test]
fn full_trace_matches_step_by_step() {
    let c = cfg();
    let trace: Vec<Value> = serde_json::from_str(include_str!("../../../packages/economy/fixtures/trace.json")).unwrap();
    let mut mk = new_market(&c);
    let mut p = new_player(&c);
    start_game(&c, &mut p).unwrap();
    p.coins += 400000;
    p.credits += 6000;
    let (mut oks, mut errs) = (0, 0);
    for (n, step) in trace.iter().enumerate() {
        let op = &step["op"];
        let now = step["now"].as_u64().unwrap();
        let u = |k: &str| op[k].as_u64().unwrap();
        let err: Option<&str> = match op["t"].as_str().unwrap() {
            "gather" => gather(&c, &mut mk, &mut p, u("node") as usize, now).err(),
            "sell" => sell(&c, &mut mk, &mut p, u("merchant") as usize, u("item") as usize, u("qty"), u("limit"), now).err(),
            "buy" => buy(&c, &mut mk, &mut p, u("merchant") as usize, u("item") as usize, u("qty"), u("limit"), now).err(),
            "repair" => repair(&c, &mut p).err(),
            "refuel" => refuel(&c, &mut p, u("units")).err(),
            "burn" => burn_fuel(&c, &mut p, u("units")).err(),
            "add_credits" => add_credits(&mut p, u("credits")).err(),
            "claim_lot" => claim_lot(&c, &mut mk, &mut p, WHO, u("lot") as usize).err(),
            "build" => build_section(&c, &mut mk, &mut p, u("blueprint") as usize).err(),
            "damage" => take_damage(&c, &mut p, u("points")).err(),
            "buy_vehicle" => buy_vehicle(&c, &mut p, u("v") as usize).err(),
            "select_vehicle" => select_vehicle(&c, &mut p, u("v") as usize).err(),
            "build_stall" => build_stall(&c, &mut mk, &mut p, WHO, u("lot") as usize).err(),
            "stall_sell" => sell_to_stall(&c, &mut mk, &mut p, WHO, u("lot") as usize, u("item") as usize, u("qty"), 0, now).err(),
            "stall_buy" => buy_from_stall(&c, &mut mk, &mut p, WHO, u("lot") as usize, u("item") as usize, u("qty"), 1_000_000_000, now).err(),
            "stall_stock" => stock_stall(&c, &mut mk, &mut p, WHO, u("lot") as usize, u("item") as usize, u("qty")).err(),
            "stall_unstock" => unstock_stall(&c, &mut mk, &mut p, WHO, u("lot") as usize, u("item") as usize, u("qty")).err(),
            "stall_fund" => fund_stall(&mut mk, &mut p, WHO, u("lot") as usize, u("cents")).err(),
            "stall_collect" => collect_stall(&mut mk, &mut p, WHO, u("lot") as usize).err(),
            "stall_spread" => set_stall_spread(&c, &mut mk, &p, WHO, u("lot") as usize, u("bps")).err(),
            "stall_list" => list_stall(&mut mk, &p, WHO, u("lot") as usize, u("price")).err(),
            "stall_buy_listed" => buy_listed_stall(&mut mk, &mut p, WHO, u("lot") as usize).err(),
            "stall_city" => sell_stall_to_city(&c, &mut mk, &mut p, WHO, u("lot") as usize).err(),
            "tick" => { tick_once(&c, &mut mk); None }
            o => panic!("{o}"),
        };
        if err.is_some() { errs += 1 } else { oks += 1 }
        assert_eq!(err, step["error"].as_str(), "error at step {n}: {op}");
        assert_eq!(serde_json::to_value(&mk).unwrap(), step["market"], "market at step {n}: {op}");
        assert_eq!(serde_json::to_value(&p).unwrap(), step["player"], "player at step {n}: {op}");
    }
    assert!(oks > 500 && errs > 100, "trace must exercise both paths: {oks} {errs}");
}
