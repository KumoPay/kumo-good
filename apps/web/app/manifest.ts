import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kumo — offline G$ wallet",
    short_name: "Kumo",
    description: "Speak a G$ payment offline; it settles itself when you reconnect.",
    start_url: "/app",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAFCFF",
    theme_color: "#FAFCFF",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  }
}
