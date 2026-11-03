// Writes shared cases. The Rust tests replay these, so any drift between the two engines fails CI.
import { writeFileSync } from "node:fs";
import { rules as c, newMarket, tickOnce, bidAt, askAt, newPlayer, startGame, gather, sell, buy, repair, buildSection, deposit, withdraw, GameError, rng } from "../packages/economy/index";
const root = new URL("..", import.meta.url).pathname;
const vectors: any[] = [];
const r = rng(42);
for (let i = 0; i < 400; i++) {
  const merchant = Math.floor(r() * c.merchants.length), item = Math.floor(r() * c.items.length);
  const target = 1 + Math.floor(r() * 400), stock = Math.floor(r() * 900), tick = Math.floor(r() * 500);
  vectors.push({ merchant, item, tick, target, stock, bid: bidAt(c, merchant, item, tick, target, stock), ask: askAt(c, merchant, item, target, stock) });
}
writeFileSync(root + "packages/economy/fixtures/price-vectors.json", JSON.stringify(vectors) + "\n");

const mk = newMarket(c), p = newPlayer(c); startGame(c, p); p.coins += 40000;
const ops: any[] = [];
let now = 0;
const rec = (op: any, f: () => unknown) => {
  let error: string | null = null;
  try { f(); } catch (e) { if (!(e instanceof GameError)) throw e; error = e.code; }
  ops.push({ op, now, error, market: JSON.parse(JSON.stringify(mk)), player: JSON.parse(JSON.stringify(p)) });
};
for (let i = 0; i < 1500; i++) {
  now += 1000 + Math.floor(r() * 12000);
  const a = r(), merchant = Math.floor(r() * c.merchants.length), item = Math.floor(r() * c.items.length), qty = 1 + Math.floor(r() * 8);
  if (a < 0.3) { const node = Math.floor(r() * c.nodes.length); rec({ t: "gather", node }, () => gather(c, mk, p, node, now)); }
  else if (a < 0.5) rec({ t: "sell", merchant, item, qty, limit: 0 }, () => sell(c, mk, p, merchant, item, qty, 0, now));
  else if (a < 0.7) rec({ t: "buy", merchant, item, qty, limit: 1e9 }, () => buy(c, mk, p, merchant, item, qty, 1e9, now));
  else if (a < 0.75) rec({ t: "repair" }, () => repair(c, mk, p));
  else if (a < 0.82) { const bp = Math.floor(r() * c.blueprints.length); rec({ t: "build", blueprint: bp }, () => buildSection(c, mk, p, bp)); }
  else if (a < 0.84) { const cents = 1 + Math.floor(r() * 500); rec({ t: "deposit", cents }, () => deposit(c, p, cents)); }
  else if (a < 0.86) { const cents = 1 + Math.floor(r() * 500); rec({ t: "withdraw", cents }, () => withdraw(p, cents)); }
  else rec({ t: "tick" }, () => tickOnce(c, mk));
}
writeFileSync(root + "packages/economy/fixtures/trace.json", JSON.stringify(ops) + "\n");
console.log(`Wrote ${vectors.length} price vectors and ${ops.length} trace steps (${ops.filter((o) => o.error).length} expected errors)`);
