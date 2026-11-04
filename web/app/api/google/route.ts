// Wallet actions for Google and email sign-in. Every request carries a fresh Google token or email proof, and only these actions exist. There is no way to ask it to sign anything else.
import { NextResponse } from "next/server";
import { Near } from "near-kit";
import { SESSION_METHODS } from "@/lib/near/methods";
import { readEmailProof } from "@/lib/near/email";
import { accountExists, deriveKey, findAccount, keyOnAccount, validPublicKey, validUsername, verifyGoogle } from "@/lib/near/custody";

const FUNDING = "0.25 NEAR", ALLOWANCE = "0.25 NEAR";
const no = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_LOGIN_SECRET: secret, GOOGLE_PARENT_ACCOUNT: parent, GOOGLE_PARENT_PRIVATE_KEY: parentKey, GAME_CONTRACT: contract } = process.env;
  if (!secret || !parent || !parentKey || !contract) return no("Sign-in is not set up on this server.", 503);
  if ((process.env.NEAR_NETWORK || "testnet") !== "testnet") return no("Google sign-in only runs on testnet.", 403);
  const rpcUrl = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
  const body = await req.json().catch(() => ({})) as { credential?: unknown; action?: unknown; username?: unknown; accountId?: unknown; sessionPub?: unknown; near?: unknown; exportPub?: unknown };
  const email = typeof body.credential === "string" && body.credential.startsWith("email.")
    ? readEmailProof(body.credential, secret)
    : await verifyGoogle(body.credential, clientId).catch(() => null);
  if (!email) return no("We couldn't confirm that sign-in. Try again.", 401);
  const { secretKey, publicKey } = deriveKey(email, secret);
  const as = (accountId: string) => new Near({ network: "testnet", rpcUrl, privateKey: secretKey as `ed25519:${string}`, defaultSignerId: accountId });
  // An account is yours only if your derived key is on it. The name in the request proves nothing by itself.
  const mine = async (id: unknown) => typeof id === "string" && id.endsWith(`.${parent}`) && await keyOnAccount(rpcUrl, id, publicKey);

  try {
    switch (body.action) {
      // The browser's remembered wallet is checked first, since a key index can lag. It only counts if this player's key is on it.
      case "lookup": return NextResponse.json({ accountId: await mine(body.accountId) ? body.accountId : await findAccount(publicKey, parent), parent });
      case "start": {
        if (!validPublicKey(body.sessionPub)) return no("That game key isn't valid.");
        let id: string;
        if (await mine(body.accountId)) id = body.accountId as string;
        else {
          if (!validUsername(body.username)) return no("Use 3 to 20 lowercase letters or numbers. It can include - or _ between them.");
          id = `${body.username}.${parent}`;
          if (await accountExists(rpcUrl, id)) {
            if (!await keyOnAccount(rpcUrl, id, publicKey)) return no("That username is taken. Try another.", 409);
          } else {
            const owner = new Near({ network: "testnet", rpcUrl, privateKey: parentKey as `ed25519:${string}`, defaultSignerId: parent });
            await owner.transaction(parent).createAccount(id).transfer(id, FUNDING).addKey(publicKey, { type: "fullAccess" }).send({ waitUntil: "FINAL" });
          }
        }
        await as(id).transaction(id).addKey(body.sessionPub, { type: "functionCall", receiverId: contract, methodNames: SESSION_METHODS, allowance: ALLOWANCE }).send({ waitUntil: "FINAL" });
        return NextResponse.json({ accountId: id });
      }
      case "credits": {
        const near = Number(body.near);
        if (!(near > 0 && near <= 100)) return no("Enter an amount of NEAR up to 100.");
        if (!await mine(body.accountId)) return no("That isn't your account.", 403);
        await as(body.accountId as string).call(contract, "buy_credits", {}, { gas: "60 Tgas", attachedDeposit: `${near} NEAR` as never });
        return NextResponse.json({ ok: true });
      }
      case "export": {
        if (!validPublicKey(body.exportPub)) return no("That key isn't valid.");
        if (!await mine(body.accountId)) return no("That isn't your account.", 403);
        const id = body.accountId as string;
        await as(id).transaction(id).addKey(body.exportPub, { type: "fullAccess" }).send({ waitUntil: "FINAL" });
        return NextResponse.json({ ok: true });
      }
      default: return no("Unknown action.");
    }
  } catch (e) {
    return no(`NEAR didn't accept that: ${String((e as Error).message).slice(0, 160)}`, 502);
  }
}
