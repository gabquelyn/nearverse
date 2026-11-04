"use client";
// Guests own a plain key, so they can see it. A signed-in wallet has no key to reveal, so it adds a new recovery key instead.
import { useState } from "react";
import { useGame } from "@/lib/state/game";
import { useOutside } from "@/lib/useOutside";

export function Secret({ label, value }: { label: string; value: string }) {
  const say = useGame((s) => s.say);
  return (
    <div className="secret"><small>{label}</small><code>{value}</code>
      <button className="btn small ghost" onClick={() => navigator.clipboard?.writeText(value).then(() => say("Copied."), () => say("Copy it by hand.", true))}>Copy</button></div>
  );
}

export function WalletExport() {
  const session = useGame((s) => s.session), say = useGame((s) => s.say);
  const [open, setOpen] = useState(false), [shown, setShown] = useState(false), [busy, setBusy] = useState(false);
  useOutside(open, ".exportbox", () => { setOpen(false); setShown(false); });
  if (!session) return null;
  if (!open) return <button className="btn ghost" onClick={() => setOpen(true)}>Export wallet</button>;
  const close = () => { setOpen(false); setShown(false); };
  return (
    <div className="exportbox">
      <h3>Export wallet</h3>
      {session.kind === "google" ? <>
        <p>This creates a new seed phrase in your browser and adds it to your wallet as a full-access key, after we confirm it&apos;s you. Anyone who has the phrase controls this wallet.</p>
        <a className="btn action" href="/signin?google=export">Create seed phrase</a>
      </> : session.kind === "guest" ? <>
        <p>This shows the private key for your guest wallet. Guest wallets have a private key but no seed phrase. Anyone who has this key controls the wallet.</p>
        {shown ? <Secret label="Private key" value={session.secretKey} /> : <button className="btn action" onClick={() => setShown(true)}>Show private key</button>}
      </> : <>
        <p>Your sign-in wallet has no single private key or seed phrase, because a network of signers holds it. This creates a new seed phrase and adds it to your wallet as a full-access key, after one approval.</p>
        <p>Anyone who has the phrase controls this wallet. It stays valid until you remove the key from the wallet.</p>
        <button className="btn action" disabled={busy} onClick={async () => { setBusy(true); try { const auth = await import("@/lib/near/login"); await auth.requestExportKey(session.accountId); } catch (e) { say(String((e as Error).message ?? e), true); setBusy(false); } }}>{busy ? "Working" : "Create seed phrase"}</button>
      </>}
      <button className="btn ghost" onClick={close}>Close</button>
    </div>
  );
}
