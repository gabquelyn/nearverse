"use client";
import { create } from "zustand";
import { rules as c, activeEvent, investInMerchant, collectFromMerchant, newMarket, newPlayer, advanceTo, startGame, gather, sell, buy, repair, refuel, burnFuel, addCredits, claimLot, buildSection, takeDamage, buyVehicle, selectVehicle, buildStall, sellToStall, buyFromStall, stockStall, unstockStall, fundStall, collectStall, setStallSpread, listStall, buyListedStall, sellStallToCity, stallBidAt, stallAskAt, GameError, quoteSell, quoteBuy, ask, netWorth, tickOnce, coins, type Market, type Player } from "@nearverse/economy";
import { addSale, dropSale } from "../salesLog";
import * as near from "../near/client";

export const MESSAGES: Record<string, string> = {
  NOT_STARTED: "Press Start driving first.",
  COOLDOWN: "Still loading the last batch. Try again in a moment.",
  TRUCK_DAMAGED: "The truck is too damaged for this spot. Repair it from the top panel.",
  OUT_OF_FUEL: "Out of fuel. Refuel from the top panel.",
  NOT_ENOUGH_CREDITS: "You need more credits. Buy them with NEAR in your profile.",
  NOT_BUILT: "Build the stall first.",
  ALREADY_BUILT: "This stall is already built.",
  NODE_EMPTY: "This spot is picked clean. It regrows each market hour.",
  CARGO_FULL: "The truck bed is full. Sell or build first.",
  TRAVELING: "You just traded elsewhere. Merchants are a short drive apart.",
  BAD_QTY: "That quantity is not allowed.",
  NOT_ENOUGH_ITEMS: "You don't have enough materials.",
  PRICE_MOVED: "The price moved before your order landed. Check the board and try again.",
  MERCHANT_OUT_OF_CASH: "This merchant is out of cash. Try another stall.",
  MERCHANT_OUT_OF_STOCK: "This merchant has run out.",
  NOT_ENOUGH_COINS: "You don't have enough coins.",
  NOTHING_TO_REPAIR: "The truck is in full shape.",
  BLUEPRINT_DONE: "That blueprint is finished. Pick another.",
  ALREADY_OWNED: "You already own that vehicle.",
  NOT_OWNED: "Buy that vehicle in the shop first.",
  LOT_TAKEN: "Someone already owns this location.",
  NO_STALL: "No one has built a stall here yet.",
  DEPOSIT_TOO_SMALL: "That amount is too small to buy a credit.",
  YOUR_OWN_STALL: "That's your own stall.",
  NOT_YOUR_STALL: "Only the owner can do that.",
  BAD_SPREAD: "Choose a margin within the allowed range.",
  NOT_FOR_SALE: "That stall isn't for sale.",
  STALL_NOT_EMPTY: "Take all the stock out before selling this stall to the city.",
  MERCHANT_CLOSED: "This merchant is broke and closed. Invest to reopen the shop.",
  INVESTORS_FULL: "This merchant already has as many investors as it can take.",
  NOTHING_TO_COLLECT: "Nothing to collect from this merchant yet.",
  NETWORK: "That move didn't go through, so your game was corrected.",
  KEY_ALLOWANCE: "Your game key has run out. Approve a new one to keep playing.",
  NO_BALANCE: "Your wallet is out of NEAR for moves. Get more from your profile.",
};

export type Action =
  | { t: "gather"; node: number } | { t: "sell"; merchant: number; item: number; qty: number }
  | { t: "buy"; merchant: number; item: number; qty: number } | { t: "repair" } | { t: "refuel"; units: number } | { t: "burn_fuel"; units: number } | { t: "claim_lot"; lot: number } | { t: "damage"; points: number } | { t: "buy_vehicle"; vehicle: number } | { t: "select_vehicle"; vehicle: number }
  | { t: "build_stall"; lot: number } | { t: "stall_sell"; lot: number; item: number; qty: number } | { t: "stall_buy"; lot: number; item: number; qty: number }
  | { t: "stall_stock"; lot: number; item: number; qty: number } | { t: "stall_unstock"; lot: number; item: number; qty: number } | { t: "stall_fund"; lot: number; cents: number }
  | { t: "stall_collect"; lot: number } | { t: "stall_spread"; lot: number; bps: number } | { t: "stall_list"; lot: number; price: number } | { t: "stall_buy_listed"; lot: number } | { t: "stall_city"; lot: number } | { t: "build"; blueprint: number } | { t: "invest"; merchant: number; cents: number } | { t: "merchant_collect"; merchant: number };
export interface LogEntry { id: number; text: string; hash?: string | null; failed?: boolean }
type Mode = "practice" | "chain";
const SAVE = "nearverse.practice.v4", SEEN = "nearverse.seen.v4";
export const PRACTICE_ID = "you";
export interface Waypoint { x: number; z: number; label: string }

interface Save { market: Market; player: Player; genesis: number }
const readSave = (): Save | null => { try { const s = localStorage.getItem(SAVE); return s ? JSON.parse(s) : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable: play on in memory */ } };

let logId = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Saving waits a moment, so a burst of actions doesn't write to disk mid-drive. */
const saveSoon = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; const s = useGame.getState(); write(SAVE, { market: s.market, player: s.player, genesis: s.genesis }); }, 1200);
};
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;

interface State {
  ready: boolean; mode: Mode; market: Market; player: Player; genesis: number; session: near.Session | null;
  log: LogEntry[]; toast: { id: number; text: string; bad?: boolean; retry?: Action } | null; activity: { id: number; text: string }[]; toured: boolean; setToured(): void; slow: boolean; offline: boolean; keyExpired: boolean; closedZone: string | null; closeZone(): void; clearToast(): void; away: string[] | null;
  zone: { kind: "node" | "stall" | "plot" | "lot"; index: number } | null; waypoint: Waypoint | null; mapOpen: boolean; setWaypoint(w: Waypoint | null): void; setMapOpen(open: boolean): void; worldReady: boolean; setWorldReady(): void; board: { account_id: string; net_worth: number; sections_built: number }[];
  init(): Promise<void>; startDriving(): Promise<boolean>; act(a: Action): boolean; poll(): Promise<void>; say(text: string, bad?: boolean, retry?: Action): void;
  setZone(z: State["zone"]): void; dismissAway(): void; resetPractice(): void; advanceHours(n: number): void;
  buyCredits(near: number): Promise<void>; useGuest(): Promise<void>; signOut(): void;
}

const zoneKey = (z: State["zone"]) => (z ? `${z.kind}${z.index}` : null);
let lastAlert = 0, lastOwnMove = 0, activityId = 0, pollFailures = 0;

/** What changed between two readings of the market: trades, and any price move worth a mention. */
function pulse(prev: Market, now: Market) {
  const trades: string[] = [];
  let move = { d: 0, text: "" };
  c.merchants.forEach((m, j) => c.items.forEach((it, i) => {
    const qty = now.merchants[j].stock[i] - prev.merchants[j].stock[i], cash = now.merchants[j].cash - prev.merchants[j].cash;
    if (now.tick === prev.tick && qty && Math.sign(qty) === -Math.sign(cash)) trades.push(qty > 0 ? `${qty} ${it.name.toLowerCase()} sold to the ${m.name}` : `${-qty} ${it.name.toLowerCase()} bought from the ${m.name}`);
    const a = ask(c, prev, j, i), b = ask(c, now, j, i), d = (b - a) / a;
    if (Math.abs(d) > Math.abs(move.d)) move = { d, text: `${it.name} ${d > 0 ? "up" : "down"} ${Math.abs(Math.round(d * 100))}% at the ${m.name}` };
  }));
  return { trades, move: Math.abs(move.d) >= 0.05 ? move.text : null };
}

function report(prev: Market | null, now: Market): string[] | null {
  if (!prev || now.tick === prev.tick) return null;
  const out: string[] = [];
  let best = { d: 0, text: "" };
  c.items.forEach((it, i) => c.merchants.forEach((m, j) => {
    const a = ask(c, prev, j, i), b = ask(c, now, j, i), d = (b - a) / a;
    if (Math.abs(d) > Math.abs(best.d)) best = { d, text: `${it.name} ${d > 0 ? "rose" : "fell"} ${Math.abs(Math.round(d * 100))}% at the ${m.name}'s stall.` };
  }));
  if (Math.abs(best.d) >= 0.03) out.push(best.text);
  c.merchants.forEach((m, j) => c.items.forEach((it, i) => {
    const a = prev.merchants[j].target[i], b = now.merchants[j].target[i];
    if (a !== b && out.length < 3) out.push(`${m.name} now stocks ${Math.abs(Math.round(((b - a) / a) * 100))}% ${b > a ? "more" : "less"} ${it.name.toLowerCase()}.`);
  }));
  const poor = c.merchants.find((_, j) => now.merchants[j].cash < 5000);
  if (poor) out.push(`${poor.name} is nearly out of cash.`);
  return [`${now.tick - prev.tick} market hours passed.`, ...out];
}

function describe(a: Action, result: number): string {
  switch (a.t) {
    case "gather": return `Gathered ${result} ${c.items[c.nodes[a.node].item].name.toLowerCase()}`;
    case "sell": return `Sold ${a.qty} ${c.items[a.item].name.toLowerCase()} to ${c.merchants[a.merchant].name} for ${coins(result)}`;
    case "buy": return `Bought ${a.qty} ${c.items[a.item].name.toLowerCase()} from ${c.merchants[a.merchant].name} for ${coins(result)}`;
    case "repair": return "Repaired the truck";
    case "refuel": return `Refueled ${a.units}`;
    case "burn_fuel": return "";
    case "claim_lot": return `Bought the location ${c.lots[a.lot].name} for ${c.lots[a.lot].price} credits`;
    case "damage": return `Crashed: truck lost ${a.points} health`;
    case "buy_vehicle": return `Bought a ${c.vehicles[a.vehicle].name} for ${result} credits`;
    case "select_vehicle": return `Now driving the ${c.vehicles[a.vehicle].name}`;
    case "build_stall": return `Built a stall at ${c.lots[a.lot].name}`;
    case "stall_sell": return `Sold ${a.qty} ${c.items[a.item].name.toLowerCase()} at ${c.lots[a.lot].name} for ${coins(result)}`;
    case "stall_buy": return `Bought ${a.qty} ${c.items[a.item].name.toLowerCase()} at ${c.lots[a.lot].name} for ${coins(result)}`;
    case "stall_stock": return `Stocked ${a.qty} ${c.items[a.item].name.toLowerCase()} at ${c.lots[a.lot].name}`;
    case "stall_unstock": return `Took ${a.qty} ${c.items[a.item].name.toLowerCase()} from ${c.lots[a.lot].name}`;
    case "stall_fund": return `Put ${coins(a.cents)} into ${c.lots[a.lot].name}`;
    case "stall_collect": return `Collected ${coins(result)} from ${c.lots[a.lot].name}`;
    case "stall_spread": return `Set the margin at ${c.lots[a.lot].name} to ${a.bps / 100}%`;
    case "stall_list": return a.price ? `Listed ${c.lots[a.lot].name} for ${coins(a.price)}` : `Took ${c.lots[a.lot].name} off the market`;
    case "stall_buy_listed": return `Bought the stall at ${c.lots[a.lot].name}`;
    case "stall_city": return `Sold ${c.lots[a.lot].name} to the city for ${coins(result)}`;
    case "invest": return `Invested ${coins(a.cents)} in the ${c.merchants[a.merchant].name}`;
    case "merchant_collect": return `Collected ${coins(result)} from the ${c.merchants[a.merchant].name}`;
    case "build": return `Built a ${c.blueprints[a.blueprint].name.toLowerCase()} section`;
  }
}

export const useGame = create<State>((set, get) => ({
  ready: false, mode: "practice", market: newMarket(c), player: newPlayer(c), genesis: 0, session: null,
  log: [], toast: null, activity: [], toured: false, setToured() { set({ toured: true }); }, slow: false, offline: false, keyExpired: false, closedZone: null, away: null,
  closeZone() { set({ closedZone: zoneKey(get().zone) }); },
  clearToast() { set({ toast: null }); },
  zone: null, worldReady: false, setWorldReady() { set({ worldReady: true }); }, board: [], waypoint: null, mapOpen: false,
  setWaypoint(waypoint) { set({ waypoint }); },
  setMapOpen(mapOpen) { set({ mapOpen }); },

  async init() {
    if (get().ready) return;
    if (near.chainEnabled()) {
      const session = near.loadSession();
      if (near.tookOldKey()) { location.href = "/signin"; return; }
      set({ mode: "chain", session });
      await get().poll();
      let prev: Market | null = null;
      try { prev = JSON.parse(localStorage.getItem(SEEN) ?? "null"); } catch { /* no prior visit */ }
      set({ ready: true, away: report(prev, get().market) });
      setInterval(() => get().poll(), 4000);
    } else {
      const save = readSave();
      const genesis = save?.genesis ?? Date.now();
      const market = save?.market ?? newMarket(c);
      const prev = save ? JSON.parse(JSON.stringify(market)) as Market : null;
      advanceTo(c, market, Date.now(), genesis);
      set({ ready: true, mode: "practice", market, player: save?.player ?? newPlayer(c), genesis, away: report(prev, market) });
      write(SAVE, { market, player: get().player, genesis });
      setInterval(() => {
        const m = JSON.parse(JSON.stringify(get().market)) as Market;
        const before = m.tick; advanceTo(c, m, Date.now(), get().genesis);
        if (m.tick !== before) { set({ market: m }); write(SAVE, { market: m, player: get().player, genesis: get().genesis }); }
      }, 5000);
    }
    write(SEEN, get().market);
  },

  async poll() {
    if (!near.chainEnabled() || pending > 0) return;
    try {
      const [market, genesis, player, board] = await Promise.all([near.fetchMarket(), near.fetchGenesis(), get().session ? near.fetchPlayer(get().session!.accountId) : null, near.fetchLeaderboard()]);
      if (pending > 0) return;
      if (!market) return;
      const seen = get().market, change = get().ready ? pulse(seen, market) : { trades: [], move: null };
      const event = activeEvent(c, market.tick), wasEvent = activeEvent(c, seen.tick);
      set({ market, genesis, board, offline: false, activity: [...change.trades.map((text) => ({ id: ++activityId, text })), ...get().activity].slice(0, 20), ...(get().session ? { player: player ?? newPlayer(c) } : {}) });
      pollFailures = 0;
      const now = Date.now();
      if (event && event.title !== wasEvent?.title) get().say(event.title);
      else if (change.move && now - lastOwnMove > 6000 && now - lastAlert > 30_000) { lastAlert = now; get().say(change.move); }
    } catch { pollFailures++; if (pollFailures >= 3) set({ offline: true }); /* keep the last known state; the next poll retries */ }
  },

  async startDriving() {
    const s = get();
    if (s.player.started) return true;
    if (s.mode === "practice") {
      const p = JSON.parse(JSON.stringify(s.player)) as Player; startGame(c, p); set({ player: p });
      write(SAVE, { market: s.market, player: p, genesis: s.genesis });
      return true;
    }
    try {
      const session = s.session ?? await near.createGuest();
      set({ session });
      const existing = await near.fetchPlayer(session.accountId);
      if (!existing?.started) await near.callGame(session, "start_game", {});
      await get().poll();
      return true;
    } catch (e) {
      console.error("Couldn't start the game:", e);
      if (near.errorCode(e) === "OLD_KEY") { near.saveSession(null); location.href = "/signin"; return false; }
      get().say(`Couldn't start: ${near.errorDetail(e)}`, true);
      return false;
    }
  },

  useGuest: async () => { const session = await near.createGuest(); set({ session }); await get().startDriving(); },
  signOut() { near.saveSession(null); set({ session: null, player: newPlayer(c) }); },

  act(a) {
    const s = get();
    const mk = JSON.parse(JSON.stringify(s.market)) as Market, p = JSON.parse(JSON.stringify(s.player)) as Player;
    const now = Date.now(), who = s.session?.accountId ?? PRACTICE_ID;
    let result = 0, args: { method: string; args: object } | null = null;
    try {
      switch (a.t) {
        case "gather": result = gather(c, mk, p, a.node, now); args = { method: "gather", args: { node: a.node } }; break;
        case "sell": {
          const min = Math.floor(quoteSell(c, s.market, a.merchant, a.item, a.qty) * 0.97);
          result = sell(c, mk, p, a.merchant, a.item, a.qty, min, now);
          args = { method: "sell", args: { merchant: a.merchant, item: a.item, qty: a.qty, min_total: min } }; break;
        }
        case "buy": {
          const max = Math.ceil(quoteBuy(c, s.market, a.merchant, a.item, a.qty) * 1.03);
          result = buy(c, mk, p, a.merchant, a.item, a.qty, max, now);
          args = { method: "buy", args: { merchant: a.merchant, item: a.item, qty: a.qty, max_total: max } }; break;
        }
        case "buy_vehicle": result = buyVehicle(c, p, a.vehicle); args = { method: "buy_vehicle", args: { vehicle: a.vehicle } }; break;
        case "select_vehicle": selectVehicle(c, p, a.vehicle); args = { method: "select_vehicle", args: { vehicle: a.vehicle } }; break;
        case "build_stall": buildStall(c, mk, p, who, a.lot); args = { method: "build_stall", args: { lot: a.lot } }; break;
        case "stall_sell": {
          const st = s.market.stalls[a.lot]; let q = 0; for (let i = 0; i < a.qty; i++) q += stallBidAt(c, a.item, st.spread_bps, st.stock[a.item] + i);
          const min = Math.floor(q * 0.97);
          result = sellToStall(c, mk, p, who, a.lot, a.item, a.qty, min, now); args = { method: "stall_sell", args: { lot: a.lot, item: a.item, qty: a.qty, min_total: min } }; break;
        }
        case "stall_buy": {
          const st = s.market.stalls[a.lot]; let q = 0; for (let i = 0; i < a.qty; i++) q += stallAskAt(c, a.item, st.spread_bps, Math.max(0, st.stock[a.item] - i));
          const max = Math.ceil(q * 1.03);
          result = buyFromStall(c, mk, p, who, a.lot, a.item, a.qty, max, now); args = { method: "stall_buy", args: { lot: a.lot, item: a.item, qty: a.qty, max_total: max } }; break;
        }
        case "stall_stock": stockStall(c, mk, p, who, a.lot, a.item, a.qty); args = { method: "stall_stock", args: { lot: a.lot, item: a.item, qty: a.qty } }; break;
        case "stall_unstock": unstockStall(c, mk, p, who, a.lot, a.item, a.qty); args = { method: "stall_unstock", args: { lot: a.lot, item: a.item, qty: a.qty } }; break;
        case "stall_fund": fundStall(c, mk, p, who, a.lot, a.cents); args = { method: "stall_fund", args: { lot: a.lot, cents: a.cents } }; break;
        case "stall_collect": result = collectStall(c, mk, p, who, a.lot); args = { method: "stall_collect", args: { lot: a.lot } }; break;
        case "stall_spread": setStallSpread(c, mk, p, who, a.lot, a.bps); args = { method: "stall_spread", args: { lot: a.lot, bps: a.bps } }; break;
        case "stall_list": listStall(c, mk, p, who, a.lot, a.price); args = { method: "stall_list", args: { lot: a.lot, price: a.price } }; break;
        case "stall_buy_listed": buyListedStall(c, mk, p, who, a.lot); args = { method: "stall_buy_listed", args: { lot: a.lot } }; break;
        case "stall_city": result = sellStallToCity(c, mk, p, who, a.lot); args = { method: "stall_sell_to_city", args: { lot: a.lot } }; break;
        case "damage": takeDamage(c, p, a.points); args = { method: "take_damage", args: { points: a.points } }; break;
        case "repair": repair(c, p); args = { method: "repair", args: {} }; break;
        case "refuel": refuel(c, p, a.units); args = { method: "refuel", args: { units: a.units } }; break;
        case "burn_fuel": burnFuel(c, p, a.units); args = { method: "burn_fuel", args: { units: a.units } }; break;
        case "claim_lot": claimLot(c, mk, p, who, a.lot); args = { method: "claim_lot", args: { lot: a.lot } }; break;
        case "invest": investInMerchant(c, mk, p, who, a.merchant, a.cents); args = { method: "merchant_invest", args: { merchant: a.merchant, cents: a.cents } }; break;
        case "merchant_collect": result = collectFromMerchant(mk, p, who, a.merchant); args = { method: "merchant_collect", args: { merchant: a.merchant } }; break;
        case "build": buildSection(c, mk, p, a.blueprint); args = { method: "build_section", args: { blueprint: a.blueprint } }; break;
      }
    } catch (e) {
      if (e instanceof GameError) { get().say(MESSAGES[e.code] ?? e.code, true); return false; }
      throw e;
    }
    const text = describe(a, result);
    const entry: LogEntry = { id: ++logId, text };
    set(text ? { market: mk, player: p, log: [entry, ...s.log].slice(0, 30) } : { market: mk, player: p });
    if (a.t !== "burn_fuel") lastOwnMove = now;
    const saleId = ++logId;
    if (a.t === "sell") addSale(who, { id: saleId, t: now, cents: result, item: c.items[a.item].name, buyer: c.merchants[a.merchant].name, kind: "sale" });
    if (a.t === "stall_sell") addSale(who, { id: saleId, t: now, cents: result, item: c.items[a.item].name, buyer: c.lots[a.lot].name, kind: "sale" });
    if (a.t === "stall_collect" && result > 0) addSale(who, { id: saleId, t: now, cents: result, item: "stall till", buyer: c.lots[a.lot].name, kind: "stall" });
    if (a.t === "merchant_collect") addSale(who, { id: saleId, t: now, cents: result, item: "investment", buyer: c.merchants[a.merchant].name, kind: "investment" });
    if (s.mode === "practice") {
      if (a.t === "sell" || a.t === "buy") set({ activity: [{ id: ++activityId, text: a.t === "sell" ? `${a.qty} ${c.items[a.item].name.toLowerCase()} sold to the ${c.merchants[a.merchant].name}` : `${a.qty} ${c.items[a.item].name.toLowerCase()} bought from the ${c.merchants[a.merchant].name}` }, ...get().activity].slice(0, 20) });
      saveSoon(); return true;
    }
    // Optimistic: the game answers now and a queue confirms on-chain in order, in the background.
    const session = s.session!;
    pending++;
    queue = queue.then(async () => {
      const slow = setTimeout(() => set({ slow: true }), 8000);
      try {
        // Never let one stuck move hold up the rest or stop the game correcting itself.
        const { hash } = await Promise.race([near.callGame(session, args!.method, args!.args), new Promise<never>((_, no) => setTimeout(() => no(new Error("timed out")), 30_000))]);
        set({ log: get().log.map((l) => (l.id === entry.id ? { ...l, hash } : l)) });
      } catch (err) {
        set({ log: get().log.map((l) => (l.id === entry.id ? { ...l, failed: true } : l)) });
        dropSale(who, saleId);
        const code = near.errorCode(err);
        if (code === "OLD_KEY") { near.saveSession(null); location.href = "/signin"; return; }
        if (code === "KEY_ALLOWANCE" && session.kind !== "guest") set({ keyExpired: true });
        else if (a.t !== "burn_fuel") get().say(MESSAGES[code] ?? MESSAGES.NETWORK, true, code === "NETWORK" ? a : undefined);
      } finally {
        clearTimeout(slow); set({ slow: false });
        pending--; if (pending === 0) await get().poll();
      }
    });
    return true;
  },

  say(text, bad, retry) { const id = ++logId; set({ toast: { id, text, bad, retry } }); setTimeout(() => { if (get().toast?.id === id) set({ toast: null }); }, retry ? 8000 : 3600); },
  setZone(zone) { const z = get().zone; if (z?.kind !== zone?.kind || z?.index !== zone?.index) set({ zone, closedZone: null }); },
  dismissAway() { set({ away: null }); },
  resetPractice() { try { localStorage.removeItem(SAVE); } catch { /* nothing saved */ } set({ market: newMarket(c), player: newPlayer(c), genesis: Date.now(), log: [] }); },
  advanceHours(n) {
    if (get().mode !== "practice") return;
    const mk = JSON.parse(JSON.stringify(get().market)) as Market;
    for (let i = 0; i < n; i++) tickOnce(c, mk);
    const genesis = get().genesis - n * c.tick_ms;
    set({ market: mk, genesis }); write(SAVE, { market: mk, player: get().player, genesis });
  },
  async buyCredits(amount) {
    const s = get();
    if (!(amount > 0)) { get().say("Enter an amount of NEAR.", true); return; }
    const credits = Math.floor(amount * c.credits_per_near);
    if (s.mode === "practice") {
      const p = JSON.parse(JSON.stringify(s.player)) as Player;
      try { addCredits(p, credits); } catch (e) { get().say(MESSAGES[(e as GameError).code] ?? "Start the game first.", true); return; }
      set({ player: p }); saveSoon(); get().say(`Added ${credits} practice credits. No real NEAR was spent.`); return;
    }
    if (s.session?.kind === "google") { location.href = `/signin?google=credits&near=${amount}`; return; }
    if (s.session?.kind === "login") {
      // A signed-in player's game key can't attach NEAR, so each purchase takes one approval.
      try { const auth = await import("../near/login"); await auth.requestBuyCredits(amount); } catch (e) { get().say(String((e as Error).message ?? e), true); }
      return;
    }
    try {
      await near.callGame(s.session!, "buy_credits", {}, { deposit: `${amount} NEAR` });
      get().say(`Bought ${credits} credits.`); await get().poll();
    } catch (e) { get().say(MESSAGES[near.errorCode(e)] ?? MESSAGES.NETWORK, true); }
  },
}));

export const worth = (p: Player) => netWorth(c, p);
