import type { Config } from "tailwindcss"

// Kumo light "cloud" design language — palette, type and motion ported from the
// Claude-design handoff bundle (kumogood/project/KumoGood.html).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: {
        xs: "375px",
      },
      colors: {
        ink: "#0B1020",
        slate2: "#64748b",
        muted: "#94a3b8",
        cream: "#FAFCFF",
        cyan: { DEFAULT: "#7FE8FF", soft: "#B7F1FF" },
        sky: "#B7F1FF",
        violet2: { DEFAULT: "#7c5cff", deep: "#6d28d9", soft: "#8b5cf6" },
        lilac: { DEFAULT: "#C7B5FF", soft: "#c4b5fd" },
        hair: "#C4CCD8",
        gpos: "#16a34a", // G$ amount green
        // semantic aliases kept so existing utility names keep working
        text: "#0B1020",
        ok: "#16a34a",
        danger: "#dc2626",
      },
      fontFamily: {
        display: ["var(--font-display)", "Inter", "system-ui", "sans-serif"],
        body: ["var(--font-body)", '"Nunito Sans"', "system-ui", "sans-serif"],
        sans: ["var(--font-body)", '"Nunito Sans"', "system-ui", "sans-serif"],
      },
      borderRadius: { card: "18px", xl2: "20px" },
      boxShadow: {
        card: "0 8px 20px rgba(11,16,32,0.05)",
        cardlg: "0 14px 40px rgba(11,16,32,0.08)",
        glow: "0 6px 18px rgba(127,232,255,0.45)",
        glowlg: "0 10px 30px rgba(127,232,255,0.55)",
        violetglow: "0 10px 30px rgba(124,92,255,0.35)",
        phone: "0 40px 90px -20px rgba(11,16,32,0.45)",
      },
      keyframes: {
        breathe: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-9px)" } },
        wave: { "0%,100%": { transform: "rotate(0deg)" }, "25%": { transform: "rotate(16deg)" }, "75%": { transform: "rotate(-6deg)" } },
        driftZ: { "0%": { transform: "translateY(0) scale(0.8)", opacity: "0" }, "20%": { opacity: "1" }, "100%": { transform: "translateY(-34px) scale(1.1)", opacity: "0" } },
        ring: { "0%": { transform: "scale(0.4)", opacity: "0.9" }, "100%": { transform: "scale(1.6)", opacity: "0" } },
        sparkle: { "0%,100%": { transform: "scale(0.6) rotate(0deg)", opacity: "0.2" }, "50%": { transform: "scale(1.15) rotate(20deg)", opacity: "1" } },
        halo: { "0%": { transform: "scale(0.85)", opacity: "0.65" }, "100%": { transform: "scale(1.5)", opacity: "0" } },
        floatUp: { from: { opacity: "0", transform: "translateY(18px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        popIn: { "0%": { transform: "scale(0.92)", opacity: "0" }, "100%": { transform: "scale(1)", opacity: "1" } },
        scanline: { "0%,100%": { top: "18%" }, "50%": { top: "80%" } },
        qrPulse: { "0%,100%": { opacity: "0.18" }, "50%": { opacity: "0.95" } },
        qrBar: { "0%": { transform: "translateX(-120%)" }, "100%": { transform: "translateX(420%)" } },
        qrGlow: { "0%,100%": { opacity: "0.4" }, "50%": { opacity: "1" } },
        floatSlow: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-16px)" } },
        blobDrift: { "0%,100%": { transform: "translate(0,0) scale(1)" }, "33%": { transform: "translate(12px,-18px) scale(1.04)" }, "66%": { transform: "translate(-8px,10px) scale(0.98)" } },
        revealUp: { from: { opacity: "0", transform: "translateY(28px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        pulseGlow: { "0%,100%": { boxShadow: "0 0 20px rgba(127,232,255,0.25)" }, "50%": { boxShadow: "0 0 36px rgba(127,232,255,0.45)" } },
        signalWave: { "0%": { transform: "scale(0.85)", opacity: "0.55" }, "100%": { transform: "scale(1.35)", opacity: "0" } },
      },
      animation: {
        breathe: "breathe 3s ease-in-out infinite",
        wave: "wave 1.8s ease-in-out infinite",
        "drift-z": "driftZ 2.6s ease-in-out infinite",
        ring: "ring 2s ease-out infinite",
        sparkle: "sparkle 1.6s ease-in-out infinite",
        halo: "halo 1.6s ease-out infinite",
        "float-up": "floatUp 0.6s cubic-bezier(.2,.7,.2,1) both",
        "fade-up": "floatUp 0.34s cubic-bezier(.2,.7,.2,1) both",
        pop: "popIn 0.42s cubic-bezier(.2,.8,.2,1) both",
        scanline: "scanline 2.4s ease-in-out infinite",
        "qr-pulse": "qrPulse 1.4s ease-in-out infinite",
        "qr-bar": "qrBar 1.6s ease-in-out infinite",
        "qr-glow": "qrGlow 2s ease-in-out infinite",
        "float-slow": "floatSlow 4.5s ease-in-out infinite",
        "blob-drift": "blobDrift 14s ease-in-out infinite",
        reveal: "revealUp 0.7s cubic-bezier(.2,.7,.2,1) both",
        "pulse-glow": "pulseGlow 3s ease-in-out infinite",
        "signal-wave": "signalWave 2.4s ease-out infinite",
      },
    },
  },
  plugins: [],
}
export default config
