// Testnet drip: 0.2 NEAR per account every 10 minutes, paid by the treasury. Limits live in memory, so a restart resets them.
import { NextResponse } from "next/server";
import { Near } from "near-kit";

const YOCTO = "200000000000000000000000";
const TREASURY_FLOOR = 3; // NEAR kept back for new players and sign-in signing
const WINDOW = 10 * 60_000;
const HOURLY_CAP = 12; // stops a burst of made-up accounts emptying the treasury
const seen = new Map<string, number>();
let recent: number[] = [];

export async function POST(req: Request) {
  const { NEARVERSE_TREASURY_ACCOUNT: account, NEARVERSE_TREASURY_PRIVATE_KEY: key } = process.env;
  if (!account || !key) return NextResponse.json({ error: "Test funds are not set up on this server." }, { status: 503 });
  if ((process.env.NEAR_NETWORK || "testnet") !== "testnet") return NextResponse.json({ error: "The faucet only runs on testnet." }, { status: 403 });
  const { accountId } = await req.json().catch(() => ({ accountId: "" }));
  if (typeof accountId !== "string" || !(/^[0-9a-f]{64}$/.test(accountId) || /^[a-z0-9._-]{2,56}\.testnet$/.test(accountId))) return NextResponse.json({ error: "Enter a valid testnet account." }, { status: 400 });
  const now = Date.now(), ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ids = ip ? [accountId, ip] : [accountId];
  const last = Math.max(...ids.map((id) => seen.get(id) ?? 0));
  if (now - last < WINDOW) return NextResponse.json({ error: "You already took your test NEAR.", nextAt: last + WINDOW }, { status: 429 });
  recent = recent.filter((t) => now - t < 60 * 60_000);
  if (recent.length >= HOURLY_CAP) return NextResponse.json({ error: "The faucet is busy. Try again later." }, { status: 429 });
  ids.forEach((id) => seen.set(id, now)); recent.push(now);
  try {
    const near = new Near({ network: "testnet", rpcUrl: process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com", privateKey: key as `ed25519:${string}`, defaultSignerId: account });
    if (Number(await near.getBalance(account)) < TREASURY_FLOOR) {
      ids.forEach((id) => seen.delete(id)); recent.pop();
      return NextResponse.json({ error: "The faucet is paused for now. You can still play and trade." }, { status: 503 });
    }
    await near.send(accountId, BigInt(YOCTO));
    return NextResponse.json({ accountId, nextAt: now + WINDOW });
  } catch (e) {
    ids.forEach((id) => seen.delete(id)); recent.pop();
    return NextResponse.json({ error: "The treasury could not send test NEAR: " + String((e as Error).message).slice(0, 160) }, { status: 502 });
  }
}
