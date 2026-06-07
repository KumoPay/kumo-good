import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "kumo-good — offline G$ wallet",
    short_name: "kumo-good",
    description: "Speak a G$ payment offline; it settles itself when you reconnect.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0E14",
    theme_color: "#0B0E14",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  }
}
