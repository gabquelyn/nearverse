// A record of what you earned, kept in this browser. The contract only stores balances, so this is the source of the sales chart.
export interface Sale { id: number; t: number; cents: number; qty?: number; item: string; buyer: string; kind: "sale" | "stall" | "investment" }
const key = (who: string) => `nearverse.sales.v1.${who}`;
const MAX = 500;

export function readSales(who: string): Sale[] {
  try { return JSON.parse(localStorage.getItem(key(who)) ?? "[]"); } catch { return []; }
}
export function addSale(who: string, sale: Sale) {
  try { localStorage.setItem(key(who), JSON.stringify([...readSales(who), sale].slice(-MAX))); } catch { /* not remembered */ }
}
/** A move the chain refused shouldn't count. */
export function dropSale(who: string, id: number) {
  try { localStorage.setItem(key(who), JSON.stringify(readSales(who).filter((s) => s.id !== id))); } catch { /* not remembered */ }
}
