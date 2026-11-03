"use client";
// Social or email sign-in: creates your NEAR account, then adds a game key so play needs no more popups.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/ui/Nav";
import { CONTRACT, loadSession } from "@/lib/near/client";
import * as auth from "@/lib/near/login";

export default function SignIn() {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const started = useRef(false);
  const log = (s: string) => setLines((l) => [...l, s]);
  const stop = (e: unknown) => { log("Stopped: " + String((e as Error).message ?? e)); setBusy(false); };

  // Coming back from sign-in or the approval page: carry on without another click.
  useEffect(() => {
    const reply = new URLSearchParams(location.search);
    if (reply.has("error")) { log("Stopped: " + (reply.get("error_description") || reply.get("error"))); return; }
    if (started.current || !reply.has("code")) return;
    started.current = true;
    setBusy(true);
    if (!auth.hasPending()) { signIn(); return; }
    const kind = auth.pendingKind();
    auth.finishSessionKey(log).then(() => { log(kind === "credits" ? "Done. Returning to your profile." : "Done. Starting the game."); router.push(kind === "credits" ? "/profile" : "/play"); }).catch(stop);
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  async function signIn() {
    setBusy(true);
    try {
      const who = await auth.login(log);
      if (!who) return; // on the way to the sign-in page
      const { accountId, pub } = who;
      log(`Signed in. Your NEAR account is ${accountId}.`);
      if (loadSession()?.accountId === accountId) { log("This browser already has your game key."); router.push("/play"); return; }
      if (!(await auth.accountExists(accountId))) { log("Creating your account with free test funds."); await auth.fund(accountId, log); }
      await auth.requestSessionKey(accountId, pub, log); // leaves for the approval page, and comes back here
    } catch (e) { stop(e); }
  }

  return (
    <div className="page">
      <header><h1>Sign in</h1><Nav /></header>
      <div className="signin">
        <p style={{ marginTop: 0 }}>Use Google, Apple, email or a passkey. No seed phrase. You approve once, and after that the game signs for you with a key that can only play and can&apos;t move your NEAR.</p>
        {!CONTRACT && <div className="notice">Sign-in needs a deployed contract. See DEPLOY.md, or <Link href="/play">play in practice mode</Link>.</div>}
        <div className="row" style={{ marginBottom: 14 }}>
          <button className="btn action" disabled={!CONTRACT || busy} onClick={() => { auth.clearPending(); signIn(); }}>{busy ? "Working" : "Continue with Google or email"}</button>
          <Link className="btn ghost" href="/play">Play as a guest</Link>
        </div>
        <ol aria-live="polite">{lines.map((l, i) => <li key={i}>{l}</li>)}</ol>
      </div>
    </div>
  );
}
