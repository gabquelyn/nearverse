// Writes shared cases. The Rust tests replay these, so any drift between the two engines fails CI.
import { writeFileSync } from "node:fs";
import { investInMerchant, collectFromMerchant, rules as c, newMarket, tickOnce, bidAt, askAt, newPlayer, startGame, gather, sell, buy, repair, buildSection, takeDamage, GameError, rng, buyVehicle, selectVehicle, depositToStall, claimLot, refuel, burnFuel, addCredits, sellToStall, buyFromStall, stockStall, unstockStall, fundStall, collectStall, setStallSpread, listStall, buyListedStall, sellStallToCity } from "../packages/economy/index";
const root = new URL("..", import.meta.url).pathname;
const vectors: any[] = [];
const r = rng(42);
for (let i = 0; i < 400; i++) {
  const merchant = Math.floor(r() * c.merchants.length), item = Math.floor(r() * c.items.length);
  const target = 1 + Math.floor(r() * 400), stock = Math.floor(r() * 900), tick = Math.floor(r() * 500);
  vectors.push({ merchant, item, tick, target, stock, bid: bidAt(c, merchant, item, tick, target, stock), ask: askAt(c, merchant, item, target, stock) });
}
writeFileSync(root + "packages/economy/fixtures/price-vectors.json", JSON.stringify(vectors) + "\n");

const mk = newMarket(c), p = newPlayer(c); startGame(c, p); p.coins += 400000; p.credits += 6000;
const ops: any[] = [];
let now = 0;
const rec = (op: any, f: () => unknown) => {
  let error: string | null = null;
  try { f(); } catch (e) { if (!(e instanceof GameError)) throw e; error = e.code; }
  ops.push({ op, now, error, market: JSON.parse(JSON.stringify(mk)), player: JSON.parse(JSON.stringify(p)) });
};
for (let i = 0; i < 2500; i++) {
  now += 1000 + Math.floor(r() * 12000);
  const a = r(), merchant = Math.floor(r() * c.merchants.length), item = Math.floor(r() * c.items.length), qty = 1 + Math.floor(r() * 8);
  if (i % 8 === 0) { rec({ t: "tick" }, () => tickOnce(c, mk)); continue; }
  if (a < 0.3) { const node = Math.floor(r() * c.nodes.length); rec({ t: "gather", node }, () => gather(c, mk, p, node, now)); }
  else if (a < 0.5) rec({ t: "sell", merchant, item, qty, limit: 0 }, () => sell(c, mk, p, merchant, item, qty, 0, now));
  else if (a < 0.7) rec({ t: "buy", merchant, item, qty, limit: 1e9 }, () => buy(c, mk, p, merchant, item, qty, 1e9, now));
  else if (a < 0.75) rec({ t: "repair" }, () => repair(c, p));
  else if (a < 0.82) { const bp = Math.floor(r() * c.blueprints.length); rec({ t: "build", blueprint: bp }, () => buildSection(c, mk, p, bp)); }
  else if (a < 0.84) { const units = Math.floor(r() * 60); rec({ t: "refuel", units }, () => refuel(c, p, units)); }
  else if (a < 0.86) { const units = Math.floor(r() * 12); rec({ t: "burn", units }, () => burnFuel(c, p, units)); }
  else if (a < 0.88) { const points = Math.floor(r() * 30); rec({ t: "damage", points }, () => takeDamage(c, p, points)); }
  else if (a < 0.895) { const v = Math.floor(r() * c.vehicles.length); rec({ t: "buy_vehicle", v }, () => buyVehicle(c, p, v)); }
  else if (a < 0.91) { const v = Math.floor(r() * c.vehicles.length); rec({ t: "select_vehicle", v }, () => selectVehicle(c, p, v)); }
  else {
    const lot = Math.floor(r() * c.lots.length), k = r(), who = "me.testnet";
    if (k < 0.07) rec({ t: "claim_lot", lot }, () => claimLot(c, mk, p, who, lot, now));
    else if (k < 0.14) rec({ t: "stall_deposit", lot, item, qty }, () => depositToStall(c, mk, p, who, lot, item, qty, now));
    else if (k < 0.28) rec({ t: "stall_sell", lot, item, qty }, () => sellToStall(c, mk, p, who, lot, item, qty, 0, now));
    else if (k < 0.42) rec({ t: "stall_buy", lot, item, qty }, () => buyFromStall(c, mk, p, who, lot, item, qty, 1e9, now));
    else if (k < 0.5) rec({ t: "stall_stock", lot, item, qty }, () => stockStall(c, mk, p, who, lot, item, qty));
    else if (k < 0.58) rec({ t: "stall_unstock", lot, item, qty }, () => unstockStall(c, mk, p, who, lot, item, qty));
    else if (k < 0.64) { const cents = Math.floor(r() * 3000); rec({ t: "stall_fund", lot, cents }, () => fundStall(c, mk, p, who, lot, cents)); }
    else if (k < 0.7) rec({ t: "stall_collect", lot }, () => collectStall(c, mk, p, who, lot));
    else if (k < 0.76) { const bps = Math.floor(r() * 3000); rec({ t: "stall_spread", lot, bps }, () => setStallSpread(c, mk, p, who, lot, bps)); }
    else if (k < 0.82) { const price = Math.floor(r() * 2) * 5000; rec({ t: "stall_list", lot, price }, () => listStall(c, mk, p, who, lot, price)); }
    else if (k < 0.9) rec({ t: "stall_buy_listed", lot }, () => buyListedStall(c, mk, p, who, lot));
    else if (k < 0.95) rec({ t: "stall_city", lot }, () => sellStallToCity(c, mk, p, who, lot));
    else if (k < 0.97) { const cents = Math.floor(r() * 90000); rec({ t: "invest", merchant, cents }, () => investInMerchant(c, mk, p, who, merchant, cents)); }
    else if (k < 0.98) rec({ t: "merchant_collect", merchant }, () => collectFromMerchant(mk, p, who, merchant));
    else { const credits = Math.floor(r() * 400); rec({ t: "add_credits", credits }, () => addCredits(p, credits)); }
  }
  if (false) rec({ t: "tick" }, () => tickOnce(c, mk));
}
writeFileSync(root + "packages/economy/fixtures/trace.json", JSON.stringify(ops) + "\n");
console.log(`Wrote ${vectors.length} price vectors and ${ops.length} trace steps (${ops.filter((o) => o.error).length} expected errors)`);
