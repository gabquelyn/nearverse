// Server only. Signed, self-contained email codes and proofs, so sign-in needs no database.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

const CODE_MS = 10 * 60_000, PROOF_MS = 30 * 60_000;
const sign = (secret: string, text: string) => createHmac("sha256", secret).update(`nearverse-email-v1:${text}`).digest("base64url");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const normalEmail = (e: unknown) => (typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()) ? e.trim().toLowerCase() : null);
export const newCode = () => String(randomInt(10_000_000, 100_000_000));

export function makeChallenge(email: string, code: string, secret: string, now = Date.now()) {
  const exp = now + CODE_MS;
  return `${exp}.${sign(secret, `code|${email}|${code}|${exp}`)}`;
}
export function checkChallenge(email: string, code: unknown, challenge: unknown, secret: string, now = Date.now()) {
  if (typeof code !== "string" || typeof challenge !== "string") return false;
  const [exp, mac] = challenge.split(".");
  if (!mac || Number(exp) < now) return false;
  return same(mac, sign(secret, `code|${email}|${code.trim()}|${exp}`));
}

/** Shows this browser proved it owns the address. The wallet routes accept it like a Google token. */
export function makeEmailProof(email: string, secret: string, now = Date.now()) {
  const exp = now + PROOF_MS, payload = Buffer.from(JSON.stringify({ email, exp })).toString("base64url");
  return `email.${payload}.${sign(secret, `proof|${payload}`)}`;
}
export function readEmailProof(proof: string, secret: string, now = Date.now()): string | null {
  const [, payload, mac] = proof.split(".");
  if (!payload || !mac || !same(mac, sign(secret, `proof|${payload}`))) return null;
  try { const { email, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()); return exp >= now && normalEmail(email) ? email : null; } catch { return null; }
}

// Slows abuse. It's per server instance, so it's a brake, not a wall; the 8-digit code does the real work.
const hits = new Map<string, number[]>();
export function tooMany(key: string, limit: number, windowMs: number, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now); hits.set(key, recent);
  return recent.length > limit;
}
