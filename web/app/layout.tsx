import "@fontsource/bowlby-one/400.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./globals.css";
import type { ReactNode } from "react";
import { serverPublicConfig } from "@/lib/near/config";
export const metadata = { title: "Nearverse", description: "Drive a truck, gather materials and trade with merchants whose prices follow supply." };
// Rendered per request so settings can change without rebuilding the image.
export const dynamic = "force-dynamic";

export default function Root({ children }: { children: ReactNode }) {
  const config = JSON.stringify(serverPublicConfig()).replace(/</g, "\\u003c");
  return <html lang="en"><head><script dangerouslySetInnerHTML={{ __html: `window.__NEARVERSE__=${config}` }} /></head><body>{children}</body></html>;
}
