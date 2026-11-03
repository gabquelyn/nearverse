// NEAR Auth (Google, Apple, email, passkeys) on testnet, adding a restricted session key.
// STATUS: follows the published docs and SDK source, but has not yet run against real testnet. /signin reports each step.
import { CONTRACT, SESSION_METHODS, implicitAccountId, loadSession, saveSession } from "./client";
import { generateKey } from "near-kit";
import { publicConfig } from "./config";

const CLIENT_ID = publicConfig().fastAuthClientId || "np8paqIpMWmNbzT4xAvOOapZBjsOpptl"; // shared testnet client from the NEAR Auth docs
const RPC = publicConfig().rpcUrl || "https://test.rpc.fastnear.com";
const PENDING = "nearverse.pendingKey.v1";

export const pendingKind = (): string | null => { try { const p = JSON.parse(localStorage.getItem(PENDING) ?? "null"); return p ? (p.kind ?? "key") : null; } catch { return null; } };

async function load() {
  const [{ FastAuthClient, FastAuthSignature }, { JavascriptProvider }, nearApi] = await Promise.all([
    import("@fast-auth-near/browser-sdk"), import("@fast-auth-near/javascript-provider"), import("near-api-js"),
  ]);
  const connection = nearApi.Connection.fromConfig({ networkId: "testnet", provider: { type: "JsonRpcProvider", args: { url: RPC } }, signer: { type: "InMemorySigner", keyStore: new nearApi.keyStores.InMemoryKeyStore() } });
  const provider = new JavascriptProvider({ network: "testnet", clientId: CLIENT_ID } as never);
  const client = new FastAuthClient(provider as never, connection as never, { fastAuthContractId: "fast-auth.testnet", mpcContractId: "v1.signer-prod.testnet" } as never);
  return { client, provider, nearApi, connection, FastAuthSignature };
}
// One client per page. It keeps the signed-in user in memory, so a second client would see nobody signed in.
let ready: ReturnType<typeof load> | undefined;
const setup = () => (ready ??= load());

// The SDK starts the redirect, then reads the user, who isn't known yet if this page load has no sign-in. The page is leaving, so that isn't a failure.
const leaving = (start: Promise<unknown>) => start.catch((e: Error) => { if (e.message !== "USER_NOT_LOGGED_IN") throw e; });
const leaveForApproval = (provider: Awaited<ReturnType<typeof setup>>["provider"], transaction: unknown) =>
  leaving((provider.requestTransactionSignature as (o: unknown) => Promise<unknown>)({ transaction, redirectUri: location.origin }));

export async function login(log: (s: string) => void) {
  const { client, provider } = await setup();
  if (await provider.isLoggedIn()) {
    const signer = await client.getSigner();
    const pub = (await signer.getPublicKey()).toString();
    return { accountId: implicitAccountId(pub), pub };
  }
  // A full-page redirect, because browsers often block popups opened after any waiting. The shared testnet login rejects /signin as a return address, so it returns to the home page, which forwards to /signin.
  log("Going to the sign-in page.");
  await leaving((client.login as (o: unknown) => Promise<unknown>)({ redirectUri: location.origin }));
  return null;
}

export async function accountExists(accountId: string) {
  const { connection } = await setup();
  try { await (connection.provider.query as (a: unknown) => Promise<unknown>)({ request_type: "view_account", finality: "final", account_id: accountId }); return true; } catch { return false; }
}

export async function fund(accountId: string, log: (s: string) => void) {
  const res = await fetch("/api/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId }) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  log("Test funds sent. The account now exists on testnet.");
}

function buildAddKey(nearApi: Awaited<ReturnType<typeof setup>>["nearApi"], accountId: string, pub: string, sessionPub: string, nonce: bigint, blockHash: Uint8Array) {
  const { transactions, utils } = nearApi;
  return transactions.createTransaction(accountId, utils.PublicKey.from(pub), accountId, nonce, [
    transactions.addKey(utils.PublicKey.from(sessionPub), transactions.functionCallAccessKey(CONTRACT, SESSION_METHODS, 250000000000000000000000n)),
  ], blockHash);
}

function buildBuyCredits(nearApi: Awaited<ReturnType<typeof setup>>["nearApi"], accountId: string, pub: string, yocto: bigint, nonce: bigint, blockHash: Uint8Array) {
  return nearApi.transactions.createTransaction(accountId, nearApi.utils.PublicKey.from(pub), CONTRACT, nonce, [nearApi.transactions.functionCall("buy_credits", new Uint8Array(), 60000000000000n, yocto)], blockHash);
}

/** Buying credits attaches NEAR, which a game key can't do, so a signed-in player approves it once per purchase. */
export async function requestBuyCredits(nearAmount: number, log: (s: string) => void) {
  const { provider, nearApi, connection } = await setup();
  const accountId = loadSession()?.accountId;
  if (!accountId) throw new Error("Sign in first.");
  const pub = `ed25519:${nearApi.utils.serialize.base_encode(Uint8Array.from(accountId.match(/../g)!.map((h) => parseInt(h, 16))))}`; // an implicit account's name is its key
  const keyInfo = await (connection.provider.query as (a: unknown) => Promise<{ nonce: number | bigint; block_hash: string }>)({ request_type: "view_access_key", finality: "final", account_id: accountId, public_key: pub });
  const yocto = BigInt(Math.round(nearAmount * 1e6)) * 10n ** 18n, nonce = BigInt(keyInfo.nonce) + 1n;
  const transaction = buildBuyCredits(nearApi, accountId, pub, yocto, nonce, nearApi.utils.serialize.base_decode(keyInfo.block_hash));
  localStorage.setItem(PENDING, JSON.stringify({ kind: "credits", accountId, pub, nonce: nonce.toString(), blockHash: keyInfo.block_hash, yocto: yocto.toString() }));
  log("Requesting one approval to buy credits.");
  await leaveForApproval(provider, transaction);
}

/** A key that was just added takes a few seconds to appear in final state, and RPC nodes can lag behind that. */
async function waitForKey(provider: unknown, accountId: string, publicKey: string) {
  const query = (provider as { query: (a: unknown) => Promise<{ nonce: number | bigint; block_hash: string }> }).query.bind(provider);
  for (let attempt = 1; ; attempt++) {
    try {
      return await query({ request_type: "view_access_key", finality: "final", account_id: accountId, public_key: publicKey });
    } catch (error) {
      if (attempt === 15) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

/** Step 3: asks for the one approval. This usually redirects away and comes back to /signin. */
export async function requestSessionKey(accountId: string, pub: string, log: (s: string) => void) {
  const { provider, nearApi, connection } = await setup();
  const keyInfo = await waitForKey(connection.provider, accountId, pub);
  const nonce = BigInt(keyInfo.nonce) + 1n;
  const session = generateKey();
  const blockHash = nearApi.utils.serialize.base_decode(keyInfo.block_hash);
  const transaction = buildAddKey(nearApi, accountId, pub, session.publicKey.toString(), nonce, blockHash);
  localStorage.setItem(PENDING, JSON.stringify({ accountId, pub, nonce: nonce.toString(), blockHash: keyInfo.block_hash, sessionPub: session.publicKey.toString(), sessionSecret: session.secretKey }));
  log("Requesting one approval to add the game key.");
  await leaveForApproval(provider, transaction);
}

export const clearPending = () => { try { localStorage.removeItem(PENDING); } catch { /* nothing stored */ } };
export const hasPending = () => { try { return Boolean(localStorage.getItem(PENDING)); } catch { return false; } };

/** Step 4: after approval, relays the MPC sign call, attaches the signature and broadcasts AddKey. */
export async function finishSessionKey(log: (s: string) => void) {
  const pending = JSON.parse(localStorage.getItem(PENDING) ?? "null");
  if (!pending) throw new Error("No pending approval. Start from step 1.");
  const { client, provider, nearApi, connection, FastAuthSignature } = await setup();
  await provider.isLoggedIn(); // reads the approval out of the return address
  const signer = await client.getSigner();
  const { signatureRequest } = (await signer.getSignatureRequest()) as { signatureRequest: unknown };
  const action = (await (signer.createSignAction as (r: unknown, o: unknown) => Promise<{ functionCall: { methodName: string; args: Uint8Array; gas: bigint; deposit: bigint } }>)(signatureRequest, { deposit: 1n })).functionCall;
  log("Approved. Asking the MPC network to sign.");
  const res = await fetch("/api/relay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ methodName: action.methodName, argsBase64: btoa(String.fromCharCode(...action.args)), gas: action.gas.toString(), deposit: action.deposit.toString() }) });
  const body = await res.json();
  if (!res.ok || !body.signatureBase64) throw new Error(body.error ?? "The MPC sign call returned no signature.");
  const blockHash = nearApi.utils.serialize.base_decode(pending.blockHash);
  const transaction = pending.kind === "credits"
    ? buildBuyCredits(nearApi, pending.accountId, pending.pub, BigInt(pending.yocto), BigInt(pending.nonce), blockHash)
    : buildAddKey(nearApi, pending.accountId, pending.pub, pending.sessionPub, BigInt(pending.nonce), blockHash);
  await signer.sendTransaction(transaction as never, FastAuthSignature.fromBase64(body.signatureBase64) as never, "ed25519" as never);
  if (pending.kind === "credits") { localStorage.removeItem(PENDING); log("Credits bought."); return pending.accountId as string; }
  await waitForKey(connection.provider, pending.accountId, pending.sessionPub); // the game's first move needs this key
  saveSession({ accountId: pending.accountId, secretKey: pending.sessionSecret, kind: "login" });
  localStorage.removeItem(PENDING);
  log("Session key added. Every game action from now on signs silently.");
  return pending.accountId as string;
}
