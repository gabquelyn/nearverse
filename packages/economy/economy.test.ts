import { describe, it, expect } from "vitest";
import { depositToStall, plotExpired, investInMerchant, type Market, type Player, collectFromMerchant, merchantClosed, rules as c, newMarket, tickOnce, createSim, stepHour, floodMarket, bid, ask, explainPrice, newPlayer, startGame, sell, buy, gather, powRatio, buildSection, GameError, cloneMarket, vehiclePrice, buyVehicle, selectVehicle, claimLot, buyFromStall, sellToStall, stockStall, collectStall, listStall, buyListedStall, sellStallToCity, fuelBurn, refuel, repair, burnFuel, addCredits } from "./index";

const iron = c.items.findIndex((i) => i.id === "iron");
/** Deposits a plot's whole list in one go. */
function depositAll(mk: Market, p: Player, lot: number) {
  const needs = c.lots[lot].needs;
  if (!needs.some((q, i) => q > mk.stalls[lot].progress[i])) { depositToStall(c, mk, p, "me", lot, 0, 1, 0); return; }
  needs.forEach((q, i) => { const left = q - mk.stalls[lot].progress[i]; if (left > 0) depositToStall(c, mk, p, "me", lot, i, left, 0); });
}
describe("price", () => {
  it("computes k = 0.5 exactly", () => { expect(powRatio(100, 25, 2)).toBe(2_000_000n); });
  it("falls as stock rises and rises as stock falls", () => {
    const mk = newMarket(c), start = bid(c, mk, 1, iron);
    mk.merchants[1].stock[iron] *= 2; expect(bid(c, mk, 1, iron)).toBeLessThan(start);
    mk.merchants[1].stock[iron] = 5; expect(bid(c, mk, 1, iron)).toBeGreaterThan(start);
  });
  it("always charges more than it pays at the same stock", () => {
    const mk = newMarket(c);
    for (let t = 0; t < 200; t++) { c.merchants.forEach((rules, m) => c.items.forEach((__, i) => { if (rules.targets[i] > 0) expect(ask(c, mk, m, i)).toBeGreaterThan(bid(c, mk, m, i)); })); tickOnce(c, mk); }
  });
  it("explains a price with the same number the market uses", () => {
    const mk = newMarket(c); mk.merchants[2].stock[iron] = 49;
    const e = explainPrice(c, mk, 2, iron, "bid");
    expect(e.price).toBe(bid(c, mk, 2, iron));
    expect(e.sentence).toContain("stock 30% below target");
    expect(e.sentence).toContain("spread (−6%)");
  });
});
describe("events", () => {
  it("makes shortages raise prices and gluts lower them", () => {
    for (const ev of c.events) {
      const mk = newMarket(c);
      while ((mk.tick + 1) % c.event_period_ticks !== 0 || c.events[((mk.tick + 1) / c.event_period_ticks - 1) % c.events.length].id !== ev.id) tickOnce(c, mk);
      const m = c.merchants.findIndex((x) => x.targets[ev.item] > 0), before = bid(c, mk, m, ev.item);
      tickOnce(c, mk);
      if (ev.keep_bps < 10000) expect(bid(c, mk, m, ev.item)).toBeGreaterThan(before);
      else expect(bid(c, mk, m, ev.item)).toBeLessThan(before);
    }
  });
});
describe("credits", () => {
  const code = (f: () => unknown) => { try { f(); } catch (e) { return (e as GameError).code; } return "OK"; };
  const fresh = () => { const mk = newMarket(c), p = newPlayer(c); startGame(c, p); return { mk, p }; };
  it("pay for fuel and repairs, and no merchant sells fuel", () => {
    const { p } = fresh();
    expect(c.items.map((i) => i.id)).not.toContain("fuel");
    p.fuel = 10; const before = p.coins, credits = p.credits; refuel(c, p, 20);
    expect(p.fuel).toBe(30); expect(p.coins).toBe(before - 20 * c.coins_per_fuel); expect(p.credits).toBe(credits);
    p.durability = 60; const b2 = p.coins; repair(c, p);
    expect(p.durability).toBe(100); expect(p.coins).toBe(b2 - 40 * c.coins_per_repair);
    p.coins = 0; refuel(c, p, 7); expect(p.credits).toBe(credits - 2); // 1.05 coins, charged as 2 credits rounded up
    p.credits = 0; expect(code(() => refuel(c, p, 1))).toBe("NOT_ENOUGH_CREDITS");
    expect(code(() => refuel(c, p, 1000))).toBe("BAD_QTY");
  });
  it("buy vehicles priced from every stat", () => {
    const v = c.vehicles[0];
    const base = { ...c, vehicles: [v, { ...v, capacity: v.capacity + 10 }, { ...v, endurance: v.endurance + 50 }, { ...v, fuel_bps: v.fuel_bps - 2000 }, { ...v, flair: v.flair + 1 }, { ...v, size: v.size + 1 }] };
    for (let i = 1; i < 6; i++) expect(vehiclePrice(base, i)).toBeGreaterThan(vehiclePrice(base, 0));
    const { p } = fresh(), titan = c.vehicles.findIndex((x) => x.id === "titan");
    expect(code(() => selectVehicle(c, p, titan))).toBe("NOT_OWNED");
    expect(code(() => buyVehicle(c, p, titan))).toBe("NOT_ENOUGH_CREDITS");
    addCredits(p, 1e6); const b = p.coins; buyVehicle(c, p, titan); selectVehicle(c, p, titan);
    expect(p.coins).toBe(b); expect(fuelBurn(c, p, 2)).toBe(3);
  });
  it("driving only ever costs fuel, and an empty tank stops gathering", () => {
    const { mk, p } = fresh(); burnFuel(c, p, 100);
    expect(p.fuel).toBe(0); expect(code(() => gather(c, mk, p, 0, 100000))).toBe("OUT_OF_FUEL");
  });
});
describe("guards", () => {
  const code = (f: () => unknown) => { try { f(); } catch (e) { return (e as GameError).code; } return "OK"; };
  it("makes an instant buy-sell loop lose money", () => {
    const mk = newMarket(c), p = newPlayer(c); startGame(c, p); const before = p.coins;
    buy(c, mk, p, 1, iron, 5, 1e9, 0); sell(c, mk, p, 1, iron, 5, 0, 1); expect(p.coins).toBeLessThan(before);
  });
  it("enforces travel, min price, cash and cooldown", () => {
    const mk = newMarket(c), p = newPlayer(c); startGame(c, p); p.items[iron] = 20; p.fuel = 50;
    sell(c, mk, p, 0, iron, 1, 0, 100_000);
    expect(code(() => sell(c, mk, p, 1, iron, 1, 0, 100_001))).toBe("TRAVELING");
    expect(code(() => sell(c, mk, p, 0, iron, 1, 1e9, 100_002))).toBe("PRICE_MOVED");
    mk.merchants[0].cash = Math.ceil((c.merchants[0].start_cash * c.closed_below_bps) / 10000); p.items[iron] = 50; expect(code(() => sell(c, mk, p, 0, iron, 50, 0, 100_003))).toBe("MERCHANT_OUT_OF_CASH");
    p.items[iron] = 0; gather(c, mk, p, 0, 200_000); expect(code(() => gather(c, mk, p, 0, 200_001))).toBe("COOLDOWN");
  });
  it("burns materials and labor when building", () => {
    const mk = newMarket(c), p = newPlayer(c); startGame(c, p); p.items[0] = 6; const cash = mk.merchants[2].cash;
    buildSection(c, mk, p, 0); expect(p.items[0]).toBe(0); expect(mk.merchants[2].cash).toBe(cash + c.blueprints[0].sections[0].labor);
  });
});
describe("hunting", () => {
  it("pays a bonus at rich spots, so a far trip beats a nearby one", () => {
    const rich = c.nodes.reduce((best, n, i) => (n.rich > c.nodes[best].rich ? i : best), 0), plain = c.nodes.findIndex((n) => n.rich === 0);
    const mk = newMarket(c), p = newPlayer(c); startGame(c, p); const before = p.coins;
    gather(c, mk, p, plain, 100_000); expect(p.coins).toBe(before);
    gather(c, mk, p, rich, 200_000); expect(p.coins).toBe(before + c.nodes[rich].rich * c.rich_bonus_per_point);
  });
  it("keeps upkeep prices in step with each vehicle's size", () => {
    const pickup = c.vehicles[0];
    expect(pickup.tank * c.coins_per_fuel).toBe(1500); expect(pickup.endurance * c.coins_per_repair).toBe(1000);
  });
});
describe("broke merchants", () => {
  const code = (f: () => unknown) => { try { f(); } catch (e) { return (e as GameError).code; } return "OK"; };
  const broke = () => { const mk = newMarket(c), p = newPlayer(c); startGame(c, p); p.coins = 1e6; p.items[iron] = 5; mk.merchants[0].cash = 1; return { mk, p }; };
  it("close completely, with no income", () => {
    const { mk, p } = broke();
    expect(merchantClosed(c, mk, 0)).toBe(true);
    expect(code(() => sell(c, mk, p, 0, iron, 1, 0, 100_000))).toBe("MERCHANT_CLOSED");
    expect(code(() => buy(c, mk, p, 0, iron, 1, 1e9, 100_000))).toBe("MERCHANT_CLOSED");
    tickOnce(c, mk); expect(mk.merchants[0].cash).toBe(1);
  });
  it("reopen when players invest, and investors share what they sell", () => {
    const { mk, p } = broke();
    investInMerchant(c, mk, p, "a", 0, 60000); investInMerchant(c, mk, p, "b", 0, 20000);
    expect(merchantClosed(c, mk, 0)).toBe(false); expect(p.coins).toBe(1e6 - 80000);
    const cash = mk.merchants[0].cash, paid = buy(c, mk, p, 0, iron, 2, 1e9, 100_000), cut = Math.floor((paid * c.investor_cut_bps) / 10000);
    const [a, b] = mk.merchants[0].investors;
    expect(a.earned).toBe(Math.floor((cut * 3) / 4)); expect(b.earned).toBe(Math.floor(cut / 4));
    expect(mk.merchants[0].cash).toBe(cash + paid - a.earned - b.earned);
    const before = p.coins; expect(collectFromMerchant(mk, p, "a", 0)).toBe(Math.floor((cut * 3) / 4));
    expect(p.coins).toBeGreaterThan(before);
    expect(code(() => collectFromMerchant(mk, p, "a", 0))).toBe("NOTHING_TO_COLLECT");
    expect(code(() => collectFromMerchant(mk, p, "stranger", 0))).toBe("NOTHING_TO_COLLECT");
  });
  it("limit how many can invest", () => {
    const { mk, p } = broke();
    for (let i = 0; i < c.max_investors; i++) investInMerchant(c, mk, p, `p${i}`, 0, 100);
    expect(code(() => investInMerchant(c, mk, p, "late", 0, 100))).toBe("INVESTORS_FULL");
    investInMerchant(c, mk, p, "p0", 0, 100); expect(mk.merchants[0].investors[0].stake).toBe(200);
  });
  it("sell their stalls for coins, which go to their cash", () => {
    const { mk, p } = broke(), lot = c.lots.findIndex((l) => l.seeded && l.seed_merchant === 0), till = mk.stalls[lot].cash;
    buyListedStall(c, mk, p, "me", lot);
    expect(mk.stalls[lot].owner).toBe("me"); expect(mk.merchants[0].cash).toBe(1 + c.seed_price + till); expect(merchantClosed(c, mk, 0)).toBe(false);
  });
  it("get reopened in the simulated week if traders can afford it", () => {
    const s = createSim(c, newMarket(c)); s.mk.merchants[1].cash = 1;
    s.traders.forEach((t) => { t.coins = 1e6; });
    expect(stepHour(s).closed).toContain(1);
    let reopened = false; for (let i = 0; i < 12 && !reopened; i++) reopened = stepHour(s).reopened.includes(1);
    expect(reopened).toBe(true); expect(s.mk.merchants[1].investors.length).toBe(1);
  });
});
describe("materials and building in stages", () => {
  const code = (f: () => unknown) => { try { f(); } catch (e) { return (e as GameError).code; } return "OK"; };
  it("has at least 20 materials, and rarer ones cost more and are scarcer", () => {
    expect(c.items.length).toBeGreaterThanOrEqual(20);
    const avg = (tier: number, f: (n: (typeof c.nodes)[number]) => number) => { const l = c.nodes.filter((n) => c.items[n.item].tier === tier); return l.reduce((a, n) => a + f(n), 0) / Math.max(1, l.length); };
    const price = (tier: number) => Math.min(...c.items.filter((i) => i.tier === tier).map((i) => i.base_price));
    expect(price(4)).toBeGreaterThan(price(3)); expect(price(3)).toBeGreaterThan(price(2));
    for (const it of c.items) { expect(c.merchants.some((m) => m.targets[c.items.indexOf(it)] > 0)).toBe(true); expect(c.lots.some((l) => l.accepts.includes(c.items.indexOf(it)))).toBe(true); }
    expect(c.nodes.filter((n) => c.items[n.item].tier === 1).length).toBeGreaterThan(c.nodes.filter((n) => c.items[n.item].tier === 3).length);
    expect(avg(3, (n) => n.regrow)).toBeLessThan(avg(1, (n) => n.regrow));
    expect(c.items.every((_, i) => c.nodes.some((n) => n.item === i) )).toBe(true);
  });
  it("merchants and stalls only deal in their own materials", () => {
    const mk = newMarket(c), p = newPlayer(c); startGame(c, p); p.coins = 1e7;
    const m = c.merchants.findIndex((x) => x.id === "jeweler"), wood = 0; p.items[wood] = 5;
    expect(code(() => sell(c, mk, p, m, wood, 1, 0, 100_000))).toBe("DOES_NOT_TRADE");
    expect(code(() => buy(c, mk, p, m, wood, 1, 1e9, 100_000))).toBe("DOES_NOT_TRADE");
    const lot = c.lots.findIndex((l) => l.seeded), no = c.items.findIndex((_, i) => !c.lots[lot].accepts.includes(i));
    expect(code(() => buyFromStall(c, mk, p, "me", lot, no, 1, 1e9, 100_000))).toBe("DOES_NOT_TRADE");
  });
  it("buying raises the price and selling lowers it, for any material", () => {
    const mk = newMarket(c), p = newPlayer(c); startGame(c, p); p.coins = 1e8; const m = c.merchants.findIndex((x) => x.id === "jeweler"), gold = c.items.findIndex((i) => i.id === "gold");
    const before = ask(c, mk, m, gold); buy(c, mk, p, m, gold, 1, 1e9, 100_000); expect(ask(c, mk, m, gold)).toBeGreaterThan(before);
    const up = bid(c, mk, m, gold); sell(c, mk, p, m, gold, 1, 0, 100_000); expect(bid(c, mk, m, gold)).toBeLessThan(up);
  });
  it("keeps building progress between trips, and opens the stall when complete", () => {
    const mk = newMarket(c), p = newPlayer(c); startGame(c, p); p.credits = 1e6; const lot = c.lots.findIndex((l) => !l.seeded), needs = c.lots[lot].needs;
    claimLot(c, mk, p, "me", lot, 1000);
    const item = needs.findIndex((q) => q > 2), other = needs.findIndex((q, i) => q > 0 && i !== item); p.items[item] = 2;
    expect(depositToStall(c, mk, p, "me", lot, item, 2, 2000)).toBe(2); expect(mk.stalls[lot].progress[item]).toBe(2); expect(mk.stalls[lot].built).toBe(false); expect(p.items[item]).toBe(0);
    expect(code(() => depositToStall(c, mk, p, "me", lot, item, 1, 2000))).toBe("NOT_ENOUGH_ITEMS");
    expect(code(() => depositToStall(c, mk, p, "you", lot, item, 1, 2000))).toBe("NOT_YOUR_STALL");
    expect(code(() => depositToStall(c, mk, p, "me", lot, c.items.findIndex((_, i) => needs[i] === 0), 1, 2000))).toBe("NOT_NEEDED");
    p.items[item] = 500; expect(depositToStall(c, mk, p, "me", lot, item, 500, 3000)).toBe(needs[item] - 2); expect(p.items[item]).toBe(500 - (needs[item] - 2));
    p.items[other] = needs[other]; depositToStall(c, mk, p, "me", lot, other, needs[other], 4000); expect(mk.stalls[lot].built).toBe(true);
  });
  it("returns an idle plot to the market after the deadline, with half the price back", () => {
    const mk = newMarket(c), p = newPlayer(c); startGame(c, p); p.credits = 1e6; const lot = c.lots.findIndex((l) => !l.seeded), item = c.lots[lot].needs.findIndex((q) => q > 0);
    claimLot(c, mk, p, "me", lot, 1000); p.items[item] = 1; depositToStall(c, mk, p, "me", lot, item, 1, 5000);
    expect(code(() => claimLot(c, mk, p, "you", lot, 5000 + c.plot_deadline_ms))).toBe("LOT_TAKEN");
    expect(plotExpired(c, mk, lot, 5001 + c.plot_deadline_ms)).toBe(true);
    expect(claimLot(c, mk, p, "you", lot, 5001 + c.plot_deadline_ms)).toEqual({ to: "me", credits: Math.floor(c.lots[lot].price / 2) });
    expect(mk.stalls[lot].owner).toBe("you"); expect(mk.stalls[lot].progress[item]).toBe(0);
  });
});
describe("resources", () => {
  it("are hidden off the road network and get richer further out", () => {
    expect(c.nodes.length).toBeGreaterThan(50);
    const far = c.nodes.filter((n) => Math.hypot(n.x, n.z) > 500), near = c.nodes.filter((n) => Math.hypot(n.x, n.z) < 200);
    const avg = (l: typeof far) => l.reduce((a, n) => a + n.rich, 0) / l.length;
    expect(avg(far)).toBeGreaterThan(avg(near));
    for (const n of c.nodes) expect(Math.hypot(n.x, n.z)).toBeLessThan(965);
  });
});
describe("player stalls", () => {
  const code = (f: () => unknown) => { try { f(); } catch (e) { return (e as GameError).code; } return "OK"; };
  const freeLot = c.lots.findIndex((l) => !l.seeded), seeded = c.lots.findIndex((l) => l.seeded);
  const fresh = () => { const mk = newMarket(c), p = newPlayer(c); startGame(c, p); return { mk, p }; };
  it("needs a location bought with credits first", () => {
    const { mk, p } = fresh();
    expect(code(() => depositAll(mk, p, freeLot))).toBe("NOT_YOUR_STALL");
    p.credits = 0; expect(code(() => claimLot(c, mk, p, "me", freeLot, 0))).toBe("NOT_ENOUGH_CREDITS");
    p.credits = c.lots[freeLot].price; claimLot(c, mk, p, "me", freeLot, 0);
    expect(p.credits).toBe(0); expect(mk.stalls[freeLot].owner).toBe("me"); expect(mk.stalls[freeLot].built).toBe(false);
    expect(code(() => claimLot(c, mk, p, "you", freeLot, 0))).toBe("LOT_TAKEN");
  });
  it("is built from bought materials or found ones", () => {
    const { mk, p } = fresh(); p.credits = 1e6; p.coins = 1e7;
    claimLot(c, mk, p, "me", freeLot, 0);
    expect(code(() => depositAll(mk, p, freeLot))).toBe("NOT_ENOUGH_ITEMS");
    c.lots[freeLot].needs.forEach((q, i) => { if (q) buy(c, mk, p, 0, i, q, 1e9, 1); });
    depositAll(mk, p, freeLot);
    expect(mk.stalls[freeLot].built).toBe(true); expect(p.items.reduce((a, q) => a + q, 0)).toBe(0);
    expect(code(() => depositAll(mk, p, freeLot))).toBe("ALREADY_BUILT");
  });
  it("can't trade until it is built", () => {
    const { mk, p } = fresh(); p.credits = 1e6; claimLot(c, mk, p, "you", freeLot, 0);
    expect(code(() => buyFromStall(c, mk, p, "me", freeLot, 0, 1, 1e9, 1))).toBe("NO_STALL");
    expect(code(() => stockStall(c, mk, p, "you", freeLot, 0, 1))).toBe("NOT_BUILT");
  });
  it("trades with other players and pays its owner in coins", () => {
    const { mk, p } = fresh(); p.coins = 1e6;
    const held = mk.stalls[seeded].stock[iron], till = mk.stalls[seeded].cash;
    const paid = buyFromStall(c, mk, p, "me", seeded, iron, 3, 1e9, 1);
    expect(mk.stalls[seeded].stock[iron]).toBe(held - 3); expect(mk.stalls[seeded].cash).toBe(till + paid);
    expect(sellToStall(c, mk, p, "me", seeded, iron, 3, 0, 2)).toBeLessThan(paid);
  });
  it("can be sold to another player or back to the city", () => {
    const { mk, p } = fresh(); p.coins = 1e6;
    expect(code(() => buyListedStall(c, mk, p, "me", freeLot))).toBe("NOT_FOR_SALE");
    const before = mk.stalls[seeded].cash, sale = buyListedStall(c, mk, p, "me", seeded);
    expect(sale.seller).toBe(""); expect(sale.paid).toBe(c.seed_price + before);
    expect(code(() => sellStallToCity(c, mk, p, "me", seeded))).toBe("STALL_NOT_EMPTY");
    mk.stalls[seeded].stock = c.items.map(() => 0);
    const coinsBefore = p.coins, v = sellStallToCity(c, mk, p, "me", seeded);
    expect(p.coins).toBe(coinsBefore + v); expect(mk.stalls[seeded].owner).toBeNull();
  });
  it("only lets the owner manage it", () => {
    const { mk, p } = fresh(); p.items[0] = 5;
    expect(code(() => stockStall(c, mk, p, "me", seeded, 0, 1))).toBe("NOT_YOUR_STALL");
    expect(code(() => collectStall(c, mk, p, "me", seeded))).toBe("NOT_YOUR_STALL");
    expect(code(() => listStall(c, mk, p, "me", seeded, 5))).toBe("NOT_YOUR_STALL");
    expect(code(() => buyFromStall(c, mk, p, mk.stalls[seeded].owner!, seeded, 0, 1, 1e9, 1))).toBe("YOUR_OWN_STALL");
  });
});
describe("a simulated week", () => {
  const run = () => { const s = createSim(c, newMarket(c)); for (let i = 0; i < 168; i++) stepHour(s); return s; };
  it("is deterministic for one seed", () => { expect(run().history).toEqual(run().history); });
  it("keeps moving and does not collapse", () => {
    const s = run();
    const iSeries = s.history.map((h) => h.prices[iron]);
    expect(Math.max(...iSeries) / Math.min(...iSeries)).toBeGreaterThan(1.15);
    expect(s.history.reduce((a, h) => a + h.trades, 0)).toBeGreaterThan(300);
    expect(s.history.filter((h) => h.event).length).toBeGreaterThan(20);
    for (const m of s.mk.merchants) expect(m.cash).toBeGreaterThan(0);
    const changed = s.mk.merchants.some((m, i) => m.target.some((t, j) => t !== c.merchants[i].targets[j]));
    expect(changed).toBe(true);
  });
  it("floods the market on request and prices fall", () => {
    const s = createSim(c, newMarket(c)), before = cloneMarket(s.mk);
    floodMarket(s, iron, 200);
    expect(bid(c, s.mk, 1, iron)).toBeLessThan(bid(c, before, 1, iron));
  });
});
