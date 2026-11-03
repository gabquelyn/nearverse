"use client";
import { create } from "zustand";
import { rules as c, newMarket, newPlayer, advanceTo, startGame, gather, sell, buy, repair, buildSection, deposit, withdraw, GameError, quoteSell, quoteBuy, ask, netWorth, tickOnce, coins, type Market, type Player } from "@nearverse/economy";
import * as near from "../near/client";

export const MESSAGES: Record<string, string> = {
  NOT_STARTED: "Press Start driving first.",
  COOLDOWN: "Still loading the last batch. Try again in a moment.",
  TRUCK_DAMAGED: "The truck is too damaged for this spot. Repair it at the Foreman's stall.",
  OUT_OF_FUEL: "Out of fuel. Fill up at the pump yard or buy fuel from a merchant.",
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
  OVER_DEPOSIT_CAP: "You can only withdraw what you deposited. Earnings stay in the game.",
  NETWORK: "Testnet didn't confirm that action, so your state was reloaded from the chain.",
};

export type Action =
  | { t: "gather"; node: number } | { t: "sell"; merchant: number; item: number; qty: number }
  | { t: "buy"; merchant: number; item: number; qty: number } | { t: "repair" } | { t: "build"; blueprint: number };
export interface LogEntry { id: number; text: string; hash?: string | null; failed?: boolean }
type Mode = "practice" | "chain";
const SAVE = "nearverse.practice.v1", SEEN = "nearverse.seen.v1";

interface Save { market: Market; player: Player; genesis: number }
const readSave = (): Save | null => { try { const s = localStorage.getItem(SAVE); return s ? JSON.parse(s) : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable: play on in memory */ } };

let logId = 0;
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;

interface State {
  ready: boolean; mode: Mode; market: Market; player: Player; genesis: number; session: near.Session | null;
  log: LogEntry[]; toast: { id: number; text: string; bad?: boolean } | null; away: string[] | null;
  zone: { kind: "node" | "stall" | "plot"; index: number } | null; gatherProgress: number; board: { account_id: string; net_worth: number; sections_built: number }[];
  init(): Promise<void>; startDriving(): Promise<boolean>; act(a: Action): boolean; poll(): Promise<void>; say(text: string, bad?: boolean): void;
  setZone(z: State["zone"]): void; setGatherProgress(n: number): void; dismissAway(): void; resetPractice(): void; advanceHours(n: number): void;
  depositNear(near: number): Promise<void>; withdrawCoins(cents: number): Promise<void>; useGuest(): Promise<void>; signOut(): void;
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
    case "build": return `Built a ${c.blueprints[a.blueprint].name.toLowerCase()} section`;
  }
}

export const useGame = create<State>((set, get) => ({
  ready: false, mode: "practice", market: newMarket(c), player: newPlayer(c), genesis: 0, session: null,
  log: [], toast: null, away: null, zone: null, gatherProgress: 0, board: [],

  async init() {
    if (get().ready) return;
    if (near.chainEnabled()) {
      const session = near.loadSession();
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
      set({ market, genesis, board, ...(get().session ? { player: player ?? newPlayer(c) } : {}) });
    } catch { /* keep the last known state; the next poll retries */ }
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
    } catch (e) { get().say(String((e as Error).message ?? e), true); return false; }
  },

  useGuest: async () => { const session = await near.createGuest(); set({ session }); await get().startDriving(); },
  signOut() { near.saveSession(null); set({ session: null, player: newPlayer(c) }); },

  act(a) {
    const s = get();
    const mk = JSON.parse(JSON.stringify(s.market)) as Market, p = JSON.parse(JSON.stringify(s.player)) as Player;
    const now = Date.now();
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
        case "repair": repair(c, mk, p); args = { method: "repair", args: {} }; break;
        case "build": buildSection(c, mk, p, a.blueprint); args = { method: "build_section", args: { blueprint: a.blueprint } }; break;
      }
    } catch (e) {
      if (e instanceof GameError) { get().say(MESSAGES[e.code] ?? e.code, true); return false; }
      throw e;
    }
    const text = describe(a, result);
    const entry: LogEntry = { id: ++logId, text };
    set({ market: mk, player: p, log: [entry, ...s.log].slice(0, 30) });
    if (s.mode === "practice") { write(SAVE, { market: mk, player: p, genesis: s.genesis }); return true; }
    // Optimistic: the game answers now and a queue confirms on-chain in order, in the background.
    const session = s.session!;
    pending++;
    queue = queue.then(async () => {
      try {
        const { hash } = await near.callGame(session, args!.method, args!.args);
        set({ log: get().log.map((l) => (l.id === entry.id ? { ...l, hash } : l)) });
      } catch (err) {
        set({ log: get().log.map((l) => (l.id === entry.id ? { ...l, failed: true } : l)) });
        get().say(MESSAGES[near.errorCode(err)] ?? MESSAGES.NETWORK, true);
      } finally {
        pending--; if (pending === 0) await get().poll();
      }
    });
    return true;
  },

  say(text, bad) { const id = ++logId; set({ toast: { id, text, bad } }); setTimeout(() => { if (get().toast?.id === id) set({ toast: null }); }, 3600); },
  setZone(zone) { const z = get().zone; if (z?.kind !== zone?.kind || z?.index !== zone?.index) set({ zone }); },
  setGatherProgress(gatherProgress) { set({ gatherProgress }); },
  dismissAway() { set({ away: null }); },
  resetPractice() { try { localStorage.removeItem(SAVE); } catch { /* nothing saved */ } set({ market: newMarket(c), player: newPlayer(c), genesis: Date.now(), log: [] }); },
  advanceHours(n) {
    if (get().mode !== "practice") return;
    const mk = JSON.parse(JSON.stringify(get().market)) as Market;
    for (let i = 0; i < n; i++) tickOnce(c, mk);
    const genesis = get().genesis - n * c.tick_ms;
    set({ market: mk, genesis }); write(SAVE, { market: mk, player: get().player, genesis });
  },
  async depositNear(amount) {
    const s = get();
    if (s.mode === "practice") { const p = JSON.parse(JSON.stringify(s.player)) as Player; try { deposit(c, p, Math.floor(amount * c.cents_per_near)); } catch (e) { get().say(MESSAGES[(e as GameError).code], true); return; } set({ player: p }); write(SAVE, { market: s.market, player: p, genesis: s.genesis }); get().say("Deposited practice funds."); return; }
    try { await near.callGame(s.session!, "deposit", {}, { deposit: `${amount} NEAR` }); get().say("Deposit confirmed."); await get().poll(); } catch (e) { get().say(MESSAGES[near.errorCode(e)] ?? MESSAGES.NETWORK, true); }
  },
  async withdrawCoins(cents) {
    const s = get();
    if (s.mode === "practice") { const p = JSON.parse(JSON.stringify(s.player)) as Player; try { withdraw(p, cents); } catch (e) { get().say(MESSAGES[(e as GameError).code], true); return; } set({ player: p }); write(SAVE, { market: s.market, player: p, genesis: s.genesis }); get().say("Withdrew practice funds."); return; }
    try { await near.callGame(s.session!, "withdraw", { cents }, { deposit: "1 yocto" }); get().say("Withdrawal confirmed."); await get().poll(); } catch (e) { get().say(MESSAGES[near.errorCode(e)] ?? MESSAGES.NETWORK, true); }
  },
}));

export const worth = (p: Player) => netWorth(c, p);
