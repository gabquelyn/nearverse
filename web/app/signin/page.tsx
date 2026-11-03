"use client";
// Social or email sign-in: creates your NEAR account, then adds a game key so play needs no more popups.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/ui/Nav";
import { StepRail, type RailStep } from "@/components/ui/StepRail";
import { Secret } from "@/components/ui/WalletExport";
import { CONTRACT, loadSession, saveSession, shortAccount, type Session } from "@/lib/near/client";
import * as auth from "@/lib/near/login";

const FLOWS: Record<auth.PendingKind, { title: string; steps: [auth.StepId, string][] }> = {
  key: { title: "Setting up your wallet", steps: [["signin", "Sign in"], ["wallet", "Find your NEAR wallet"], ["funds", "Add free test funds"], ["approve", "Approve the game key"], ["mpc", "Sign with the NEAR network"], ["finish", "Add the game key"]] },
  credits: { title: "Buying credits", steps: [["approve", "Approve the purchase"], ["mpc", "Sign with the NEAR network"], ["finish", "Buy the credits"]] },
  export: { title: "Exporting your wallet", steps: [["approve", "Approve the new key"], ["mpc", "Sign with the NEAR network"], ["finish", "Add the key to your wallet"]] },
};

function friendly(e: unknown) {
  const text = String((e as Error)?.message ?? e);
  if (text.includes("USER_NOT_LOGGED_IN")) return "Your sign-in has expired. Try again.";
  if (/access key .* doesn't exist/i.test(text)) return "The network hasn't caught up with your wallet yet. Try again in a moment.";
  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}

export default function SignIn() {
  const [kind, setKind] = useState<auth.PendingKind>("key");
  const [at, setAt] = useState(-1), [failed, setFailed] = useState<string | null>(null), [finished, setFinished] = useState(false);
  const [details, setDetails] = useState<Partial<Record<auth.StepId, string>>>({});
  const [exported, setExported] = useState<auth.ExportedKey | null>(null);
  const [existing, setExisting] = useState<Session | null>(null);
  const router = useRouter();
  const started = useRef(false);
  const flow = FLOWS[kind];
  const running = at >= 0 && !failed && !finished;

  const progress = (forKind: auth.PendingKind): auth.Progress => (id, detail) => {
    setAt(FLOWS[forKind].steps.findIndex(([s]) => s === id));
    if (detail) setDetails((d) => ({ ...d, [id]: detail }));
  };
  const stop = (e: unknown) => setFailed(friendly(e));

  // Coming back from sign-in or the approval page: carry on without another click.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const reply = new URLSearchParams(location.search);
    const pending = auth.hasPending() ? auth.pendingKind() : null;
    if (reply.has("error")) {
      setKind(pending ?? "key");
      setAt(0);
      if (pending) auth.clearPending();
      setFailed(reply.get("error_description") || reply.get("error"));
      return;
    }
    if (!reply.has("code")) { setExisting(loadSession()); return; }
    if (!pending) { signIn(); return; }
    setKind(pending);
    auth.finishApproval(progress(pending)).then((done) => {
      setFinished(true);
      if (done.exported) { setExported(done.exported); return; }
      router.push(pending === "credits" ? "/profile" : "/play");
    }).catch(stop);
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  async function signIn() {
    setKind("key"); setFailed(null); setFinished(false); setDetails({}); setAt(0);
    const on = progress("key");
    try {
      const who = await auth.login(on);
      if (!who) return; // on the way to the sign-in page
      const { accountId, pub } = who;
      on("wallet", shortAccount(accountId));
      if (loadSession()?.accountId === accountId) { setFinished(true); router.push("/play"); return; }
      if (await auth.accountExists(accountId)) on("funds", "Already funded");
      else { on("funds"); await auth.fund(accountId); }
      await auth.requestSessionKey(accountId, pub, on); // leaves for the approval page, and comes back here
    } catch (e) { stop(e); }
  }

  const steps: RailStep[] = flow.steps.map(([id, label], i) => ({
    id, label, detail: i === at && failed ? failed : details[id],
    state: i < at || (i === at && finished) ? "done" : i === at ? (failed ? "failed" : "active") : "todo",
  }));
  const again = kind === "key";

  return (
    <div className="page">
      <header><h1>Sign in</h1><Nav /></header>
      <div className="signin">
        {exported ? <section className="card">
          <h2>Save your seed phrase</h2>
          <p>This shows once. Write it down and keep it private, because anyone who has it controls this wallet.</p>
          <Secret label="Seed phrase" value={exported.seedPhrase} />
          <Secret label="Private key" value={exported.secretKey} />
          <Secret label="Account" value={exported.accountId} />
          <button className="btn action" onClick={() => router.push("/profile")}>I saved it</button>
        </section> : at >= 0 ? <section className="card">
          <h2>{flow.title}</h2>
          <StepRail steps={steps} />
          {failed && <div className="row">
            {again ? <button className="btn action" onClick={() => { auth.clearPending(); signIn(); }}>Try again</button> : <Link className="btn action" href="/profile">Back to profile</Link>}
            {again && <Link className="btn ghost" href="/play">Play as a guest</Link>}
          </div>}
          {running && <p className="muted">Keep this page open. You may be sent to an approval page and back.</p>}
        </section> : existing ? <section className="card">
          <h2>You&apos;re already signed in</h2>
          <p>This browser has a key for <code title={existing.accountId}>{shortAccount(existing.accountId)}</code>.</p>
          <div className="row">
            <Link className="btn action" href="/play">Go to the game</Link>
            <button className="btn ghost" onClick={() => { saveSession(null); setExisting(null); }}>Forget this key</button>
          </div>
        </section> : <section className="card">
          <h2>Start with no seed phrase</h2>
          <p>Use Google, Apple, email or a passkey. You approve once, and after that the game signs for you with a key that can only play and can&apos;t move your NEAR.</p>
          {!CONTRACT && <div className="notice">Sign-in needs a deployed contract. See DEPLOY.md, or <Link href="/play">play in practice mode</Link>.</div>}
          <div className="row">
            <button className="btn action" disabled={!CONTRACT} onClick={() => { auth.clearPending(); signIn(); }}>Continue with Google or email</button>
            <Link className="btn ghost" href="/play">Play as a guest</Link>
          </div>
        </section>}
      </div>
    </div>
  );
}
