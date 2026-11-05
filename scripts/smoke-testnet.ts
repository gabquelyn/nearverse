// Real testnet check of the game loop. You run this after deploying. Spends a little testnet NEAR on gas.
import { Near } from "near-kit";
const { GAME_CONTRACT: contract, NEARVERSE_DEPLOYER_ACCOUNT: account, NEARVERSE_DEPLOYER_PRIVATE_KEY: key } = process.env;
if (!contract || !account || !key) throw new Error("Set GAME_CONTRACT and the deployer variables in .env");
const near = new Near({ network: "testnet", rpcUrl: process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com", privateKey: key as `ed25519:${string}`, defaultSignerId: account });
// Prints what each call really burned, so gas is measured and not guessed.
const call = async (m: string, a: object = {}) => {
  const out = await near.transaction(account).functionCall(contract, m, a as Record<string, unknown>, { gas: "100 Tgas" }).send({ waitUntil: "FINAL" }) as { transaction_outcome?: { outcome: { gas_burnt: number } }; receipts_outcome?: { outcome: { gas_burnt: number } }[] };
  const burnt = (out.transaction_outcome?.outcome.gas_burnt ?? 0) + (out.receipts_outcome ?? []).reduce((t, r) => t + r.outcome.gas_burnt, 0);
  console.log(`${m}: ${(burnt / 1e12).toFixed(1)} Tgas`);
};
const me = await near.view<{ started: boolean } | null>(contract, "get_player", { account_id: account });
if (!me?.started) await call("start_game");
await call("gather", { node: 0 });
console.log("Wood:", await near.view(contract, "mt_balance_of", { account_id: account, token_id: "wood" }));
await new Promise((r) => setTimeout(r, 1500));
await call("sell", { merchant: 0, item: 0, qty: 1, min_total: 0 });
await call("buy", { merchant: 0, item: 0, qty: 1, max_total: 100000 });
await call("refuel", { units: 1 });
console.log("Revenue:", await near.view(contract, "revenue", {}));
console.log("Player:", await near.view(contract, "get_player", { account_id: account }));
console.log("Testnet smoke passed. Check gas on testnet.nearblocks.io.");
