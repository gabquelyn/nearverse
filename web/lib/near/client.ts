// Chain access. Every game call is signed in the browser with a key that needs no popup.
import { Near, generateKey } from "near-kit";
import { rules, type Market, type Player } from "@nearverse/economy";
import { publicConfig } from "./config";

// Settings arrive at run time (see app/layout.tsx), so one image can point at any contract.
export const CONTRACT = publicConfig().contract;
export const NETWORK = publicConfig().network as "testnet";
export const RPC_URL = publicConfig().rpcUrl;
export const chainEnabled = () => Boolean(CONTRACT);
export { SESSION_METHODS } from "./methods";
const SESSION_KEY = "nearverse.session.v1";

export interface Session { accountId: string; secretKey: string; kind: "guest" | "login" | "google"; contract?: string }

export function loadSession(): Session | null {
  try {
    const s: Session | null = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    // A signed-in player's game key only works with the contract it was made for, so a new contract needs a new key.
    if (s && s.kind !== "guest" && s.contract !== CONTRACT) { localStorage.removeItem(SESSION_KEY); oldKeyDropped = true; return null; }
    return s;
  } catch { return null; }
}
let oldKeyDropped = false;
/** True once, after a game key for an older contract was thrown away. */
export const tookOldKey = () => { const was = oldKeyDropped; oldKeyDropped = false; return was; };
/** Plain words for an error near-kit reports only as "Server error". */
export function errorDetail(e: unknown) {
  const err = e as { message?: string; details?: unknown; data?: unknown } | null;
  let extra = "";
  try { extra = JSON.stringify(err?.details ?? err?.data ?? "").replace(/[{}"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160); } catch { /* the message alone will do */ }
  return [String(err?.message ?? e), extra].filter(Boolean).join(": ");
}
export function saveSession(s: Session | null) {
  try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, contract: CONTRACT })); else localStorage.removeItem(SESSION_KEY); } catch { /* private window */ }
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58ToHex(s: string): string {
  let n = 0n;
  for (const ch of s) { const i = B58.indexOf(ch); if (i < 0) throw new Error("bad base58"); n = n * 58n + BigInt(i); }
  return n.toString(16).padStart(64, "0");
}
/** An implicit NEAR account id is the hex of its ed25519 public key. */
export const implicitAccountId = (publicKey: string) => base58ToHex(publicKey.replace(/^ed25519:/, ""));

/** Long implicit ids become 053a49...9f27ef. Named accounts stay readable. */
export const shortAccount = (id: string) => (id.length > 20 ? `${id.slice(0, 6)}...${id.slice(-6)}` : id);

const reader = () => new Near({ network: NETWORK, rpcUrl: RPC_URL } as ConstructorParameters<typeof Near>[0]);
const signer = (s: Session) => new Near({ network: NETWORK, rpcUrl: RPC_URL, privateKey: s.secretKey as `ed25519:${string}`, defaultSignerId: s.accountId } as ConstructorParameters<typeof Near>[0]);

/** Spendable NEAR, or null if the account doesn't exist yet. */
export const fetchBalance = (accountId: string) => reader().getBalance(accountId).catch(() => null);
export const fetchMarket = () => reader().view<Market>(CONTRACT, "get_market", {});
export const fetchGenesis = () => reader().view<number>(CONTRACT, "get_genesis_ms", {});
export const fetchPlayer = (accountId: string) => reader().view<Player | null>(CONTRACT, "get_player", { account_id: accountId });
export const fetchLeaderboard = () => reader().view<{ account_id: string; net_worth: number; sections_built: number }[]>(CONTRACT, "leaderboard", { limit: 200 });

const KNOWN = /(ALREADY_STARTED|NOT_STARTED|BAD_NODE|COOLDOWN|TRUCK_DAMAGED|OUT_OF_FUEL|NODE_EMPTY|CARGO_FULL|BAD_MERCHANT|TRAVELING|BAD_ITEM|BAD_QTY|NOT_ENOUGH_ITEMS|PRICE_MOVED|MERCHANT_OUT_OF_CASH|MERCHANT_OUT_OF_STOCK|NOT_ENOUGH_COINS|NOTHING_TO_REPAIR|BAD_BLUEPRINT|BLUEPRINT_DONE|DEPOSIT_TOO_SMALL|NOT_ENOUGH_CREDITS|NOT_BUILT|ALREADY_BUILT|BAD_VEHICLE|ALREADY_OWNED|NOT_OWNED|BAD_LOT|LOT_TAKEN|NO_STALL|YOUR_OWN_STALL|NOT_YOUR_STALL|BAD_SPREAD|NOT_FOR_SALE|STALL_NOT_EMPTY|MERCHANT_CLOSED|INVESTORS_FULL|NOTHING_TO_COLLECT)/;
export function errorCode(e: unknown) {
  const err = e as { message?: string; details?: unknown; data?: unknown } | null;
  let text = String(err?.message ?? e);
  try { text += JSON.stringify(err?.details ?? err?.data ?? ""); } catch { /* the message alone will do */ }
  if (/ReceiverMismatch|MethodNameMismatch/.test(text)) return "OLD_KEY";
  if (/allowance/i.test(text)) return "KEY_ALLOWANCE"; // the game key has used up its gas allowance
  if (/NotEnoughBalance|InsufficientBalance|insufficient balance|LackBalance/i.test(text)) return "NO_BALANCE";
  return text.match(KNOWN)?.[1] ?? "NETWORK";
}

export interface TxResult { hash: string | null }
export async function callGame(s: Session, method: string, args: object, opts: { deposit?: string } = {}): Promise<TxResult> {
  const out = await signer(s).call(CONTRACT, method, args as Record<string, unknown>, { gas: "60 Tgas", ...(opts.deposit ? { attachedDeposit: opts.deposit as never } : {}) });
  return { hash: (out as { transaction?: { hash?: string } })?.transaction?.hash ?? null };
}

/** No-wallet path: a throwaway key in this browser, funded through the game treasury. */
export async function createGuest(): Promise<Session> {
  const key = generateKey();
  const accountId = implicitAccountId(key.publicKey.toString());
  const res = await fetch("/api/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Test funds are unavailable right now.");
  const session: Session = { accountId, secretKey: key.secretKey, kind: "guest" };
  saveSession(session);
  return session;
}

/** Sends test NEAR from the treasury. Returns when another can be taken, as a timestamp. */
export async function dripNear(accountId: string): Promise<{ nextAt?: number; error?: string }> {
  const res = await fetch("/api/drip", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId }) });
  const body = await res.json().catch(() => ({ error: "Test funds are unavailable right now." }));
  return res.ok ? { nextAt: body.nextAt } : { nextAt: body.nextAt, error: body.error };
}

export const explorerTx = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;
export const blockedRulesCheck = rules.items.length;
