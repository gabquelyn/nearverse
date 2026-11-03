// Chain access. Every game call is signed in the browser with a key that needs no popup.
import { Near, generateKey } from "near-kit";
import { rules, type Market, type Player } from "@nearverse/economy";
import { publicConfig } from "./config";

// Settings arrive at run time (see app/layout.tsx), so one image can point at any contract.
export const CONTRACT = publicConfig().contract;
export const NETWORK = publicConfig().network as "testnet";
export const RPC_URL = publicConfig().rpcUrl;
export const chainEnabled = () => Boolean(CONTRACT);
export const SESSION_METHODS = ["start_game", "gather", "sell", "buy", "repair", "refuel", "burn_fuel", "build_section", "take_damage", "buy_vehicle", "select_vehicle", "claim_lot", "build_stall", "stall_sell", "stall_buy", "stall_stock", "stall_unstock", "stall_fund", "stall_collect", "stall_spread", "stall_list", "stall_buy_listed", "stall_sell_to_city"];
const SESSION_KEY = "nearverse.session.v1";

export interface Session { accountId: string; secretKey: string; kind: "guest" | "login" }

export function loadSession(): Session | null {
  try { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function saveSession(s: Session | null) {
  try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch { /* private window */ }
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58ToHex(s: string): string {
  let n = 0n;
  for (const ch of s) { const i = B58.indexOf(ch); if (i < 0) throw new Error("bad base58"); n = n * 58n + BigInt(i); }
  return n.toString(16).padStart(64, "0");
}
/** An implicit NEAR account id is the hex of its ed25519 public key. */
export const implicitAccountId = (publicKey: string) => base58ToHex(publicKey.replace(/^ed25519:/, ""));

const reader = () => new Near({ network: NETWORK, rpcUrl: RPC_URL } as ConstructorParameters<typeof Near>[0]);
const signer = (s: Session) => new Near({ network: NETWORK, rpcUrl: RPC_URL, privateKey: s.secretKey as `ed25519:${string}`, defaultSignerId: s.accountId } as ConstructorParameters<typeof Near>[0]);

export const fetchMarket = () => reader().view<Market>(CONTRACT, "get_market", {});
export const fetchGenesis = () => reader().view<number>(CONTRACT, "get_genesis_ms", {});
export const fetchPlayer = (accountId: string) => reader().view<Player | null>(CONTRACT, "get_player", { account_id: accountId });
export const fetchLeaderboard = () => reader().view<{ account_id: string; net_worth: number; sections_built: number }[]>(CONTRACT, "leaderboard", { limit: 200 });

const KNOWN = /(ALREADY_STARTED|NOT_STARTED|BAD_NODE|COOLDOWN|TRUCK_DAMAGED|OUT_OF_FUEL|NODE_EMPTY|CARGO_FULL|BAD_MERCHANT|TRAVELING|BAD_ITEM|BAD_QTY|NOT_ENOUGH_ITEMS|PRICE_MOVED|MERCHANT_OUT_OF_CASH|MERCHANT_OUT_OF_STOCK|NOT_ENOUGH_COINS|NOTHING_TO_REPAIR|BAD_BLUEPRINT|BLUEPRINT_DONE|DEPOSIT_TOO_SMALL|NOT_ENOUGH_CREDITS|NOT_BUILT|ALREADY_BUILT|BAD_VEHICLE|ALREADY_OWNED|NOT_OWNED|BAD_LOT|LOT_TAKEN|NO_STALL|YOUR_OWN_STALL|NOT_YOUR_STALL|BAD_SPREAD|NOT_FOR_SALE|STALL_NOT_EMPTY)/;
export const errorCode = (e: unknown) => String((e as Error)?.message ?? e).match(KNOWN)?.[1] ?? "NETWORK";

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

export const explorerTx = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;
export const blockedRulesCheck = rules.items.length;
