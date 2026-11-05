// Deploys out/nearverse.wasm to NEARVERSE_DEPLOYER_ACCOUNT and initializes it from the rules file.
// You run this. It signs testnet transactions with the key in .env.
import { readFileSync } from "node:fs";
import { Near } from "near-kit";
const root = new URL("..", import.meta.url).pathname;
const { NEARVERSE_DEPLOYER_ACCOUNT: account, NEARVERSE_DEPLOYER_PRIVATE_KEY: key } = process.env;
if (!account || !key) throw new Error("Set NEARVERSE_DEPLOYER_ACCOUNT and NEARVERSE_DEPLOYER_PRIVATE_KEY in .env");
if (!account.endsWith(".testnet")) throw new Error("This script only deploys to testnet.");
const near = new Near({ network: "testnet", rpcUrl: process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com", privateKey: key as `ed25519:${string}`, defaultSignerId: account });
const wasm = readFileSync(root + "out/nearverse.wasm");
const config = JSON.parse(readFileSync(root + "packages/economy/generated/rules.json", "utf8"));
const live = await near.view(account, "get_genesis_ms", {}).then(() => true, () => false);
if (live) throw new Error(`${account} already has a Nearverse contract with saved state. Deploy to a new account, such as a fresh sub-account, and update GAME_CONTRACT.`);
console.log(`Deploying ${(wasm.length / 1024).toFixed(0)} KB to ${account}`);
await near.transaction(account).deployContract(account, wasm).functionCall(account, "new", { config, owner_id: process.env.NEARVERSE_OWNER_ACCOUNT || account }, { gas: "300 Tgas" }).send({ waitUntil: "FINAL" });
// A failed deploy or `new` has already thrown above. The RPC node answering this read can still be a moment behind.
let tick: number | undefined;
for (let attempt = 1; tick === undefined; attempt++) {
  try {
    tick = (await near.view<{ tick: number }>(account, "get_market", {})).tick;
  } catch (error) {
    if (attempt === 10) throw error;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
console.log("Done. Tick:", tick);
console.log(`Now set GAME_CONTRACT=${account} in .env and restart the web service`);
