// Other cars in the world. Positions travel over Ably and never touch the contract, so a faked one can only draw a car in the wrong place.
import { publicConfig } from "./near/config";

export interface Trip { fx: number; fz: number; tx: number; tz: number; at: number; ms: number }
export interface OtherCar { id: string; name: string; kind: "player" | "ghost"; x: number; z: number; yaw: number; vehicle: number; speed: number; toX: number; toZ: number; toYaw: number; seen: number; trip?: Trip }
export const others = new Map<string, OtherCar>();
export const realtimeEnabled = () => publicConfig().realtime;

/** What the "online" chip shows, including why live cars aren't working. */
export const link: { state: "off" | "connecting" | "live" | "failed"; reason: string } = { state: "off", reason: "" };
const fail = (reason: string) => { link.state = "failed"; link.reason = reason; console.warn("Live cars:", reason); };

const PLAYER_TIMEOUT = 20_000, GHOST_TIMEOUT = 120_000;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Takes one message from the service or the test hook. Anything malformed is ignored. */
export function ingest(name: string, data: Record<string, unknown>, at = Date.now()) {
  const id = typeof data.id === "string" ? data.id.slice(0, 40) : null;
  if (!id) return;
  const label = typeof data.n === "string" ? data.n.slice(0, 28) : "Driver";
  const vehicle = Math.max(0, Math.floor(num(data.k) ?? 0));
  if (name === "pos") {
    const x = num(data.x), z = num(data.z), yaw = num(data.y);
    if (x === null || z === null || yaw === null) return;
    const had = others.get(id);
    others.set(id, { id, name: label, kind: "player", x: had?.x ?? x, z: had?.z ?? z, yaw: had?.yaw ?? yaw, vehicle, speed: num(data.v) ?? 0, toX: x, toZ: z, toYaw: yaw, seen: at });
  } else if (name === "trip") {
    const fx = num(data.fx), fz = num(data.fz), tx = num(data.tx), tz = num(data.tz), start = num(data.at), ms = num(data.ms);
    if (fx === null || fz === null || tx === null || tz === null || start === null || ms === null) return;
    others.set(id, { id, name: label, kind: "ghost", x: fx, z: fz, yaw: Math.atan2(tx - fx, tz - fz), vehicle, speed: 0, toX: tx, toZ: tz, toYaw: 0, seen: at, trip: { fx, fz, tx, tz, at: start, ms } });
  }
}

export function forgetStale(now = Date.now()) {
  for (const [id, car] of others) if (now - car.seen > (car.kind === "ghost" ? GHOST_TIMEOUT : PLAYER_TIMEOUT)) others.delete(id);
}

interface Me { name: string; x: number; z: number; yaw: number; speed: number; vehicle: number }

/** Connects and starts sharing this car. Publishing about twice a second keeps Ably's free message allowance in reach. */
export function startRealtime(me: () => Me | null) {
  if (!realtimeEnabled()) return () => {};
  let stopped = false, close = () => {};
  const id = `p${Math.random().toString(36).slice(2, 8)}`;
  (async () => {
    const Ably = (await import("ably")).default;
    if (stopped) return;
    link.state = "connecting";
    const client = new Ably.Realtime({ authUrl: "/api/realtime", echoMessages: false });
    client.connection.on("connected", () => { link.state = "live"; link.reason = ""; });
    for (const bad of ["failed", "suspended", "disconnected"] as const) client.connection.on(bad, (c) => fail(c.reason?.message ?? bad));
    const players = client.channels.get("nearverse:players"), ghosts = client.channels.get("nearverse:ghosts", { params: { rewind: "90s" } });
    players.subscribe("pos", (m) => ingest("pos", m.data ?? {}, Date.now())).catch((e) => fail(String(e?.message ?? e)));
    ghosts.subscribe("trip", (m) => ingest("trip", m.data ?? {}, Date.now())).catch((e) => fail(String(e?.message ?? e)));
    let last = { x: 1e9, z: 1e9, at: 0 };
    const timer = setInterval(() => {
      const c = me(); const now = Date.now();
      // Keeps reporting from a window that's behind another one, which browsers count as hidden.
      if (!c) return;
      if (Math.hypot(c.x - last.x, c.z - last.z) < 0.5 && now - last.at < 3000) return;
      last = { x: c.x, z: c.z, at: now };
      players.publish("pos", { id, n: c.name, x: +c.x.toFixed(1), z: +c.z.toFixed(1), y: +c.yaw.toFixed(2), v: +c.speed.toFixed(1), k: c.vehicle }).catch((e) => fail(String(e?.message ?? e)));
    }, 450);
    close = () => { clearInterval(timer); client.close(); };
    if (stopped) close();
  })().catch((e) => fail(String(e?.message ?? e))); // the game plays on without other cars
  return () => { stopped = true; close(); others.clear(); };
}
