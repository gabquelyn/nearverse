"use client";
// Sign in with Google, pick a username, get a wallet and a game key. Also the one approval for buying credits or exporting.
import { generateKey, generateSeedPhrase, parseSeedPhrase } from "near-kit";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loadSession, saveSession } from "@/lib/near/client";
import { emailOn, emailStep, googleAction, googleButtonOn, showGoogleButton } from "@/lib/near/google";
import { StepRail, type RailStep } from "./StepRail";
import { Secret } from "./WalletExport";

type Stage = "signin" | "username" | "account" | "key" | "done";
const ORDER: Stage[] = ["signin", "username", "account", "key"];
const LABEL: Record<string, string> = { signin: "Sign in", username: "Choose a username", account: "Create your wallet", key: "Add the game key" };

export function GoogleSignIn({ action, near }: { action: "start" | "credits" | "export"; near: number }) {
  const router = useRouter();
  const button = useRef<HTMLDivElement>(null), token = useRef("");
  const [stage, setStage] = useState<Stage>("signin"), [failed, setFailed] = useState<string | null>(null), [username, setUsername] = useState(""), [parent, setParent] = useState(""), [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(""), [code, setCode] = useState(""), [challenge, setChallenge] = useState("");
  const [seed, setSeed] = useState<{ phrase: string; secret: string; id: string } | null>(null);

  async function start(fields: { accountId?: string; username?: string }) {
    setBusy(true); setFailed(null); setStage("account");
    try {
      const key = generateKey(); // stays in this browser; the server only sees its public half
      setStage("key");
      const { accountId } = await googleAction<{ accountId: string }>({ credential: token.current, action: "start", sessionPub: key.publicKey.toString(), ...fields });
      saveSession({ accountId, secretKey: key.secretKey, kind: "google" });
      setStage("done");
      router.push("/play");
    } catch (e) { setFailed(String((e as Error).message)); setStage(fields.username ? "username" : "signin"); } finally { setBusy(false); }
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault(); setBusy(true); setFailed(null);
    try { setChallenge((await emailStep<{ challenge: string }>({ action: "send", email })).challenge); } catch (err) { setFailed(String((err as Error).message)); } finally { setBusy(false); }
  }
  async function checkCode(e: FormEvent) {
    e.preventDefault(); setBusy(true); setFailed(null);
    try { const { credential } = await emailStep<{ credential: string }>({ action: "verify", email, code, challenge }); await signedIn(credential); } catch (err) { setFailed(String((err as Error).message)); setBusy(false); }
  }

  async function signedIn(credential: string) {
    token.current = credential; setFailed(null); setBusy(true);
    try {
      const accountId = loadSession()?.accountId;
      if (action === "credits") { await googleAction({ credential, action, accountId, near }); router.push("/profile"); return; }
      if (action === "export") {
        const phrase = generateSeedPhrase(), key = parseSeedPhrase(phrase);
        await googleAction({ credential, action, accountId, exportPub: key.publicKey.toString() });
        setSeed({ phrase, secret: key.secretKey, id: accountId ?? "" }); return;
      }
      const found = await googleAction<{ accountId: string | null; parent: string }>({ credential, action: "lookup" });
      setParent(found.parent);
      if (found.accountId) await start({ accountId: found.accountId }); else setStage("username");
    } catch (e) { setFailed(String((e as Error).message)); } finally { setBusy(false); }
  }

  const callback = useRef(signedIn); callback.current = signedIn;
  useEffect(() => { if (button.current && googleButtonOn()) showGoogleButton(button.current, (c) => callback.current(c)).catch((e) => setFailed(String(e.message))); }, [stage === "signin"]); // eslint-disable-line react-hooks/exhaustive-deps

  const choices = (
    <div className="signchoices">
      {googleButtonOn() && <div className="googlebtn">
        <span className="btn action" aria-hidden><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4ZM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22ZM6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6ZM12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6Z" /></svg>Continue with Google</span>
        <div className="googlehit" ref={button} data-testid="google-button" />
      </div>}
      {googleButtonOn() && emailOn() && <div className="signor"><span>or</span></div>}
      {emailOn() && (!challenge ? <form className="emailform" onSubmit={sendCode}>
        <label htmlFor="signin-email">Email address</label>
        <div className="row"><input id="signin-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /><button className="btn" disabled={busy}>{busy ? "Sending" : "Continue with email"}</button></div>
      </form> : <form className="emailform" onSubmit={checkCode}>
        <label htmlFor="signin-code">Enter the 8-digit code we sent to {email}</label>
        <div className="row"><input id="signin-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /><button className="btn action" disabled={busy || code.length !== 8}>{busy ? "Checking" : "Verify"}</button></div>
        <button type="button" className="linkish" onClick={() => { setChallenge(""); setCode(""); setFailed(null); }}>Use a different email</button>
      </form>)}
    </div>
  );

  if (seed) return (
    <section className="card">
      <h2>Save your seed phrase</h2>
      <p>This shows once. Write it down and keep it private, because anyone who has it controls this wallet.</p>
      <Secret label="Seed phrase" value={seed.phrase} /><Secret label="Private key" value={seed.secret} /><Secret label="Account" value={seed.id} />
      <button className="btn action" onClick={() => router.push("/profile")}>I saved it</button>
    </section>
  );
  if (action !== "start") return (
    <section className="card">
      <h2>{action === "credits" ? `Confirm buying credits with ${near} NEAR` : "Confirm exporting your wallet"}</h2>
      <p>{action === "credits" ? "This spends NEAR from your wallet, so we confirm it's you first." : "This adds a new full-access key to your wallet, so we confirm it's you first."}</p>
      {choices}
      {busy && <p className="muted">Working on it.</p>}
      {failed && <div className="notice" role="alert">{failed}</div>}
    </section>
  );
  const at = ORDER.indexOf(stage === "done" ? "key" : stage);
  const steps: RailStep[] = ORDER.map((id, i) => ({ id, label: LABEL[id], detail: i === at && failed ? failed : undefined, state: stage === "done" || i < at ? "done" : i === at ? (failed ? "failed" : stage === "signin" || stage === "username" ? "active" : "active") : "todo" }));
  return (
    <section className="card">
      <h2>Start with no seed phrase</h2>
      <p>Sign in with Google or your email. You get a wallet, and every move after that signs in the background with a key that can only play and can&apos;t move your NEAR.</p>
      <StepRail steps={steps} />
      {stage === "signin" && choices}
      {stage === "username" && <form className="row" onSubmit={(e) => { e.preventDefault(); start({ username }); }}>
        <label className="field">Username <input value={username} autoFocus maxLength={20} onChange={(e) => setUsername(e.target.value.toLowerCase())} /></label>
        <button className="btn action" disabled={busy || username.length < 3}>Create my wallet</button>
        <p className="muted" style={{ flexBasis: "100%", margin: 0 }}>Your wallet will be <code>{username || "username"}.{parent}</code>. Names are public and permanent, so don&apos;t use anything private. If you&apos;ve played before on another device, enter the same username.</p>
      </form>}
    </section>
  );
}
