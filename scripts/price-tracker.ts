// Saves every dealer's prices once per market hour, so the performance chart has a shared history.
// Needs GAME_CONTRACT, PRICE_DB_URL and PRICE_DB_KEY. Keep PRICE_DB_KEY on the server only.
import { Near } from "near-kit";
import { rules, priceSnapshot, type Market } from "@nearverse/economy";

const contract = process.env.GAME_CONTRACT, url = process.env.PRICE_DB_URL, key = process.env.PRICE_DB_KEY;
if (!contract || !url || !key) { console.log("Set GAME_CONTRACT, PRICE_DB_URL and PRICE_DB_KEY to run the price tracker."); process.exit(1); }
const near = new Near({ network: (process.env.NEAR_NETWORK ?? "testnet") as "testnet", ...(process.env.NEAR_RPC_URL ? { rpcUrl: process.env.NEAR_RPC_URL } : {}) } as never);
const EVERY = Number(process.env.PRICE_TRACK_MS ?? 600_000);

async function save() {
  const market = await near.view<Market>(contract!, "get_market", {});
  const s = priceSnapshot(rules, market, Date.now());
  const res = await fetch(`${url!.replace(/\/$/, "")}/rest/v1/price_snapshots`, {
    method: "POST",
    headers: { apikey: key!, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ contract, tick: s.tick, d: s.d }),
  });
  if (!res.ok) throw new Error(`database answered ${res.status}: ${await res.text()}`);
  console.log(new Date().toISOString(), "saved prices at market hour", s.tick);
}

for (;;) {
  await save().catch((e) => console.log("skipped:", (e as Error).message));
  await new Promise((r) => setTimeout(r, EVERY));
}
