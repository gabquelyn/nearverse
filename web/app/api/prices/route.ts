import { NextResponse } from "next/server";
import type { PriceSnapshot } from "@nearverse/economy";

// Reads the price tracker's table. With no database set up it answers with nothing, and the chart uses this browser's own history.
const MAX_POINTS = 300, FRESH_MS = 120_000;
let cache: { at: number; rows: PriceSnapshot[] } | null = null;

async function load(): Promise<PriceSnapshot[]> {
  const url = process.env.PRICE_DB_URL, key = process.env.PRICE_DB_KEY;
  if (!url || !key) return [];
  if (cache && Date.now() - cache.at < FRESH_MS) return cache.rows;
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/price_snapshots?select=t,tick,d&contract=eq.${encodeURIComponent(process.env.GAME_CONTRACT ?? "")}&t=gte.${since}&order=t.asc&limit=1100`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`price database answered ${res.status}`);
  const rows = (await res.json() as { t: string; tick: number; d: PriceSnapshot["d"] }[]).map((r) => ({ ...r, t: Date.parse(r.t) }));
  cache = { at: Date.now(), rows };
  return rows;
}

export async function GET(req: Request) {
  const item = new URL(req.url).searchParams.get("item") ?? "";
  if (!/^\d{1,3}$/.test(item)) return NextResponse.json({ error: "Choose a material" }, { status: 400 });
  try {
    const rows = await load(), every = Math.max(1, Math.ceil(rows.length / MAX_POINTS));
    const points = rows.filter((_, i) => i % every === 0 || i === rows.length - 1).map((r) => {
      const d: PriceSnapshot["d"] = {};
      for (const [dealer, row] of Object.entries(r.d)) if (row[item]) d[dealer] = { [item]: row[item] };
      return { t: r.t, tick: r.tick, d };
    });
    return NextResponse.json({ points }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (e) {
    console.error("price history:", (e as Error).message);
    return NextResponse.json({ points: [] });
  }
}
