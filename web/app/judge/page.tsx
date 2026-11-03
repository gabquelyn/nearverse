"use client";
import { useEffect, useRef, useState } from "react";
import { rules as c, createSim, stepHour, floodMarket, type Sim, type HourSample, coins, cargoUsed } from "@nearverse/economy";
import { useGame, worth } from "@/lib/state/game";
import { MerchantTable, Blueprints } from "@/components/ui/Prices";
import { WeekChart, CashChart, HOURS } from "@/components/ui/WeekChart";
import { Nav } from "@/components/ui/Nav";
import { explorerTx } from "@/lib/near/client";

function FastForward() {
  const market = useGame((s) => s.market);
  const sim = useRef<Sim | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [history, setHistory] = useState<HourSample[]>([]);
  const [running, setRunning] = useState(false);
  const [flooded, setFlooded] = useState<number[]>([]);
  const [startTick, setStartTick] = useState(0);
  const iron = c.items.findIndex((i) => i.id === "iron");
  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; setRunning(false); };
  useEffect(() => stop, []);
  const fresh = () => { stop(); sim.current = createSim(c, market); setStartTick(market.tick); setHistory([]); setFlooded([]); return sim.current; };
  const run = () => {
    const s = fresh(); setRunning(true);
    timer.current = setInterval(() => {
      stepHour(s); setHistory([...s.history]);
      if (s.history.length >= HOURS) stop();
    }, 60_000 / HOURS);
  };
  const skip = () => { const s = sim.current && running ? sim.current : fresh(); stop(); while (s.history.length < HOURS) stepHour(s); setHistory([...s.history]); };
  const flood = () => { if (!sim.current || !running) return; floodMarket(sim.current, iron, 220); setFlooded((f) => [...f, sim.current!.history.length]); };
  const adapted: string[] = [];
  if (sim.current && history.length) sim.current.mk.merchants.forEach((m, j) => m.target.forEach((t, i) => {
    const was = c.merchants[j].targets[i];
    if (Math.abs(t - was) / was >= 0.05) adapted.push(`${c.merchants[j].name} ${t > was ? "stocks" : "cut"} ${Math.abs(Math.round(((t - was) / was) * 100))}% ${t > was ? "more" : "of its"} ${c.items[i].name.toLowerCase()}`);
  }));
  const trades = history.reduce((a, h) => a + h.trades, 0), built = history.reduce((a, h) => a + h.built, 0);
  return (
    <section aria-label="Fast-forward">
      <h2>A week of trading in a minute</h2>
      <div className="notice">Simulation. It copies the current market into this browser and plays 14 simulated traders. It sends no transactions.</div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn big" onClick={run} disabled={running}>{running ? `Hour ${history.length} of ${HOURS}` : "Run a week"}</button>
        <button className="btn" onClick={flood} disabled={!running}>Flood the market with iron</button>
        <button className="btn ghost" onClick={skip}>Skip to the end</button>
      </div>
      {history.length > 0 || running ? (
        <div className="weekgrid">
          <WeekChart history={history} startTick={startTick} />
          <div>
            <p className="mlabel" style={{ marginTop: 0 }}>Merchant cash</p>
            <CashChart history={history} />
            <p className="mlabel">This week so far</p>
            <p style={{ margin: 0 }} data-testid="sim-summary">{trades} trades, {built} sections built{flooded.length ? `, iron flooded in hour ${flooded.join(", ")}` : ""}.</p>
            <p className="mlabel">What merchants learned</p>
            {adapted.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{adapted.slice(0, 5).map((a) => <li key={a}>{a}</li>)}</ul> : <p style={{ margin: 0 }}>Nothing yet. They review their stock every {c.adapt_every_ticks} hours.</p>}
          </div>
        </div>
      ) : <p>Press Run a week, then flood the market while it plays and watch iron fall. Each merchant&apos;s reasons are in the price tooltips below.</p>}
    </section>
  );
}

export default function Judge() {
  const g = useGame();
  const [merchant, setMerchant] = useState(0);
  useEffect(() => { g.init().then(() => { if (useGame.getState().mode === "practice") useGame.getState().startDriving(); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="page">
      <header><h1>Judge view</h1><Nav /></header>
      <p style={{ maxWidth: "70ch", marginTop: 0 }}>Every game action as a plain button, with no driving. {g.mode === "practice" ? "This server has no contract set, so you're in practice mode: the same rules, in this browser only." : "These actions are real testnet transactions, signed without a popup."}</p>
      {g.toast && <div className={`toast ${g.toast.bad ? "bad" : ""}`} role="status" style={{ position: "fixed" }}>{g.toast.text}</div>}
      <FastForward />
      <h2>Play by buttons</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" disabled={g.player.started} onClick={() => g.startDriving()}>{g.player.started ? "Game started" : "Start game"}</button>
        <button className="btn" onClick={() => g.act({ t: "repair" })}>Repair truck</button>
        {g.mode === "practice" && <button className="btn ghost" onClick={() => g.advanceHours(24)}>Advance market 24 hours</button>}
      </div>
      <p style={{ margin: "0 0 12px" }} data-testid="player-summary">Coins <b>{coins(g.player.coins)}</b>, net worth <b>{coins(worth(g.player))}</b>, fuel <b>{g.player.items[c.fuel_item]}</b>, truck <b>{g.player.durability}%</b>, truck bed <b>{cargoUsed(c, g.player)}/{c.cargo_capacity}</b>. Market hour <b>{g.market.tick}</b>.</p>
      <div className="grid2">
        <div>
          <p className="mlabel" style={{ marginTop: 0 }}>Gather</p>
          <div className="row">{c.nodes.map((n, i) => <button key={n.id} className="btn small" onClick={() => g.act({ t: "gather", node: i })}>{n.id} ({g.market.nodes[i]})</button>)}</div>
          <p className="mlabel">Build</p><Blueprints />
          <p className="mlabel">Activity</p>
          <ul className="log" data-testid="log">{g.log.length ? g.log.slice(0, 8).map((l) => <li key={l.id} className={l.failed ? "failed" : ""}>{l.text}{l.hash ? <> (<a href={explorerTx(l.hash)} target="_blank" rel="noreferrer">view transaction</a>)</> : ""}</li>) : <li>Nothing yet. Gather a load to begin.</li>}</ul>
        </div>
        <div>
          <div className="row" role="tablist" aria-label="Merchants" style={{ marginBottom: 8 }}>{c.merchants.map((m, i) => <button key={m.id} role="tab" aria-selected={merchant === i} className={`btn small ${merchant === i ? "" : "ghost"}`} onClick={() => setMerchant(i)}>{m.name}</button>)}</div>
          <div style={{ overflowX: "auto", paddingTop: 2 }}><MerchantTable merchant={merchant} plain /></div>
        </div>
      </div>
    </div>
  );
}
