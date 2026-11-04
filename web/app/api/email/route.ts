// Email sign-in: sends an 8-digit code, then swaps a correct code for a short-lived proof the wallet routes accept.
// Nothing is stored. The challenge is signed, so only this server can check it, and it can't be reused after it expires.
import { NextResponse } from "next/server";
import { makeChallenge, makeEmailProof, newCode, normalEmail, tooMany, checkChallenge } from "@/lib/near/email";

const no = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const { BREVO_API_KEY: apiKey, EMAIL_FROM: from, GOOGLE_LOGIN_SECRET: secret } = process.env;
  if (!apiKey || !from || !secret) return no("Email sign-in is not set up on this server.", 503);
  const body = await req.json().catch(() => ({})) as { action?: unknown; email?: unknown; code?: unknown; challenge?: unknown };
  const email = normalEmail(body.email);
  if (!email) return no("Enter a valid email address.");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  if (body.action === "send") {
    if (tooMany(`send:${email}`, 3, 10 * 60_000) || tooMany(`ip:${ip}`, 20, 60 * 60_000)) return no("Too many codes requested. Wait a few minutes and try again.", 429);
    const code = newCode();
    const sent = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { name: "Nearverse", email: from }, to: [{ email }], subject: `Your Nearverse code: ${code}`, textContent: `Your Nearverse sign-in code is ${code}. It works for 10 minutes. If you didn't ask for it, you can ignore this email.` }),
    }).catch(() => null);
    if (!sent?.ok) return no("We couldn't send the email. Try again, or sign in with Google.", 502);
    return NextResponse.json({ challenge: makeChallenge(email, code, secret) });
  }
  if (body.action === "verify") {
    if (tooMany(`try:${email}`, 8, 10 * 60_000)) return no("Too many tries. Request a new code in a few minutes.", 429);
    if (!checkChallenge(email, body.code, body.challenge, secret)) return no("That code isn't right, or it has expired.", 401);
    return NextResponse.json({ credential: makeEmailProof(email, secret) });
  }
  return no("Unknown action.");
}
