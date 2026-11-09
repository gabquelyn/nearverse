"use client";
// Each part subscribes only to what it shows, so a crash or pickup doesn't redraw the whole interface.
import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { rules as c, activeEvent, coins, cargoUsed, premiumFor, refuelQuote, repairQuote, vehicleOf, fuelBurn } from "@nearverse/economy";
import { useGame, worth } from "@/lib/state/game";
import { MerchantTable } from "./Prices";
import { LotPanel } from "./StallPanel";
import { TopMap } from "./WorldMap";
import { timeLabel } from "../world/daynight";
import { gatherBar } from "../world/world";
import { isTouch } from "@/lib/landscape";
import { useOutside } from "@/lib/useOutside";
import { link, others, realtimeEnabled } from "@/lib/realtime";
import { MarketButton } from "./LiveMarket";
import { Coach } from "./Coach";
import { GoalLine } from "./Goal";
import { Tour } from "./Tour";
import { Nearby, ZoomButtons } from "./Nearby";
import { samplePrices } from "@/lib/priceLog";

/** The side job: three loads from one spot within a 2-hour window earns a free rare reward. The contract counts the loads and pays it. */
function SideJob({ tick, player }: { tick: number; player: { quest_window: number; quest_progress: number } }) {
  const waypoint = useGame((s) => s.waypoint), setWaypoint = useGame((s) => s.setWaypoint), stock = useGame((s) => s.market.nodes);
  const period = c.quest_period_ticks, window_ = Math.floor(tick / period), index = window_ % c.nodes.length, spot = c.nodes[index];
  const done = player.quest_window === window_ ? player.quest_progress : 0, need = c.quest_gathers;
  const item = c.items[spot.item].name.toLowerCase(), reward = `${c.quest_reward_qty} ${c.items[window_ % c.items.length].name.toLowerCase()}`;
  const mins = (period - (tick % period)) * Math.round(c.tick_ms / 60_000), left = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ""}`.trim() : `${mins}m`;
  const where = spot.region === "Home" ? "near Home" : `in the ${spot.region.toLowerCase()}`, label = `Side job: ${item} spot`;
  if (done >= need) return <small className="sidejob">Side job done: {reward} added to your truck. A new one starts in about {left}.</small>;
  return (
    <small className="sidejob">
      Side job: load {item} {need} times from one marked spot {where} and get {reward} free.{" "}
      {done > 0 ? `${done} of ${need} done. ` : ""}About {left} left.{stock[index] === 0 ? " The spot is empty right now and refills over time." : ""}
      {waypoint?.label !== label && <> <button className="btn small action" onClick={() => setWaypoint({ x: spot.x, z: spot.z, label })}>Show me the spot</button></>}
    </small>
  );
}

const Stats = memo(function Stats() {
  const player = useGame((s) => s.player), tick = useGame((s) => s.market.tick), act = useGame((s) => s.act);
  const rank = useGame((s) => s.board.findIndex((r) => r.account_id === s.session?.accountId) + 1);
  const vehicle = vehicleOf(c, player), health = Math.round((player.durability / vehicle.endurance) * 100), fuelPct = Math.round((player.fuel / vehicle.tank) * 100);
  const rf = refuelQuote(c, player), rq = repairQuote(c, player);
  return (
    <div className="hud">
      <div className="plate"><small>Credits</small><b data-testid="credits">{player.credits}</b></div>
      <div className="plate"><small>Coins</small><b>{coins(player.coins)}</b></div>
      <div className="plate"><small>Net worth{rank > 0 ? `, #${rank}` : ""}</small><b>{coins(worth(player))}</b></div>
      <div className="plate"><small>Fuel {fuelPct}%</small><div className="gauge"><i className={fuelPct < 20 ? "low" : ""} style={{ width: `${fuelPct}%` }} /></div>
        <small>{vehicle.name} {health}%</small><div className="gauge"><i className={health < 30 ? "low" : ""} style={{ width: `${health}%` }} /></div></div>
      <div className="plate" style={{ flexGrow: 3 }}><small>Truck bed {cargoUsed(c, player)}/{vehicle.capacity}</small>
        <div className="cargo" data-testid="cargo">{player.items.some((q) => q > 0) ? c.items.map((it, i) => player.items[i] > 0 ? <span key={it.id} title={it.name}><i className="swatch" style={{ background: it.color }} />{it.name} {player.items[i]}</span> : null) : <span className="muted">Empty</span>}</div>
        <div className="garage">
          <button className="btn small" disabled={rf.missing === 0} onClick={() => act({ t: "refuel", units: rf.missing })}>{rf.missing ? `Refuel: ${coins(rf.cost)}` : "Tank full"}</button>
          <button className="btn small" disabled={rq.missing === 0} onClick={() => act({ t: "repair" })}>{rq.missing ? `Repair: ${coins(rq.cost)}` : "No damage"}</button>
        </div></div>
      <div className="plate job"><GoalLine /><SideJob tick={tick} player={player} /></div>
    </div>
  );
});

const Banner = memo(function Banner() {
  const ev = useGame((s) => activeEvent(c, s.market.tick)), away = useGame((s) => s.away), dismiss = useGame((s) => s.dismissAway);
  // A market event shows for a few seconds, then gets out of the way. The next one shows again.
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(() => { if (!ev) return; const id = setTimeout(() => setHidden(ev.title), 7000); return () => clearTimeout(id); }, [ev?.title]); // eslint-disable-line react-hooks/exhaustive-deps
  useOutside(Boolean(away), ".away", dismiss);
  useOutside(Boolean(ev) && hidden !== ev?.title && !away, ".event", () => setHidden(ev?.title ?? null));
  if (away) return <div className="away"><h3>While you were away</h3><ul>{away.map((a) => <li key={a}>{a}</li>)}</ul><button className="btn small" onClick={dismiss}>Back to driving</button></div>;
  return ev && hidden !== ev.title ? <div className="event"><button className="close" aria-label="Close" onClick={() => setHidden(ev.title)}>×</button><b>{ev.title}</b>{ev.text}</div> : null;
});

const Toast = memo(function Toast() {
  const toast = useGame((s) => s.toast), clear = useGame((s) => s.clearToast), act = useGame((s) => s.act);
  useOutside(Boolean(toast), ".toast", clear);
  return toast ? <div className={`toast ${toast.bad ? "bad" : ""}`} role="status">{toast.text}{toast.retry && <button className="btn small" onClick={() => { const a = toast.retry!; clear(); act(a); }}>Try again</button>}</div> : null;
});

function GatherPrompt({ index }: { index: number }) {
  const node = c.nodes[index];
  const left = useGame((s) => s.market.nodes[index]), burn = useGame((s) => fuelBurn(c, s.player, node.fuel_cost));
  const bar = useRef<HTMLElement>(null), note = useRef<HTMLDivElement>(null);
  useEffect(() => { gatherBar.el = bar.current; gatherBar.note = note.current; return () => { gatherBar.el = null; gatherBar.note = null; }; }, []);
  return (
    <div className="prompt">
      You found a {node.name.toLowerCase()}: hold {isTouch() ? "Load" : "E"} to load {node.yield_qty} {c.items[node.item].name.toLowerCase()}
      <div style={{ fontWeight: 400, fontSize: 13 }}>{left} left, uses {burn} fuel{node.wear ? ` and ${node.wear} truck wear` : ""}</div>
      <div className="bar"><i ref={bar} style={{ width: 0 }} /></div>
      <div ref={note} className="loadnote" aria-live="polite" />
    </div>
  );
}

const ZonePanel = memo(function ZonePanel() {
  const zone = useGame((s) => s.zone), closed = useGame((s) => s.closedZone), close = useGame((s) => s.closeZone);
  const key = zone ? `${zone.kind}${zone.index}` : null;
  useOutside(Boolean(zone) && zone?.kind !== "node" && closed !== key, ".panel", close);
  if (!zone) return null;
  if (zone.kind !== "node" && closed === key) return null;
  if (zone.kind === "node") return <GatherPrompt index={zone.index} />;
  if (zone.kind === "lot") return <section className="panel" aria-label={`${c.lots[zone.index].name} lot`}><LotPanel lot={zone.index} /></section>;
  return <section className="panel" aria-label={`${c.merchants[zone.index].name} stall`}><h2>{c.merchants[zone.index].name}</h2><MerchantTable merchant={zone.index} /><BlueprintNote merchant={zone.index} /></section>;
});

function BlueprintNote({ merchant }: { merchant: number }) {
  const tick = useGame((s) => s.market.tick);
  if (c.merchants[merchant].premium_bps === 0) return null;
  const short = c.items.filter((_, i) => premiumFor(c, merchant, i, tick) > 0).map((it) => it.name.toLowerCase()).join(", ");
  return short ? <p style={{ marginTop: 10 }}>Short of for now, so paying extra: {short}.</p> : null;
}

const Clock = memo(function Clock() {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => { const id = setInterval(() => { if (el.current) el.current.textContent = timeLabel(); }, 1500); return () => clearInterval(id); }, []);
  return <span ref={el} className="where" data-testid="where">Day</span>;
});

/** Says plainly when moves are slow, the connection dropped, or the game key needs renewing. */
const Status = memo(function Status() {
  const slow = useGame((s) => s.slow), offline = useGame((s) => s.offline), expired = useGame((s) => s.keyExpired), session = useGame((s) => s.session), known = useGame((s) => s.playerKnown), reason = useGame((s) => s.netError);
  const renew = async () => { if (session!.kind === "google") { location.href = "/signin"; return; } const auth = await import("@/lib/near/login"); await auth.requestRenewKey(session!.accountId); };
  if (expired) return <div className="statusbar warn" role="alert">Your game key needs renewing to keep saving your moves.<button className="btn small action" onClick={() => renew().catch(() => useGame.getState().say("Couldn't start the approval. Try again.", true))}>Renew it</button></div>;
  if (offline) return <div className="statusbar warn" role="alert" data-testid="net-error">Can&apos;t reach the NEAR network. Retrying.{reason && <small> {reason}</small>}</div>;
  if (session && !known) return <div className="statusbar" role="status">Loading your game from the network.</div>;
  return slow ? <div className="statusbar" role="status">Still confirming your last move.</div> : null;
});

/** How many people are in the world right now, counting you. */
const Online = memo(function Online() {
  const [view, setView] = useState({ text: "", why: "", bad: false });
  useEffect(() => {
    if (!realtimeEnabled()) return;
    const read = () => setView(link.state === "failed" ? { text: "Live cars offline", why: link.reason, bad: true }
      : link.state === "live" ? { text: `${[...others.values()].filter((o) => o.kind === "player").length + 1} online`, why: "", bad: false }
      : { text: "Connecting", why: "", bad: false });
    read();
    const id = setInterval(read, 2000);
    return () => clearInterval(id);
  }, []);
  return view.text ? <span className={`online ${view.bad ? "bad" : ""}`} data-testid="online" title={view.why}>{view.text}</span> : null;
});

const Mode = memo(function Mode() {
  const mode = useGame((s) => s.mode), hasSession = useGame((s) => Boolean(s.session));
  return <div className="modebar">{mode === "practice" ? "Practice mode: saved in this browser." : hasSession ? "Playing live. Moves save as you go." : "Viewing the live world."} WASD or arrows to drive, Shift boost, Space jump, H honk, M map, R back home.</div>;
});

/** Keeps this browser's price history going while you play, one sample per market hour. */
function PriceSampler() {
  const tick = useGame((s) => s.market.tick);
  useEffect(() => { samplePrices(useGame.getState().market); }, [tick]);
  return null;
}

const KEY = "nearverse.hudOpen";

/** Everything except what you need in the moment can be hidden, for a clear view of the world. */
export const Hud = memo(function Hud() {
  const [open, setOpen] = useState(true);
  useEffect(() => { try { const saved = localStorage.getItem(KEY); if (saved === "0" || (saved === null && isTouch())) setOpen(false); } catch { /* use the default */ } }, []);
  const toggle = useCallback((next?: boolean) => setOpen((o) => { const v = next ?? !o; try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* not remembered */ } return v; }), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.code === "Tab" && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); toggle(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [toggle]);
  const [canFull, setCanFull] = useState(false);
  useEffect(() => setCanFull(Boolean(document.documentElement.requestFullscreen)), []); // iPhones have no full screen for web pages
  // A press outside hides the details for now, without changing what's remembered for next time.
  useOutside(open, ".hud, .links, .topmap, .event, .away, .panel, .livepanel, .prompt, .toast, .coach, .tour, .zoom, .nearby, .statusbar", () => setOpen(false));
  const fullscreen = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else document.documentElement.requestFullscreen?.().catch(() => {}); };
  return (
    <>
      <div className="hudbar">
        <button className="btn small" aria-expanded={open} onClick={() => toggle()}>{open ? "Hide details" : "Show details"}</button>
        <Online />
        <MarketButton />
        <Link className="btn small phone-only" href="/profile">Profile</Link>
        {canFull && <button className="btn small ghost" onClick={fullscreen}>Full screen</button>}
      </div>
      {!open && <div className="goalchip"><GoalLine /></div>}
      {open && <><Stats /><nav className="links" aria-label="Pages"><Clock /><Link href="/profile">Shop and profile</Link><Link href="/judge">Judge view</Link></nav><TopMap /><Banner /><Mode /></>}
      <PriceSampler />
      <Status />
      <Tour />
      <Coach />
      <Nearby />
      <ZoomButtons />
      <Toast />
      <ZonePanel />
    </>
  );
});
