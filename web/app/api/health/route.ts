import { NextResponse } from "next/server";
import { serverPublicConfig } from "@/lib/near/config";
export const dynamic = "force-dynamic";
export function GET() {
  const c = serverPublicConfig();
  return NextResponse.json({ ok: true, mode: c.contract ? "chain" : "practice", network: c.network, contract: c.contract || null });
}
