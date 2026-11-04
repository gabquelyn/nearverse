"use client";
// The browser side of sign-in with Google.
import { publicConfig } from "./config";

export const googleEnabled = () => Boolean(publicConfig().googleClientId || publicConfig().emailLogin);
export const googleButtonOn = () => Boolean(publicConfig().googleClientId);
export const emailOn = () => publicConfig().emailLogin;

export async function emailStep<T>(body: object): Promise<T> {
  const res = await fetch("/api/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({ error: "Email sign-in is unavailable right now." }));
  if (!res.ok) throw new Error(out.error);
  return out;
}

interface Gis { accounts: { id: { initialize(o: object): void; renderButton(el: HTMLElement, o: object): void } } }
const gis = () => (window as unknown as { google?: Gis }).google;

let loading: Promise<void> | null = null;
function load() {
  return (loading ??= new Promise<void>((yes, no) => {
    if (gis()) { yes(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = () => yes(); s.onerror = () => no(new Error("Couldn't reach Google. Check your connection."));
    document.head.appendChild(s);
  }));
}

export async function showGoogleButton(el: HTMLElement, onToken: (credential: string) => void) {
  await load();
  gis()!.accounts.id.initialize({ client_id: publicConfig().googleClientId, callback: (r: { credential: string }) => onToken(r.credential) });
  // Google only draws its own button. Ours shows, with Google's clear on top, so the click still goes through Google's secure sign-in.
  gis()!.accounts.id.renderButton(el, { theme: "outline", size: "large", text: "continue_with", width: Math.min(400, Math.max(200, el.offsetWidth)) });
}

export async function googleAction<T>(body: object): Promise<T> {
  const res = await fetch("/api/google", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({ error: "Sign-in is unavailable right now." }));
  if (!res.ok) throw new Error(out.error);
  return out;
}
