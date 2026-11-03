import { describe, it, expect } from "vitest";
import { rules as c, newMarket, tickOnce, createSim, stepHour, floodMarket, bid, ask, explainPrice, newPlayer, startGame, sell, buy, withdraw, deposit, gather, powRatio, buildSection, GameError, cloneMarket } from "./index";

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
describe("guards", () => {
  const code = (f: () => unknown) => { try { f(); } catch (e) { return (e as GameError).code; } return "OK"; };
  it("caps withdrawals at deposits, so earnings cannot leave", () => {
    const p = newPlayer(c); startGame(c, p); deposit(c, p, 1000); p.coins += 999999;
    expect(code(() => withdraw(p, 1001))).toBe("OVER_DEPOSIT_CAP");
    expect(code(() => withdraw(p, 1000))).toBe("OK");
  });
  it("makes an instant buy-sell loop lose money", () => {
    const mk = newMarket(c), p = newPlayer(c); startGame(c, p); const before = p.coins;
    buy(c, mk, p, 1, iron, 5, 1e9, 0); sell(c, mk, p, 1, iron, 5, 0, 1); expect(p.coins).toBeLessThan(before);
  });
  it("enforces travel, min price, cash and cooldown", () => {
    const mk = newMarket(c), p = newPlayer(c); startGame(c, p); p.items[iron] = 20;
    sell(c, mk, p, 0, iron, 1, 0, 100_000);
    expect(code(() => sell(c, mk, p, 1, iron, 1, 0, 100_001))).toBe("TRAVELING");
    expect(code(() => sell(c, mk, p, 0, iron, 1, 1e9, 100_002))).toBe("PRICE_MOVED");
    mk.merchants[0].cash = 0; expect(code(() => sell(c, mk, p, 0, iron, 1, 0, 100_003))).toBe("MERCHANT_OUT_OF_CASH");
    gather(c, mk, p, 0, 200_000); expect(code(() => gather(c, mk, p, 0, 200_001))).toBe("COOLDOWN");
  });
  it("burns materials and labor when building", () => {
    const mk = newMarket(c), p = newPlayer(c); startGame(c, p); p.items[0] = 6; const cash = mk.merchants[2].cash;
    buildSection(c, mk, p, 0); expect(p.items[0]).toBe(0); expect(mk.merchants[2].cash).toBe(cash + c.blueprints[0].sections[0].labor);
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
