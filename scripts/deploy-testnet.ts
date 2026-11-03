// Deploys out/nearverse.wasm to NEARVERSE_DEPLOYER_ACCOUNT and initializes it from the rules file.
// You run this. It signs testnet transactions with the key in .env.
import { readFileSync } from "node:fs";
import { Near } from "near-kit";
const root = new URL("..", import.meta.url).pathname;
const { NEARVERSE_DEPLOYER_ACCOUNT: account, NEARVERSE_DEPLOYER_PRIVATE_KEY: key } = process.env;
if (!account || !key) throw new Error("Set NEARVERSE_DEPLOYER_ACCOUNT and NEARVERSE_DEPLOYER_PRIVATE_KEY in .env");
if (!account.endsWith(".testnet")) throw new Error("This script only deploys to testnet.");
const near = new Near({ network: "testnet", privateKey: key as `ed25519:${string}`, defaultSignerId: account });
const wasm = readFileSync(root + "out/nearverse.wasm");
const config = JSON.parse(readFileSync(root + "packages/economy/generated/rules.json", "utf8"));
const live = await near.view(account, "get_genesis_ms", {}).then(() => true, () => false);
if (live) throw new Error(`${account} already has a Nearverse contract with saved state. Deploy to a new account, such as a fresh sub-account, and update GAME_CONTRACT.`);
console.log(`Deploying ${(wasm.length / 1024).toFixed(0)} KB to ${account}`);
await near.transaction(account).deployContract(account, wasm).functionCall(account, "new", { config }, { gas: "100 Tgas" }).send();
console.log("Done. Tick:", (await near.view<{ tick: number }>(account, "get_market", {})).tick);
console.log(`Now set GAME_CONTRACT=${account} in .env and restart the web service`);
