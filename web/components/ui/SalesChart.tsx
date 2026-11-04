"use client";
// How your selling is going: coins earned over time, and where they came from.
import { useEffect, useState } from "react";
import { coins } from "@nearverse/economy";
import { useGame, PRACTICE_ID } from "@/lib/state/game";
import { readSales, type Sale } from "@/lib/salesLog";

const W = 640, H = 200, L = 52, R = 14, T = 12, B = 24;

function Bars({ title, rows }: { title: string; rows: [string, number][] }) {
  const most = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div>
      <h3>{title}</h3>
      {rows.map(([name, cents]) => <div className="barrow" key={name}><span>{name}</span><b>{coins(cents)}</b><div className="gauge"><i style={{ width: `${(cents / most) * 100}%` }} /></div></div>)}
    </div>
  );
}
const totals = (sales: Sale[], by: (s: Sale) => string): [string, number][] => {
  const m = new Map<string, number>(); for (const s of sales) m.set(by(s), (m.get(by(s)) ?? 0) + s.cents);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

export function SalesChart() {
  const me = useGame((s) => s.session?.accountId ?? PRACTICE_ID), log = useGame((s) => s.log.length);
  const [sales, setSales] = useState<Sale[]>([]), [hover, setHover] = useState<number | null>(null);
  useEffect(() => setSales(readSales(me)), [me, log]);
  if (!sales.length) return <p data-testid="sales-empty">Your sales appear here once you&apos;ve sold something.</p>;
  let run = 0;
  const points = sales.map((s) => ({ t: s.t, total: (run += s.cents), s }));
  const t0 = points[0].t, span = Math.max(1, points[points.length - 1].t - t0), top = Math.max(1, run);
  const x = (t: number) => L + ((t - t0) / span) * (W - L - R), y = (v: number) => T + (1 - v / top) * (H - T - B);
  const path = points.length > 1 ? points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.total).toFixed(1)}`).join("") : `M${L},${y(run)}L${W - R},${y(run)}`;
  const h = hover === null ? null : points[hover];
  const clock = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const best = sales.reduce((a, b) => (b.cents > a.cents ? b : a));
  return (
    <div className="saleschart" data-testid="sales-chart">
      <div className="salestiles">
        <div><small>Total earned</small><b data-testid="sales-total">{coins(run)}</b></div>
        <div><small>Sales</small><b>{sales.length}</b></div>
        <div><small>Best sale</small><b>{coins(best.cents)}</b></div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Coins earned over time, reaching ${coins(run)}`}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(), tx = t0 + (((e.clientX - r.left) / r.width * W - L) / (W - L - R)) * span; let at = 0; points.forEach((p, i) => { if (Math.abs(p.t - tx) < Math.abs(points[at].t - tx)) at = i; }); setHover(at); }} onPointerLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} stroke="var(--line)" strokeWidth="1" opacity=".5" /><text x={L - 6} y={y(top * f) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{(top * f / 100).toFixed(0)}</text></g>)}
        <text x={L} y={H - 6} fontSize="11" fill="var(--muted)">{clock(t0)}</text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize="11" fill="var(--muted)">{clock(points[points.length - 1].t)}</text>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        {h && <><line x1={x(h.t)} x2={x(h.t)} y1={T} y2={H - B} stroke="var(--muted)" strokeWidth="1" /><circle cx={x(h.t)} cy={y(h.total)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" /></>}
      </svg>
      <p className="muted salesnote">{h ? `${clock(h.t)}: ${coins(h.s.cents)} from ${h.s.item} (${h.s.buyer}). ${coins(h.total)} in total.` : "Coins earned over time. Saved in this browser, so another device starts fresh."}</p>
      <div className="salesbars">
        <Bars title="By material" rows={totals(sales.filter((s) => s.kind === "sale"), (s) => s.item)} />
        <Bars title="By buyer" rows={totals(sales.filter((s) => s.kind === "sale"), (s) => s.buyer)} />
        {sales.some((s) => s.kind !== "sale") && <Bars title="Stalls and investments" rows={totals(sales.filter((s) => s.kind !== "sale"), (s) => s.buyer)} />}
      </div>
    </div>
  );
}
