// A quick health check for you: are the accounts funded, and are ghost traders trading? It shows nothing secret.
import { NextResponse } from "next/server";
import { Near } from "near-kit";
export const dynamic = "force-dynamic";

export async function GET() {
  const { GAME_CONTRACT: contract, NEARVERSE_TREASURY_ACCOUNT: treasury, GOOGLE_PARENT_ACCOUNT: parent, NEAR_RPC_URL } = process.env;
  const near = new Near({ network: "testnet", rpcUrl: NEAR_RPC_URL || "https://test.rpc.fastnear.com" });
  const balance = async (id?: string) => (id ? await near.getBalance(id).then(Number, () => null) : null);
  let lastGhostMs: number | null = null;
  if (contract) await Promise.all([1, 2, 3, 4].map(async (i) => {
    const p = await near.view<{ last_gather_ms: number; last_trade_ms: number } | null>(contract, "get_player", { account_id: `ghost-${i}.${contract}` }).catch(() => null);
    if (p) lastGhostMs = Math.max(lastGhostMs ?? 0, p.last_gather_ms, p.last_trade_ms);
  }));
  return NextResponse.json({
    contract: contract || null,
    balances: { treasury: await balance(treasury), game: await balance(contract), googleParent: await balance(parent) },
    lastGhostMs: lastGhostMs || null,
    features: { liveCars: Boolean(process.env.ABLY_API_KEY), google: Boolean(process.env.GOOGLE_CLIENT_ID) },
  }, { headers: { "cache-control": "no-store" } });
}
