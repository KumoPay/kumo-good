import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B0E14",
        surface: "#141A24",
        "surface-2": "#1C2533",
        line: "#28333F",
        gold: "#FFC24B", // G$
        "gold-deep": "#E8A52E",
        teal: "#34D8C4",
        text: "#EAF0F7",
        muted: "#8995A6",
        danger: "#FF6B6B",
        ok: "#46D38A",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: { xl2: "1.25rem" },
      boxShadow: {
        card: "0 8px 30px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(255,194,75,0.25), 0 10px 40px -12px rgba(255,194,75,0.35)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        pulseRing: { "0%": { boxShadow: "0 0 0 0 rgba(52,216,196,0.45)" }, "100%": { boxShadow: "0 0 0 16px rgba(52,216,196,0)" } },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
        "pulse-ring": "pulseRing 1.4s ease-out infinite",
      },
    },
  },
  plugins: [],
}
export default config
