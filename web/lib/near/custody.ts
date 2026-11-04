// Server only. Works out a signed-in player's NEAR key from a server secret and their email, so nothing is stored, and signs a short list of actions for them.
// The server can act for every Google player, which is the trade-off the README states. It never signs anything else.
import { createHmac, createPrivateKey, createPublicKey } from "node:crypto";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58(bytes: Uint8Array) {
  let n = 0n; for (const b of bytes) n = (n << 8n) + BigInt(b);
  let out = ""; while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = "1" + out; }
  return out;
}

const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
/** The same secret and email always give the same key. */
export function deriveKey(email: string, secret: string) {
  const seed = createHmac("sha256", secret).update(`nearverse-wallet-v2:${email}`).digest();
  const key = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
  const pub = (createPublicKey(key).export({ format: "der", type: "spki" }) as Buffer).subarray(-32);
  return { secretKey: `ed25519:${base58(Buffer.concat([seed, pub]))}`, publicKey: `ed25519:${base58(pub)}` };
}

/** Asks Google to check the sign-in token, and that it was issued for this app. Returns the player's verified email, so Google and an email code reach the same wallet. */
export async function verifyGoogle(credential: unknown, clientId: string | undefined): Promise<string | null> {
  if (typeof credential !== "string" || credential.length > 4096 || !clientId) return null;
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!res.ok) return null;
  const t = await res.json() as { aud?: string; email?: string; email_verified?: string; exp?: string };
  if (t.aud !== clientId || !t.email || t.email_verified !== "true" || Number(t.exp) * 1000 < Date.now()) return null;
  return t.email.toLowerCase();
}

export const validUsername = (u: unknown): u is string => typeof u === "string" && /^[a-z0-9][a-z0-9_-]{2,19}$/.test(u) && !/[_-]{2}|[_-]$/.test(u);
export const validPublicKey = (k: unknown): k is string => typeof k === "string" && /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(k);

export async function rpcQuery(rpc: string, params: object): Promise<Record<string, unknown> | null> {
  const res = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "q", method: "query", params: { finality: "optimistic", ...params } }) });
  const body = await res.json() as { result?: Record<string, unknown> & { error?: string } };
  return !body.result || body.result.error ? null : body.result;
}
export const accountExists = async (rpc: string, id: string) => Boolean(await rpcQuery(rpc, { request_type: "view_account", account_id: id }));
export const keyOnAccount = async (rpc: string, id: string, publicKey: string) => Boolean(await rpcQuery(rpc, { request_type: "view_access_key", account_id: id, public_key: publicKey }));

/** Best effort, so a returning player on a new device skips the username screen. If this fails, they just type their username. */
export async function findAccount(publicKey: string, parent: string): Promise<string | null> {
  try {
    const res = await fetch(`https://test.api.fastnear.com/v0/public_key/${encodeURIComponent(publicKey)}`);
    if (!res.ok) return null;
    const body = await res.json() as { account_ids?: string[] };
    return body.account_ids?.find((a) => a.endsWith(`.${parent}`)) ?? null;
  } catch { return null; }
}
