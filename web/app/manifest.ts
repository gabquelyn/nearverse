import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Nearverse", short_name: "Nearverse", start_url: "/play", display: "fullscreen", orientation: "landscape", background_color: "#0e2229", theme_color: "#0e2229" };
}
