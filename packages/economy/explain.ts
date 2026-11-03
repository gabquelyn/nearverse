// Builds the tooltip text from the same inputs the contract uses.
import type { Config, Market } from "./types";
import { stockPrice, premiumFor, bid, ask, currentBlueprint } from "./price";

const pct = (bps: number) => `${bps >= 0 ? "+" : "−"}${(Math.abs(bps) / 100).toFixed(bps % 100 ? 1 : 0)}%`;
export const coins = (cents: number) => (cents / 100).toFixed(2);

export interface Explanation { price: number; lines: string[]; sentence: string }

export function explainPrice(c: Config, mk: Market, merchant: number, item: number, side: "bid" | "ask"): Explanation {
  const rules = c.merchants[merchant], s = mk.merchants[merchant], it = c.items[item];
  const target = s.target[item], stock = s.stock[item];
  const sp = stockPrice(c, it.base_price, target, stock, rules.k_quarters);
  const devBps = target === 0 ? 0 : Math.round(((stock - target) * 10000) / target);
  const fx = Math.round(((sp - it.base_price) * 10000) / it.base_price);
  const where = devBps === 0 ? "stock on target" : `stock ${Math.abs(Math.round(devBps / 100))}% ${devBps < 0 ? "below" : "above"} target`;
  const parts = [`${where} (${pct(fx)})`];
  const lines = [`Base price ${coins(it.base_price)}. Has ${stock}, wants ${target}.`, `${where} moves it ${pct(fx)}.`];
  if (sp === Math.floor((it.base_price * c.floor_bps) / 10000)) lines.push("Held at the price floor.");
  if (sp === Math.floor((it.base_price * c.ceiling_bps) / 10000)) lines.push("Held at the price ceiling.");
  if (side === "bid") {
    const prem = premiumFor(c, merchant, item, mk.tick);
    if (prem) {
      const name = c.blueprints[currentBlueprint(c, mk.tick)].name;
      parts.push(`${rules.name.toLowerCase()} blueprint demand (${pct(prem)})`);
      lines.push(`${name} blueprint needs this: ${pct(prem)}.`);
    }
    parts.push(`spread (${pct(-rules.spread_bps)})`);
    lines.push(`${rules.name}'s margin: ${pct(-rules.spread_bps)}.`);
  } else {
    parts.push(`spread (${pct(rules.spread_bps)})`);
    lines.push(`${rules.name}'s margin: ${pct(rules.spread_bps)}.`);
  }
  const price = side === "bid" ? bid(c, mk, merchant, item) : ask(c, mk, merchant, item);
  return { price, lines, sentence: `${it.name} ${coins(price)}: ${parts.join(", ")}.` };
}
