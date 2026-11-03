import { describe, it, expect } from "vitest";
import { rules as c, newMarket, tickOnce, createSim, stepHour, floodMarket, bid, ask, explainPrice, newPlayer, startGame, sell, buy, gather, powRatio, buildSection, GameError, cloneMarket, vehiclePrice, buyVehicle, selectVehicle, buildStall, claimLot, buyFromStall, sellToStall, stockStall, collectStall, listStall, buyListedStall, sellStallToCity, fuelBurn, refuel, repair, burnFuel, addCredits } from "./index";

const iron = c.items.findIndex((i) => i.id === "iron");
describe("price", () => {
  it("computes k = 0.5 exactly", () => { expect(powRatio(100, 25, 2)).toBe(2_000_000n); });
  it("falls as stock rises and rises as stock falls", () => {
    const mk = newMarket(c), start = bid(c, mk, 1, iron);
    mk.merchants[1].stock[iron] *= 2; expect(bid(c, mk, 1, iron)).toBeLessThan(start);
    mk.merchants[1].stock[iron] = 5; expect(bid(c, mk, 1, iron)).toBeGreaterThan(start);
  });
  it("always charges more than it pays at the same stock", () => {
    const mk = newMarket(c);
    for (let t = 0; t < 200; t++) { c.merchants.forEach((_, m) => c.items.forEach((__, i) => expect(ask(c, mk, m, i)).toBeGreaterThan(bid(c, mk, m, i)))); tickOnce(c, mk); }
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
      const before = bid(c, mk, 1, ev.item);
      tickOnce(c, mk);
      if (ev.keep_bps < 10000) expect(bid(c, mk, 1, ev.item)).toBeGreaterThan(before);
      else expect(bid(c, mk, 1, ev.item)).toBeLessThan(before);
    }
  });
});
describe("credits", () => {
  const code = (f: () => unknown) => { try { f(); } catch (e) { return (e as GameError).code; } return "OK"; };
  const fresh = () => { const mk = newMarket(c), p = newPlayer(c); startGame(c, p); return { mk, p }; };
  it("pay for fuel and repairs, and no merchant sells fuel", () => {
    const { p } = fresh();
    expect(c.items.map((i) => i.id)).not.toContain("fuel");
    p.fuel = 10; const before = p.credits; refuel(c, p, 20);
    expect(p.fuel).toBe(30); expect(p.credits).toBe(before - 20 * c.credits_per_fuel);
    p.durability = 60; const b2 = p.credits; repair(c, p);
    expect(p.durability).toBe(100); expect(p.credits).toBe(b2 - 40 * c.credits_per_repair);
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
    mk.merchants[0].cash = 0; expect(code(() => sell(c, mk, p, 0, iron, 1, 0, 100_003))).toBe("MERCHANT_OUT_OF_CASH");
    p.items[iron] = 0; gather(c, mk, p, 0, 200_000); expect(code(() => gather(c, mk, p, 0, 200_001))).toBe("COOLDOWN");
  });
  it("burns materials and labor when building", () => {
    const mk = newMarket(c), p = newPlayer(c); startGame(c, p); p.items[0] = 6; const cash = mk.merchants[2].cash;
    buildSection(c, mk, p, 0); expect(p.items[0]).toBe(0); expect(mk.merchants[2].cash).toBe(cash + c.blueprints[0].sections[0].labor);
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
    expect(code(() => buildStall(c, mk, p, "me", freeLot))).toBe("NOT_YOUR_STALL");
    p.credits = 0; expect(code(() => claimLot(c, mk, p, "me", freeLot))).toBe("NOT_ENOUGH_CREDITS");
    p.credits = c.lots[freeLot].price; claimLot(c, mk, p, "me", freeLot);
    expect(p.credits).toBe(0); expect(mk.stalls[freeLot].owner).toBe("me"); expect(mk.stalls[freeLot].built).toBe(false);
    expect(code(() => claimLot(c, mk, p, "you", freeLot))).toBe("LOT_TAKEN");
  });
  it("is built from bought materials or found ones", () => {
    const { mk, p } = fresh(); p.credits = 1e6; p.coins = 1e7;
    claimLot(c, mk, p, "me", freeLot);
    expect(code(() => buildStall(c, mk, p, "me", freeLot))).toBe("NOT_ENOUGH_ITEMS");
    c.lots[freeLot].needs.forEach((q, i) => { if (q) buy(c, mk, p, 0, i, q, 1e9, 1); });
    buildStall(c, mk, p, "me", freeLot);
    expect(mk.stalls[freeLot].built).toBe(true); expect(p.items.reduce((a, q) => a + q, 0)).toBe(0);
    expect(code(() => buildStall(c, mk, p, "me", freeLot))).toBe("ALREADY_BUILT");
  });
  it("can't trade until it is built", () => {
    const { mk, p } = fresh(); p.credits = 1e6; claimLot(c, mk, p, "you", freeLot);
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
    expect(sale.seller).toBe(c.seed_owner); expect(sale.paid).toBe(c.seed_price + before);
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
    expect(code(() => buyFromStall(c, mk, p, c.seed_owner, seeded, 0, 1, 1e9, 1))).toBe("YOUR_OWN_STALL");
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
    expect(s.history.reduce((a, h) => a + h.built, 0)).toBeGreaterThan(5);
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
