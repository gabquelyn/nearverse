// Gives a browser a short-lived Ably token, so the API key stays on the server. It can move a car and watch others, nothing else.
import { NextResponse } from "next/server";
import Ably from "ably";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.ABLY_API_KEY;
  if (!key) return NextResponse.json({ error: "Live players are not set up on this server." }, { status: 503 });
  const rest = new Ably.Rest({ key });
  const token = await rest.auth.createTokenRequest({ ttl: 60 * 60_000, capability: JSON.stringify({ "nearverse:players": ["publish", "subscribe"], "nearverse:ghosts": ["subscribe"] }) });
  return NextResponse.json(token, { headers: { "cache-control": "no-store" } });
}
