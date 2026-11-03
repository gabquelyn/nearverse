// NEAR Auth (Google, Apple, email, passkeys) on testnet, adding a restricted session key.
// STATUS: follows the published docs but has not yet run against real testnet. /spike runs it step by step.
import { CONTRACT, SESSION_METHODS, implicitAccountId, saveSession } from "./client";
import { generateKey } from "near-kit";
import { publicConfig } from "./config";

const CLIENT_ID = publicConfig().fastAuthClientId || "np8paqIpMWmNbzT4xAvOOapZBjsOpptl"; // shared testnet client from the NEAR Auth docs
const RPC = publicConfig().rpcUrl || "https://rpc.testnet.near.org";
const PENDING = "nearverse.pendingKey.v1";

async function setup() {
  const [{ FastAuthClient, FastAuthSignature }, { JavascriptProvider }, nearApi] = await Promise.all([
    import("@fast-auth-near/browser-sdk"), import("@fast-auth-near/javascript-provider"), import("near-api-js"),
  ]);
  const connection = nearApi.Connection.fromConfig({ networkId: "testnet", provider: { type: "JsonRpcProvider", args: { url: RPC } }, signer: { type: "InMemorySigner", keyStore: new nearApi.keyStores.InMemoryKeyStore() } });
  const provider = new JavascriptProvider({ network: "testnet", clientId: CLIENT_ID } as never);
  const client = new FastAuthClient(provider as never, connection as never, { fastAuthContractId: "fast-auth.testnet", mpcContractId: "v1.signer-prod.testnet" } as never);
  return { client, provider, nearApi, connection, FastAuthSignature };
}

export async function login(log: (s: string) => void) {
  const { client } = await setup();
  log("Opening the login window.");
  await (client.login as (o: unknown) => Promise<unknown>)({});
  const signer = await client.getSigner();
  const pub = (await signer.getPublicKey()).toString();
  const accountId = implicitAccountId(pub);
  log(`Logged in. Your key is ${pub}. Your account is ${accountId}.`);
  return { accountId, pub };
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

/** Step 3: asks for the one approval. This usually redirects away and comes back to /spike. */
export async function requestSessionKey(accountId: string, pub: string, log: (s: string) => void) {
  const { client, nearApi, connection } = await setup();
  const provider = connection.provider;
  const keyInfo = await (provider.query as (a: unknown) => Promise<{ nonce: number | bigint; block_hash: string }>)({ request_type: "view_access_key", finality: "final", account_id: accountId, public_key: pub });
  const nonce = BigInt(keyInfo.nonce) + 1n;
  const session = generateKey();
  const blockHash = nearApi.utils.serialize.base_decode(keyInfo.block_hash);
  const transaction = buildAddKey(nearApi, accountId, pub, session.publicKey.toString(), nonce, blockHash);
  localStorage.setItem(PENDING, JSON.stringify({ accountId, pub, nonce: nonce.toString(), blockHash: keyInfo.block_hash, sessionPub: session.publicKey.toString(), sessionSecret: session.secretKey }));
  log("Requesting one approval to add the game key.");
  const signer = await client.getSigner();
  await (signer.requestTransactionSignature as (o: unknown) => Promise<unknown>)({ transaction, redirectUri: `${location.origin}/spike` });
}

export const hasPending = () => { try { return Boolean(localStorage.getItem(PENDING)); } catch { return false; } };

/** Step 4: after approval, relays the MPC sign call, attaches the signature and broadcasts AddKey. */
export async function finishSessionKey(log: (s: string) => void) {
  const pending = JSON.parse(localStorage.getItem(PENDING) ?? "null");
  if (!pending) throw new Error("No pending approval. Start from step 1.");
  const { client, nearApi, FastAuthSignature } = await setup();
  const signer = await client.getSigner();
  const { signatureRequest } = (await signer.getSignatureRequest()) as { signatureRequest: unknown };
  const action = (await (signer.createSignAction as (r: unknown) => Promise<{ functionCall: { methodName: string; args: Uint8Array; gas: bigint; deposit: bigint } }>)(signatureRequest)).functionCall;
  log("Approved. Asking the MPC network to sign.");
  const res = await fetch("/api/relay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ methodName: action.methodName, argsBase64: btoa(String.fromCharCode(...action.args)), gas: action.gas.toString(), deposit: action.deposit.toString() }) });
  const body = await res.json();
  if (!res.ok || !body.signatureBase64) throw new Error(body.error ?? "The MPC sign call returned no signature.");
  const transaction = buildAddKey(nearApi, pending.accountId, pending.pub, pending.sessionPub, BigInt(pending.nonce), nearApi.utils.serialize.base_decode(pending.blockHash));
  await signer.sendTransaction(transaction as never, FastAuthSignature.fromBase64(body.signatureBase64) as never, "ed25519" as never);
  saveSession({ accountId: pending.accountId, secretKey: pending.sessionSecret, kind: "login" });
  localStorage.removeItem(PENDING);
  log("Session key added. Every game action from now on signs silently.");
  return pending.accountId as string;
}
