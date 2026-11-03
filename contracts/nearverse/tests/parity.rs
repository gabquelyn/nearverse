//! Replays fixtures produced by the TypeScript engine against the Rust engine.
use near_sdk::serde_json::{self, Value};
use nearverse::engine::*;

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
    p.coins += 40000;
    let (mut oks, mut errs) = (0, 0);
    for (n, step) in trace.iter().enumerate() {
        let op = &step["op"];
        let now = step["now"].as_u64().unwrap();
        let u = |k: &str| op[k].as_u64().unwrap();
        let err: Option<&str> = match op["t"].as_str().unwrap() {
            "gather" => gather(&c, &mut mk, &mut p, u("node") as usize, now).err(),
            "sell" => sell(&c, &mut mk, &mut p, u("merchant") as usize, u("item") as usize, u("qty"), u("limit"), now).err(),
            "buy" => buy(&c, &mut mk, &mut p, u("merchant") as usize, u("item") as usize, u("qty"), u("limit"), now).err(),
            "repair" => repair(&c, &mut mk, &mut p).err(),
            "build" => build_section(&c, &mut mk, &mut p, u("blueprint") as usize).err(),
            "deposit" => deposit(&mut p, u("cents")).err(),
            "withdraw" => withdraw(&mut p, u("cents")).err(),
            "tick" => { tick_once(&c, &mut mk); None }
            o => panic!("{o}"),
        };
        if err.is_some() { errs += 1 } else { oks += 1 }
        assert_eq!(err, step["error"].as_str(), "error at step {n}: {op}");
        assert_eq!(serde_json::to_value(&mk).unwrap(), step["market"], "market at step {n}: {op}");
        assert_eq!(serde_json::to_value(&p).unwrap(), step["player"], "player at step {n}: {op}");
    }
    assert!(oks > 300 && errs > 100, "trace must exercise both paths: {oks} {errs}");
}
