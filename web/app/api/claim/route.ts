// Test-funds faucet: sends a small amount of testnet NEAR from the treasury. Testnet only, rate limited.
import { NextResponse } from "next/server";
import { Near } from "near-kit";

const seen = new Map<string, number>();
const WINDOW = 10 * 60_000;

export async function POST(req: Request) {
  const { NEARVERSE_TREASURY_ACCOUNT: account, NEARVERSE_TREASURY_PRIVATE_KEY: key, NEARVERSE_CLAIM_YOCTO: amount } = process.env;
  if (!account || !key) return NextResponse.json({ error: "Test funds are not set up on this server. Use practice mode, or set the treasury variables in .env." }, { status: 503 });
  if ((process.env.NEAR_NETWORK || "testnet") !== "testnet") return NextResponse.json({ error: "The faucet only runs on testnet." }, { status: 403 });
  const { accountId } = await req.json().catch(() => ({ accountId: "" }));
  if (typeof accountId !== "string" || !(/^[0-9a-f]{64}$/.test(accountId) || /^[a-z0-9._-]{2,56}\.testnet$/.test(accountId))) return NextResponse.json({ error: "Enter a valid testnet account." }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const now = Date.now();
  for (const id of [ip, accountId]) if (now - (seen.get(id) ?? 0) < WINDOW && ip !== "local") return NextResponse.json({ error: "Test funds were just claimed. Try again in 10 minutes." }, { status: 429 });
  seen.set(ip, now); seen.set(accountId, now);
  try {
    const near = new Near({ network: "testnet", rpcUrl: process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com", privateKey: key as `ed25519:${string}`, defaultSignerId: account });
    const yocto = amount || "250000000000000000000000";
    await near.send(accountId, BigInt(yocto));
    return NextResponse.json({ accountId, yocto });
  } catch (e) {
    return NextResponse.json({ error: "The treasury could not send test funds: " + String((e as Error).message).slice(0, 160) }, { status: 502 });
  }
}
