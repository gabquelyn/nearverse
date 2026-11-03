// Pays gas for one call: `sign` on the NEAR Auth contract, nothing else. Used only by the login flow in /signin.
import { NextResponse } from "next/server";
import { Near } from "near-kit";

const FAST_AUTH = "fast-auth.testnet";

export async function POST(req: Request) {
  const { NEARVERSE_TREASURY_ACCOUNT: account, NEARVERSE_TREASURY_PRIVATE_KEY: key } = process.env;
  if (!account || !key) return NextResponse.json({ error: "The relayer is not set up. Set the treasury variables in .env." }, { status: 503 });
  const { methodName, argsBase64, gas, deposit } = await req.json().catch(() => ({}));
  if (methodName !== "sign" || typeof argsBase64 !== "string") return NextResponse.json({ error: "Only NEAR Auth sign calls are relayed." }, { status: 400 });
  if (BigInt(deposit ?? 0) > 1n) return NextResponse.json({ error: "Relayed calls can attach at most 1 yocto." }, { status: 400 });
  try {
    const near = new Near({ network: "testnet", rpcUrl: process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com", privateKey: key as `ed25519:${string}`, defaultSignerId: account });
    const out = await near.transaction(account).functionCall(FAST_AUTH, "sign", Buffer.from(argsBase64, "base64"), { gas: `${BigInt(gas ?? 300000000000000n) / 1000000000000n} Tgas` as never, attachedDeposit: `${BigInt(deposit ?? 0)} yocto` as never }).send();
    const status = (out as { status?: { SuccessValue?: string } }).status;
    return NextResponse.json({ signatureBase64: status?.SuccessValue ?? null, outcome: status });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message).slice(0, 400) }, { status: 502 });
  }
}
