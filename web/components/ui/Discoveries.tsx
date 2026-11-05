"use client";
// The materials you've found so far.
import { useEffect, useState } from "react";
import { rules as c } from "@nearverse/economy";
import { readFound, type Found } from "@/lib/foundLog";
import { PRACTICE_ID, useGame } from "@/lib/state/game";

const TIERS = ["", "Common", "Uncommon", "Rare", "Legendary"];

export function Discoveries() {
  const who = useGame((s) => s.session?.accountId ?? PRACTICE_ID), logged = useGame((s) => s.player.items.join());
  const [found, setFound] = useState<Record<string, Found>>({});
  useEffect(() => setFound(readFound(who)), [who, logged]);
  const count = c.items.filter((it) => found[it.id]).length;
  return (
    <>
      <p className="muted" data-testid="found-count">You&apos;ve found {count} of {c.items.length} materials. This log is kept in this browser.</p>
      {[1, 2, 3, 4].map((t) => (
        <div key={t} className="foundtier"><h3>{TIERS[t]}</h3><div className="foundgrid">
          {c.items.filter((it) => it.tier === t).map((it) => {
            const f = found[it.id];
            return <div key={it.id} className={`found ${f ? "" : "missing"}`}><i className="swatch" style={{ background: f ? it.color : "transparent" }} /><span><b>{f ? it.name : "Not found yet"}</b><small>{f ? `${f.qty} loaded, first on ${new Date(f.first).toLocaleDateString()}` : `Worth about ${Math.round(it.base_price / 100)} coins`}</small></span></div>;
          })}
        </div></div>
      ))}
    </>
  );
}
