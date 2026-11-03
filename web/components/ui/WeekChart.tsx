"use client";
import { useState } from "react";
import { rules as c, coins, type HourSample } from "@nearverse/economy";

const W = 760, H = 320, L = 48, R = 62, T = 14, B = 26;
export const HOURS = 168;
const DAYS = [0, 24, 48, 72, 96, 120, 144, 168];

export function WeekChart({ history, startTick }: { history: HourSample[]; startTick: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const items = c.items;
  const x = (i: number) => L + (i / HOURS) * (W - L - R);
  const max = Math.max(...items.map((it) => it.base_price * 1.6), ...history.flatMap((h) => h.prices));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round(((max / 100) * i) / 4));
  // nudge end labels so close lines don't collide
  const ends = history.length ? items.map((it, i) => ({ i, y: y(history[history.length - 1].prices[i]), it })).sort((a, b) => a.y - b.y) : [];
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;
  const h = hover !== null ? history[hover] : null;
  const bands: [number, number, string][] = [];
  history.forEach((s, i) => { if (s.event) { const last = bands[bands.length - 1]; if (last && last[1] === i - 1 && last[2] === s.event) last[1] = i; else bands.push([i, i, s.event]); } });
  return (
    <div>
      <div className="legend">{items.map((it) => <span key={it.id}><i className="swatch" style={{ background: `var(--${it.id})` }} />{it.name}</span>)}<span><i className="swatch" style={{ background: "#14213d22" }} />Market event</span></div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Average merchant price of each material across a simulated week"
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; const i = Math.round(((px - L) / (W - L - R)) * HOURS); setHover(i >= 0 && i < history.length ? i : null); }}
        onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t * 100)} y2={y(t * 100)} stroke="#d9c9a0" /><text x={L - 7} y={y(t * 100) + 4} textAnchor="end" fontSize="12">{t}</text></g>)}
        {DAYS.map((d) => <text key={d} x={x(d)} y={H - 7} textAnchor="middle" fontSize="12">{d === 0 ? "Day 0" : d / 24}</text>)}
        {bands.map(([a, b, name]) => <rect key={a} x={x(a)} y={T} width={Math.max(2, x(b) - x(a))} height={H - T - B} fill="#14213d" opacity=".13"><title>{name}</title></rect>)}
        {items.map((it, i) => <polyline key={it.id} fill="none" stroke={`var(--${it.id})`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={history.map((s, k) => `${x(k).toFixed(1)},${y(s.prices[i]).toFixed(1)}`).join(" ")} />)}
        {ends.map((e) => <text key={e.it.id} x={x(history.length - 1) + 7} y={e.y + 4} fontSize="12">{e.it.name}</text>)}
        {h && <g><line x1={x(hover!)} x2={x(hover!)} y1={T} y2={H - B} stroke="#14213d" />{items.map((it, i) => <circle key={it.id} cx={x(hover!)} cy={y(h.prices[i])} r="4" fill={`var(--${it.id})`} stroke="#fff4d6" strokeWidth="2" />)}</g>}
      </svg>
      <p style={{ minHeight: 24, margin: "4px 0", fontSize: 14 }}>{h ? <>Hour {h.tick - startTick}{h.event ? `, ${h.event}` : ""}: {items.map((it, i) => `${it.name} ${coins(h.prices[i])}`).join(", ")}</> : "Hover the chart to read one hour. Prices are what merchants charge, averaged across all three."}</p>
    </div>
  );
}

export function CashChart({ history }: { history: HourSample[] }) {
  const W2 = 360, H2 = 130, l = 42, r = 66, t = 8, b = 8;
  const max = Math.max(...c.merchants.map((m) => m.cash_cap), ...history.flatMap((h) => h.cash));
  const x = (i: number) => l + (i / HOURS) * (W2 - l - r), y = (v: number) => t + (1 - v / max) * (H2 - t - b);
  const colors = ["#2f5fb3", "#b5341f", "#2f6f43"];
  const ends = history.length ? c.merchants.map((m, j) => ({ id: m.id, name: m.name, y: y(history[history.length - 1].cash[j]) })).sort((p, q) => p.y - q.y) : [];
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 12) ends[k].y = ends[k - 1].y + 12;
  return (
    <svg className="chart" viewBox={`0 0 ${W2} ${H2}`} role="img" aria-label="Cash held by each merchant across the simulated week">
      <line x1={l} x2={W2 - r} y1={y(0)} y2={y(0)} stroke="#d9c9a0" /><text x={l - 5} y={y(0)} textAnchor="end" fontSize="11">0</text>
      <text x={l - 5} y={y(max) + 9} textAnchor="end" fontSize="11">{Math.round(max / 100 / 1000)}k</text>
      {c.merchants.map((m, j) => <polyline key={m.id} fill="none" stroke={colors[j]} strokeWidth="2" points={history.map((s, k) => `${x(k).toFixed(1)},${y(s.cash[j]).toFixed(1)}`).join(" ")} />)}
      {ends.map((e) => <text key={e.id} x={x(history.length - 1) + 5} y={e.y + 4} fontSize="11">{e.name}</text>)}
    </svg>
  );
}
