"use client";
// One material's price over time at every dealer, with your own sales marked. Colors stay with the dealer, whatever is hidden.
import { useEffect, useMemo, useState } from "react";
import { rules as c, coins, dealerName, type PriceSnapshot } from "@nearverse/economy";
import { readPrices, samplePrices } from "@/lib/priceLog";
import { readSales } from "@/lib/salesLog";
import { PRACTICE_ID, useGame } from "@/lib/state/game";

const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9", "#e66767"], OTHER = "#8ba0a6";
const W = 720, H = 280, L = 48, R = 14, T = 12, B = 26;

/** A merchant keeps its color. The first stalls get the colors left over, and the rest share one averaged line. */
function colorFor(dealer: string, stalls: string[]) {
  if (dealer[0] === "m") return SERIES[Number(dealer.slice(1))];
  const k = c.merchants.length + stalls.indexOf(dealer);
  return SERIES[k] ?? OTHER;
}
const when = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function PriceChart({ item, setItem }: { item: number; setItem(i: number): void }) {
  const [side, setSide] = useState<0 | 1>(0), [remote, setRemote] = useState<PriceSnapshot[]>([]), [hidden, setHidden] = useState<string[]>([]), [hover, setHover] = useState<number | null>(null);
  const market = useGame((s) => s.market), who = useGame((s) => s.session?.accountId ?? PRACTICE_ID);
  useEffect(() => {
    let alive = true;
    fetch(`/api/prices?item=${item}`).then((r) => r.json()).then((j) => { if (alive) setRemote(j.points ?? []); }).catch(() => { if (alive) setRemote([]); });
    return () => { alive = false; };
  }, [item]);
  useEffect(() => { samplePrices(market); }, [market]);
  const points = useMemo(() => {
    const from = remote.length ? remote[remote.length - 1].t : 0;
    return [...remote, ...readPrices().filter((p) => p.t > from)].sort((a, b) => a.t - b.t);
  }, [remote, market]); // eslint-disable-line react-hooks/exhaustive-deps
  const dealers = useMemo(() => {
    const set = new Set<string>();
    for (const p of points) for (const [d, row] of Object.entries(p.d)) if (row[item]) set.add(d);
    return [...set].sort((a, b) => (a[0] === b[0] ? Number(a.slice(1)) - Number(b.slice(1)) : a[0] === "m" ? -1 : 1));
  }, [points, item]);
  const stalls = dealers.filter((d) => d[0] === "s");
  const named = dealers.filter((d) => d[0] === "m" || colorFor(d, stalls) !== OTHER), rest = stalls.filter((d) => !named.includes(d));
  const value = (p: PriceSnapshot, d: string) => {
    if (d === "other") { const v = rest.map((s) => p.d[s]?.[item]?.[side]).filter((x): x is number => x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; }
    return p.d[d]?.[item]?.[side];
  };
  const lines = [...named, ...(rest.length ? ["other"] : [])], shown = lines.filter((d) => !hidden.includes(d));
  const t0 = points[0]?.t ?? 0, t1 = Math.max(points[points.length - 1]?.t ?? 1, t0 + 1);
  const sales = side === 0 ? readSales(who).filter((s) => s.kind === "sale" && s.qty && s.item === c.items[item].name && s.t >= t0) : [];
  const values = [...shown.flatMap((d) => points.map((p) => value(p, d)).filter((v): v is number => v !== undefined)), ...sales.map((s) => s.cents / s.qty!)];
  const top = Math.max(c.items[item].base_price * 1.2, ...values), bottom = Math.min(c.items[item].base_price * 0.8, ...values);
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - R), y = (v: number) => T + (1 - (v - bottom) / (top - bottom)) * (H - T - B);
  const h = hover !== null ? points[hover] : null;
  const label = (d: string) => (d === "other" ? `Other stalls (${rest.length})` : dealerName(c, d));
  const toggle = (d: string) => setHidden((l) => (l.includes(d) ? l.filter((v) => v !== d) : [...l, d]));
  return (
    <div className="pricechart" data-testid="price-chart">
      <div className="row">
        <label className="field">Material <select value={item} data-testid="chart-item" onChange={(e) => { setItem(Number(e.target.value)); setHidden([]); }}>{c.items.map((it, i) => <option key={it.id} value={i}>{it.name}</option>)}</select></label>
        <span className="row" role="group" aria-label="Which price">
          <button className={`btn small ${side === 0 ? "action" : "ghost"}`} aria-pressed={side === 0} onClick={() => setSide(0)}>What they pay</button>
          <button className={`btn small ${side === 1 ? "action" : "ghost"}`} aria-pressed={side === 1} onClick={() => setSide(1)}>What they charge</button>
        </span>
      </div>
      {lines.length > 0 && <div className="legend">{lines.map((d) => <button key={d} className={`legend-btn ${hidden.includes(d) ? "off" : ""}`} aria-pressed={!hidden.includes(d)} onClick={() => toggle(d)}><i className="swatch" style={{ background: d === "other" ? OTHER : colorFor(d, stalls) }} />{label(d)}</button>)}{sales.length > 0 && <span><i className="saledot" />Your sales</span>}</div>}
      {points.length < 2 ? <p className="muted" data-testid="chart-empty">History builds up as the market moves. This chart fills in after the next price change.</p> : (
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${c.items[item].name} price at each dealer over time`}
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(), t = t0 + (((e.clientX - r.left) / r.width * W - L) / (W - L - R)) * (t1 - t0); let best = 0; points.forEach((p, i) => { if (Math.abs(p.t - t) < Math.abs(points[best].t - t)) best = i; }); setHover(best); }}
          onPointerLeave={() => setHover(null)}>
          {[0, 1, 2, 3].map((k) => { const v = bottom + ((top - bottom) * k) / 3; return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">{(v / 100).toFixed(v < 10000 ? 1 : 0)}</text></g>; })}
          <text x={L} y={H - 7} fontSize="12" fill="var(--muted)">{when(t0)}</text><text x={W - R} y={H - 7} fontSize="12" textAnchor="end" fill="var(--muted)">{when(t1)}</text>
          {shown.map((d) => {
            const pts = points.flatMap((p) => { const v = value(p, d); return v === undefined ? [] : [`${x(p.t).toFixed(1)},${y(v).toFixed(1)}`]; });
            const color = d === "other" ? OTHER : colorFor(d, stalls);
            if (pts.length === 1) { const [px, py] = pts[0].split(","); return <circle key={d} cx={px} cy={py} r="4" fill={color} />; } // a new dealer has one reading so far
            return <polyline key={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={pts.join(" ")} />;
          })}
          {sales.map((s) => <circle key={s.id} cx={x(s.t)} cy={y(s.cents / s.qty!)} r="4.5" fill="var(--text)" stroke="var(--surface)" strokeWidth="2"><title>You sold {s.qty} for {coins(s.cents)} to {s.buyer}</title></circle>)}
          {h && <line x1={x(h.t)} x2={x(h.t)} y1={T} y2={H - B} stroke="var(--muted)" />}
        </svg>
      )}
      <p className="muted chartnote">{h ? <>{when(h.t)}: {shown.flatMap((d) => { const v = value(h, d); return v === undefined ? [] : [`${label(d)} ${coins(Math.round(v))}`]; }).join(", ")}</> : "Prices are in coins. Hover over the chart to read them, and press a name to hide its line."}</p>
    </div>
  );
}
