"use client";
// On a phone, help panels fold into a small tip button so they don't cover the road. A dot shows when the tip has changed since you last read it.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isTouch } from "@/lib/landscape";

export function useTouch() {
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(isTouch()), []);
  return touch;
}

/** Wraps a help panel. On a phone it starts folded; elsewhere it shows as normal. */
export function Fold({ label, text, className, testId, children }: { label: string; text: string; className: string; testId?: string; children: (fold: () => void) => ReactNode }) {
  const touch = useTouch();
  const [open, setOpen] = useState(false);
  const read = useRef(""), fresh = text !== read.current;
  const fold = () => { read.current = text; setOpen(false); };
  if (!touch) return <div className={className} data-testid={testId}>{children(() => {})}</div>;
  if (!open) {
    return (
      <button className={`${className} folded`} data-testid={testId} aria-expanded={false} aria-label={`${label}${fresh ? ", new" : ""}`} onClick={() => { read.current = text; setOpen(true); }}>
        <span aria-hidden="true">?</span>{label}{fresh && <i className="newdot" aria-hidden="true" />}
      </button>
    );
  }
  return (
    <div className={`${className} unfolded`} data-testid={testId}>
      {children(fold)}
      <button className="foldbtn" aria-label={`Hide ${label.toLowerCase()}`} aria-expanded={true} onClick={fold}>×</button>
    </div>
  );
}
