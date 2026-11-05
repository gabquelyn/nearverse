"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { rules as c, vehiclePrice, cargoUsed, plotExpired } from "@nearverse/economy";
import { PRACTICE_ID, useGame } from "@/lib/state/game";
import { biomeName } from "../world/world";

const Stat = ({ label, value, max }: { label: string; value: number; max: number }) => (
  <div className="stat"><span>{label}</span><span className="bar" aria-hidden="true"><i style={{ width: `${Math.max(6, (value / max) * 100)}%` }} /></span><b>{value}</b></div>
);

export function Shop() {
  const player = useGame((s) => s.player), act = useGame((s) => s.act);
  const [pics, setPics] = useState<Record<string, string>>({});
  useEffect(() => {
    // Loaded on demand and drawn once, so the shop page stays light.
    let alive = true;
    import("../world/vehicleModel").then(({ vehiclePreviews }) => { if (alive) setPics(vehiclePreviews(c.vehicles)); });
    return () => { alive = false; };
  }, []);
  const maxCap = Math.max(...c.vehicles.map((v) => v.capacity)), maxEnd = Math.max(...c.vehicles.map((v) => v.endurance));
  return (
    <>
      <p style={{ maxWidth: "68ch", marginTop: 0 }}>You have <b data-testid="shop-credits">{player.credits}</b> credits. Each price comes from a vehicle&apos;s stats: capacity, endurance, fuel use, flair and size. The contract works it out from the rules file, so it can&apos;t be changed in the browser.</p>
      <div className="shop">
        {c.vehicles.map((v, i) => {
          const owned = player.owned_vehicles[i], driving = player.vehicle === i, price = vehiclePrice(c, i);
          const fuelPct = Math.round((v.fuel_bps - 10000) / 100);
          return (
            <article key={v.id} className={`card vehicle ${driving ? "driving" : ""}`} aria-label={v.name}>
              {pics[v.id] ? <img className="pic" src={pics[v.id]} alt={`The ${v.name}`} /> : <span className="pic" aria-hidden="true" />}
              <div className="row" style={{ justifyContent: "space-between" }}><h3>{v.name}</h3>{driving ? <small>Driving</small> : owned ? <small>Owned</small> : null}</div>
              <p className="muted">{v.blurb}</p>
              <Stat label="Capacity" value={v.capacity} max={maxCap} />
              <Stat label="Endurance" value={v.endurance} max={maxEnd} />
              <Stat label="Flair" value={v.flair} max={3} />
              <Stat label="Size" value={v.size} max={5} />
              <p className="fuel">Fuel use: <b>{fuelPct === 0 ? "normal" : `${Math.abs(fuelPct)}% ${fuelPct < 0 ? "less" : "more"}`}</b>. Tank: <b>{v.tank}</b>.</p>
              {driving ? <button className="btn" disabled>Driving now</button>
                : owned ? <button className="btn" disabled={cargoUsed(c, player) > v.capacity} onClick={() => act({ t: "select_vehicle", vehicle: i })}>Drive the {v.name}</button>
                : <button className="btn action" disabled={!player.started || player.credits < price} onClick={() => act({ t: "buy_vehicle", vehicle: i })}>Buy for {price} credits</button>}
            </article>
          );
        })}
      </div>
    </>
  );
}

/** Finished stalls up for sale, from merchants or other players. They open for business the moment you buy. */
function ForSale() {
  const stalls = useGame((s) => s.market.stalls), held = useGame((s) => s.player.coins), started = useGame((s) => s.player.started), act = useGame((s) => s.act), me = useGame((s) => s.session?.accountId ?? PRACTICE_ID);
  const listed = c.lots.map((l, i) => ({ l, i, s: stalls[i] })).filter(({ s }) => s.owner && s.owner !== me && s.built && s.price > 0);
  if (!listed.length) return null;
  return (
    <>
      <p style={{ maxWidth: "68ch", marginTop: 0 }}>Ready-built stalls for sale in coins. Their stock comes with them.</p>
      <div className="shop" style={{ marginBottom: 16 }} data-testid="for-sale">
        {listed.map(({ l, i, s }) => (
          <article className="card" key={l.id} aria-label={`${l.name} for sale`}>
            <h3>{l.name}</h3>
            <p className="muted" style={{ margin: "4px 0 8px" }}>Sold by {s.owner!.startsWith("merchant:") ? `the ${c.merchants.find((m) => `merchant:${m.id}` === s.owner)?.name}` : "another player"}. {s.stock.reduce((a, q) => a + q, 0)} items in stock.</p>
            <button className="btn action" disabled={!started || held < s.price} onClick={() => act({ t: "stall_buy_listed", lot: i })}>Buy for {(s.price / 100).toFixed(2)} coins</button>
          </article>
        ))}
      </div>
    </>
  );
}

/** Stall locations for sale. The exact spot is revealed once you own it. */
export function Locations() {
  const stalls = useGame((s) => s.market.stalls), credits = useGame((s) => s.player.credits), started = useGame((s) => s.player.started), act = useGame((s) => s.act), setWaypoint = useGame((s) => s.setWaypoint);
  const market = useGame((s) => s.market);
  const free = c.lots.map((l, i) => ({ l, i })).filter(({ i }) => !stalls[i].owner || plotExpired(c, market, i, Date.now()));
  return (
    <>
      <ForSale />
      <p style={{ maxWidth: "68ch", marginTop: 0 }}>Buy a location with credits, then bring its materials over as many trips as you like. Each deposit gives you 3 more days. Bought or found materials both count.</p>
      <div className="shop">
        {free.map(({ l, i }) => (
          <article className="card" key={l.id} aria-label={l.name}>
            <h3>{l.name}</h3>
            <p className="muted" style={{ margin: "4px 0 8px" }}>In the {biomeName(l.x, l.z)}. Needs {l.needs.map((q, k) => (q ? `${q} ${c.items[k].name.toLowerCase()}` : null)).filter(Boolean).join(", ")}.</p>
            <button className="btn action" disabled={!started || credits < l.price} onClick={() => { if (act({ t: "claim_lot", lot: i })) setWaypoint({ x: l.x, z: l.z, label: l.name }); }}>Buy for {l.price} credits</button>
          </article>
        ))}
      </div>
    </>
  );
}

export function MyStalls() {
  const stalls = useGame((s) => s.market.stalls), me = useGame((s) => s.session?.accountId ?? PRACTICE_ID), setWaypoint = useGame((s) => s.setWaypoint);
  const mine = c.lots.map((l, i) => ({ l, s: stalls[i] })).filter((x) => x.s.owner === me);
  if (!mine.length) return <p>You don&apos;t own a stall yet. Buy a location above to start one.</p>;
  return <div className="shop">{mine.map(({ l, s }) => (
    <div className="card" key={l.id}><h3>{l.name}</h3><p className="muted" style={{ margin: "4px 0 8px" }}>{!s.built ? c.items.flatMap((it, k) => l.needs[k] ? [`${it.name} ${s.progress[k]}/${l.needs[k]}`] : []).join(", ") : s.built ? `Till ${(s.cash / 100).toFixed(2)} coins, ${s.stock.reduce((a, q) => a + q, 0)} items${s.price ? `, listed at ${(s.price / 100).toFixed(2)}` : ""}.` : "Not built yet. Bring the materials."}</p>
      <Link className="btn small action" href="/play" onClick={() => setWaypoint({ x: l.x, z: l.z, label: l.name })}>Go to my stall</Link></div>
  ))}</div>;
}
