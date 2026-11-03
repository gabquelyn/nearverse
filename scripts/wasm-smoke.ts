// Runs the compiled wasm in Node with a small mock of the NEAR host functions, no network needed.
import { createHash } from "node:crypto";
// It proves the binary instantiates, deserializes rules and plays. It does not measure gas: use the testnet for that.
import { readFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname;
const wasm = new WebAssembly.Module(readFileSync(root + "out/nearverse.wasm"));
const rules = readFileSync(root + "packages/economy/generated/rules.json", "utf8");
const te = new TextEncoder(), td = new TextDecoder();
const store = new Map<string, Uint8Array>();
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
let mem: WebAssembly.Memory;
const regs = new Map<bigint, Uint8Array>();
let ctx = { who: "a.testnet", input: new Uint8Array(), ms: 0n, attached: 0n };
let ret: Uint8Array | null = null;
const logs: string[] = [];
const bytes = (len: bigint, ptr: bigint) => {
  if (len === 0xffffffffffffffffn) return regs.get(ptr)!;
  return new Uint8Array(mem.buffer, Number(ptr), Number(len)).slice();
};
const write = (ptr: bigint, b: Uint8Array) => new Uint8Array(mem.buffer, Number(ptr), b.length).set(b);
const u128 = (v: bigint) => { const a = new Uint8Array(16); new DataView(a.buffer).setBigUint64(0, v & 0xffffffffffffffffn, true); new DataView(a.buffer).setBigUint64(8, v >> 64n, true); return a; };
const unimplemented = new Set<string>();
const host: Record<string, Function> = {
  read_register: (r: bigint, p: bigint) => write(p, regs.get(r)!),
  register_len: (r: bigint) => (regs.has(r) ? BigInt(regs.get(r)!.length) : 0xffffffffffffffffn),
  write_register: (r: bigint, l: bigint, p: bigint) => { regs.set(r, bytes(l, p)); },
  current_account_id: (r: bigint) => { regs.set(r, te.encode("game.testnet")); },
  signer_account_id: (r: bigint) => { regs.set(r, te.encode(ctx.who)); },
  predecessor_account_id: (r: bigint) => { regs.set(r, te.encode(ctx.who)); },
  input: (r: bigint) => { regs.set(r, ctx.input); },
  block_timestamp: () => ctx.ms * 1_000_000n,
  block_index: () => 1n,
  attached_deposit: (p: bigint) => write(p, u128(ctx.attached)),
  account_balance: (p: bigint) => write(p, u128(10n ** 26n)),
  storage_usage: () => 1000n,
  prepaid_gas: () => 300_000_000_000_000n,
  used_gas: () => 1_000_000n,
  value_return: (l: bigint, p: bigint) => { ret = bytes(l, p); },
  panic: () => { throw new Error("panic"); },
  panic_utf8: (l: bigint, p: bigint) => { throw new Error(td.decode(bytes(l, p))); },
  log_utf8: (l: bigint, p: bigint) => { logs.push(td.decode(bytes(l, p))); },
  storage_write: (kl: bigint, kp: bigint, vl: bigint, vp: bigint, r: bigint) => { const k = hex(bytes(kl, kp)); const old = store.get(k); store.set(k, bytes(vl, vp)); if (old) { regs.set(r, old); return 1n; } return 0n; },
  storage_read: (kl: bigint, kp: bigint, r: bigint) => { const v = store.get(hex(bytes(kl, kp))); if (v) { regs.set(r, v); return 1n; } return 0n; },
  storage_remove: (kl: bigint, kp: bigint, r: bigint) => { const k = hex(bytes(kl, kp)); const v = store.get(k); if (v) { regs.set(r, v); store.delete(k); return 1n; } return 0n; },
  storage_has_key: (kl: bigint, kp: bigint) => (store.has(hex(bytes(kl, kp))) ? 1n : 0n),
  sha256: (l: bigint, p: bigint, r: bigint) => { regs.set(r, new Uint8Array(createHash("sha256").update(bytes(l, p)).digest())); },
  keccak256: () => { throw new Error("unused"); },
};
const env: Record<string, Function> = {};
for (const imp of WebAssembly.Module.imports(wasm)) {
  env[imp.name] = host[imp.name] ?? ((..._: unknown[]) => { unimplemented.add(imp.name); throw new Error("host function not mocked: " + imp.name); });
}
function call(method: string, args: object, who = "a.testnet", attached = 0n, ms = 100_000n) {
  // A fresh instance each call, like the real runtime.
  const inst = new WebAssembly.Instance(wasm, { env: env as any });
  mem = inst.exports.memory as WebAssembly.Memory;
  regs.clear(); ret = null; logs.length = 0;
  ctx = { who, input: te.encode(JSON.stringify(args)), ms, attached };
  (inst.exports[method] as Function)();
  return ret ? JSON.parse(td.decode(ret)) : null;
}
function expectFail(code: string, f: () => unknown) {
  try { f(); } catch (e) { if (String(e).includes(code)) return; throw e; }
  throw new Error("expected " + code);
}
const check = (name: string, cond: boolean) => { if (!cond) throw new Error("FAILED: " + name); console.log("ok  " + name); };

const exports_ = WebAssembly.Module.exports(wasm).map((e) => e.name);
for (const m of ["mt_transfer", "mt_batch_transfer", "mt_transfer_call", "mt_batch_transfer_call", "mt_token", "mt_balance_of", "mt_batch_balance_of", "mt_supply", "mt_batch_supply", "mt_resolve_transfer"])
  check("exports " + m, exports_.includes(m));
call("new", { config: JSON.parse(rules) }, "game.testnet", 0n, 0n);
check("init stored state", store.size > 0);
call("start_game", {});
check("start_game grants coins", call("get_player", { account_id: "a.testnet" }).coins === JSON.parse(rules).start_coins);
const qty = call("gather", { node: 0 });
check("gather mints NEP-245", qty === 3 && logs.some((l) => l.includes('"nep245"')));
check("balance view", call("mt_balance_of", { account_id: "a.testnet", token_id: "wood" }) === "3");
const q = call("quote", { merchant: 0, item: 0 });
const paid = call("sell", { merchant: 0, item: 0, qty: 3, min_total: 1 }, "a.testnet", 0n, 110_000n);
check("sell pays and burns", paid > 0 && paid <= q.bid * 3 && logs.some((l) => l.includes("mt_burn")));
expectFail("PRICE_MOVED", () => call("sell", { merchant: 0, item: 4, qty: 1, min_total: 1000000000 }, "a.testnet", 0n, 110_000n));
expectFail("OVER_DEPOSIT_CAP", () => call("withdraw", { cents: 1 }, "a.testnet", 1n));
check("error codes reach the client", true);
const later = call("get_market", {}, "a.testnet", 0n, 3_600_000n);
check("views catch up on time", later.tick === 6);
check("board lists player", call("leaderboard", {}).length === 1);
console.log(`\nWasm smoke passed: ${(readFileSync(root + "out/nearverse.wasm").length / 1024).toFixed(0)} KB, ${WebAssembly.Module.imports(wasm).length} host imports.`);
