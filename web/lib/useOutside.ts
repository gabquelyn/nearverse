"use client";
import { useEffect, useRef } from "react";

// Driving controls and the buttons that open things never count as an outside tap.
const NEVER = ".touch, .hudbar";

/** Calls onClose when a press lands outside everything matched by `inside`. */
export function useOutside(active: boolean, inside: string, onClose: () => void) {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    if (!active) return;
    const press = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (!el?.closest || el.closest(`${inside}, ${NEVER}`)) return;
      latest.current();
    };
    window.addEventListener("pointerdown", press, true);
    return () => window.removeEventListener("pointerdown", press, true);
  }, [active, inside]);
}
