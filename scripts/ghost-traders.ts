// Labeled simulated traders using real testnet transactions, so the live market moves with few players.
// Each is a clearly named sub-account: ghost-1.<deployer> and so on. You run this; it spends testnet NEAR.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Near, generateKey } from "near-kit";
const { NEARVERSE_DEPLOYER_ACCOUNT: account, NEARVERSE_DEPLOYER_PRIVATE_KEY: key, GAME_CONTRACT: contract, NEARVERSE_GHOST_KEY_FILE: file = ".ghost-keys.json", NEARVERSE_GHOST_STATUS_FILE: statusFile = ".ghost-status.json" } = process.env;
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SPEED = 22; // world units a second, about a normal drive
type Spot = { x: number; z: number };
const by = (from: Spot) => (a: Spot, b: Spot) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z);

// Shows the drive to anyone in the world. Without an Ably key, the trades still run and only the cars are missing.
async function announce(id: string, n: string, from: Spot, to: Spot, ms: number, at: number) {
  const ably = process.env.ABLY_API_KEY;
  if (!ably) return;
  const data = JSON.stringify({ id, n, k: 0, fx: from.x, fz: from.z, tx: to.x, tz: to.z, at, ms });
  await fetch("https://rest.ably.io/channels/nearverse:ghosts/messages", { method: "POST", headers: { authorization: `Basic ${Buffer.from(ably).toString("base64")}`, "content-type": "application/json" }, body: JSON.stringify({ name: "trip", data, encoding: "json" }) }).catch(() => {});
}

let trades = 0, failures = 0;
const heartbeat = () => writeFileSync(statusFile, JSON.stringify({ at: Date.now(), ghosts: ghosts.length, trades, failures }));

async function topUp(g: { id: string; near: Near }) {
  if (Number(await g.near.getBalance(g.id)) >= 0.1) return;
  if (Number(await root.getBalance(account!)) < 2) { console.log(g.id, "is low on NEAR and so is the deployer. Top up", account); return; }
  await root.send(g.id, 300000000000000000000000n); console.log(g.id, "topped up with 0.3 NEAR");
}

async function drive(g: { id: string; near: Near }, index: number) {
  const name = `Ghost ${index + 1} (simulated)`;
  let at: Spot = { x: (index - 1.5) * 12, z: 14 };
  await sleep(index * 5000);
  for (;;) {
    try {
      await topUp(g);
      const p = await g.near.view<{ items: number[]; fuel: number }>(contract!, "get_player", { account_id: g.id });
      const held = p.items.map((q, i) => ({ q, i })).filter((x) => x.q >= 3);
      if (p.fuel < 4) { await g.near.call(contract!, "refuel", { units: 10 }, { gas: "60 Tgas" }); console.log(g.id, "refueled"); }
      else {
        const selling = held.length > 0 && Math.random() < 0.5;
        const merchants = rules.merchants as Spot[], nodes = rules.nodes as Spot[];
        const target = selling ? pick([...merchants].sort(by(at)).slice(0, 2)) : pick([...nodes].sort(by(at)).slice(0, 6));
        const ms = Math.round(Math.max(3, Math.hypot(target.x - at.x, target.z - at.z) / SPEED) * 1000);
        await announce(g.id, name, at, target, ms, Date.now());
        await sleep(ms);
        at = target;
        if (selling) {
          const h = pick(held), merchant = merchants.indexOf(target);
          await g.near.call(contract!, "sell", { merchant, item: h.i, qty: Math.min(h.q, 6), min_total: 0 }, { gas: "60 Tgas" });
          console.log(g.id, "sold", rules.items[h.i].id);
        } else {
          await g.near.call(contract!, "gather", { node: nodes.indexOf(target) }, { gas: "60 Tgas" });
          console.log(g.id, "gathered");
        }
        trades++;
      }
    } catch (e) { failures++; console.log(g.id, "skipped:", String((e as Error).message).match(/[A-Z_]{6,}/)?.[0] ?? "network"); }
    heartbeat();
    await sleep(20_000); // parked for a moment, which also keeps gas spending down
  }
}

heartbeat();
console.log(`Running ${ghosts.length} ghost traders${process.env.ABLY_API_KEY ? ", visible in the world" : " (add ABLY_API_KEY to see their cars)"}. Ctrl-C to stop.`);
await Promise.all(ghosts.map(drive));
