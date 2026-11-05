// Which materials you've found, kept in this browser. The contract stores what you hold, not where it came from.
export interface Found { first: number; loads: number; qty: number }
const key = (who: string) => `nearverse.found.v1.${who}`;

export function readFound(who: string): Record<string, Found> {
  try { return JSON.parse(localStorage.getItem(key(who)) ?? "{}"); } catch { return {}; }
}
/** Returns true the first time this material is found. */
export function noteFind(who: string, item: string, qty: number, now = Date.now()) {
  const all = readFound(who), was = all[item];
  all[item] = { first: was?.first ?? now, loads: (was?.loads ?? 0) + 1, qty: (was?.qty ?? 0) + qty };
  try { localStorage.setItem(key(who), JSON.stringify(all)); } catch { /* not remembered */ }
  return !was;
}
