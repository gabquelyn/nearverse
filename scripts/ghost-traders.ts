// Labeled simulated traders using real testnet transactions, so the live market moves with few players.
// Each is a clearly named sub-account: ghost-1.<deployer> and so on. You run this; it spends testnet NEAR.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Near, generateKey } from "near-kit";
const { NEARVERSE_DEPLOYER_ACCOUNT: account, NEARVERSE_DEPLOYER_PRIVATE_KEY: key, GAME_CONTRACT: contract, NEARVERSE_GHOST_KEY_FILE: file = ".ghost-keys.json" } = process.env;
if (!account || !key || !contract) throw new Error("Set the deployer variables and GAME_CONTRACT in .env");
if (!account.endsWith(".testnet")) throw new Error("Ghost traders only run on testnet.");
const COUNT = Number(process.argv[2] ?? 4), root = new Near({ network: "testnet", rpcUrl: process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com", privateKey: key as `ed25519:${string}`, defaultSignerId: account });
const keys: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
const rules = JSON.parse(readFileSync(new URL("../packages/economy/generated/rules.json", import.meta.url), "utf8"));
const ghosts: { id: string; near: Near }[] = [];
for (let i = 1; i <= COUNT; i++) {
  const id = `ghost-${i}.${account}`;
  if (!keys[id]) {
    const k = generateKey();
    await root.transaction(account).createAccount(id).transfer(id, "0.3 NEAR").addKey(k.publicKey.toString(), { type: "fullAccess" }).send();
    keys[id] = k.secretKey; writeFileSync(file, JSON.stringify(keys));
  }
  const near = new Near({ network: "testnet", rpcUrl: process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com", privateKey: keys[id] as `ed25519:${string}`, defaultSignerId: id });
  const me = await near.view<{ started: boolean } | null>(contract, "get_player", { account_id: id });
  if (!me?.started) await near.call(contract, "start_game", {}, { gas: "60 Tgas" });
  ghosts.push({ id, near });
}
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
console.log(`Running ${ghosts.length} ghost traders. Ctrl-C to stop.`);
for (;;) {
  for (const g of ghosts) {
    try {
      const p = await g.near.view<{ items: number[]; fuel: number }>(contract, "get_player", { account_id: g.id });
      const held = p.items.map((q, i) => ({ q, i })).filter((x) => x.q >= 3);
      if (p.fuel < 4) await g.near.call(contract, "refuel", { units: 10 }, { gas: "60 Tgas" });
      else if (held.length && Math.random() < 0.5) { const h = pick(held); await g.near.call(contract, "sell", { merchant: Math.floor(Math.random() * rules.merchants.length), item: h.i, qty: Math.min(h.q, 6), min_total: 0 }, { gas: "60 Tgas" }); console.log(g.id, "sold", rules.items[h.i].id); }
      else { await g.near.call(contract, "gather", { node: Math.floor(Math.random() * rules.nodes.length) }, { gas: "60 Tgas" }); console.log(g.id, "gathered"); }
    } catch (e) { console.log(g.id, "skipped:", String((e as Error).message).match(/[A-Z_]{6,}/)?.[0] ?? "network"); }
  }
  await new Promise((r) => setTimeout(r, 15000));
}
