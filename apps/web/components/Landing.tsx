"use client"
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { KumoMascot, KumoMark, CloudMark, PillButton, Eyebrow, Chip } from "@/components/Kumo"
import {
  Arrow,
  Play,
  Bolt,
  Shield,
  WifiOff,
  Wifi,
  Coin,
  Mic,
  Lock,
  Split,
  List,
  QrCode,
  Face,
  Flame,
  Cloud,
  Key,
  Twitter,
  Github,
  Discord,
} from "@/components/Icons"

export default function Landing() {
  const router = useRouter()
  const openApp = () => router.push("/app")
  const howRef = useRef<HTMLDivElement | null>(null)
  const scrollHow = () => howRef.current && window.scrollTo({ top: howRef.current.offsetTop - 40, behavior: "smooth" })
  return (
    <div className="bg-white">
      <LandingNav onOpenApp={openApp} />
      <Hero onOpenApp={openApp} onHow={scrollHow} />
      <div ref={howRef}>
        <HowItWorks />
      </div>
      <Features />
      <TrustStrip />
      <BottomCTA onOpenApp={openApp} />
      <Footer />
    </div>
  )
}

function LandingNav({ onOpenApp }: { onOpenApp: () => void }) {
  return (
    <header className="sticky top-0 z-40">
      <div className="border-b border-slate-200/70 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <a href="#top" className="flex shrink-0 items-center gap-2.5">
            <KumoMark size={38} />
            <span className="font-display text-[18px] font-extrabold tracking-tight">Kumo</span>
          </a>
          <nav className="hidden items-center gap-7 font-display text-[14.5px] font-semibold text-slate2 md:flex">
            <a href="#features" className="transition-colors hover:text-ink">
              Features
            </a>
            <a href="#how" className="transition-colors hover:text-ink">
              How it works
            </a>
            <a href="#about" className="transition-colors hover:text-ink">
              About
            </a>
          </nav>
          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 font-display text-[12.5px] font-bold text-amber-700 ring-1 ring-amber-200 sm:inline-flex">
              <span className="h-2 w-2 rounded-full bg-amber-400" /> Celo
            </span>
            <PillButton size="sm" onClick={onOpenApp} iconRight={<Arrow size={16} />}>
              Open the app
            </PillButton>
          </div>
        </div>
      </div>
    </header>
  )
}

function Hero({ onOpenApp, onHow }: { onOpenApp: () => void; onHow: () => void }) {
  const [glow, setGlow] = useState({ x: 50, y: 35 })
  const ref = useRef<HTMLElement | null>(null)
  const onMove = (e: React.MouseEvent) => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setGlow({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 })
  }
  return (
    <section ref={ref} onMouseMove={onMove} id="top" className="relative overflow-hidden" style={{ background: "linear-gradient(180deg,#ffffff 0%,#f5f3ff 55%,#ede9fe 100%)" }}>
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-300"
        style={{ background: `radial-gradient(440px circle at ${glow.x}% ${glow.y}%, rgba(127,232,255,0.45), transparent 60%)` }}
      />
      {/* floating decorative puffs */}
      <div className="pointer-events-none absolute -top-6 left-[8%] opacity-60 animate-breathe" style={{ animationDelay: "0.4s" }}>
        <CloudMark size={60} color="#C7B5FF" />
      </div>
      <div className="pointer-events-none absolute right-[10%] top-24 opacity-50 animate-breathe" style={{ animationDelay: "1.1s" }}>
        <CloudMark size={44} color="#B7F1FF" />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="animate-float-up">
          <Chip tone="lilac" className="mb-5" icon={<Bolt size={14} />}>
            Offline-first G$ wallet · No app store
          </Chip>
          <h1 className="font-display text-[clamp(38px,6vw,68px)] font-black leading-[1.02] tracking-[-0.02em] text-ink">
            Pay and claim your UBI —
            <br />
            <span className="relative inline-block">
              <span className="relative z-10">even offline.</span>
              <span className="absolute bottom-1 left-0 right-0 z-0 h-4 -rotate-1 rounded bg-cyan/55" />
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-slate2">
            Speak a G$ payment, sign it on your phone with no signal, and it settles itself when you’re back online.
            <span className="font-bold text-ink"> No gas token, ever.</span>
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <PillButton size="lg" onClick={onOpenApp} iconRight={<Arrow size={18} />}>
              Open the app
            </PillButton>
            <PillButton size="lg" variant="secondary" onClick={onHow} icon={<Play size={14} />}>
              See how it works
            </PillButton>
          </div>
          <div className="mt-7 flex items-center gap-5 font-display text-[13px] font-semibold text-slate2">
            <span className="inline-flex items-center gap-1.5">
              <Shield size={16} className="text-violet2" /> Non-custodial
            </span>
            <span className="inline-flex items-center gap-1.5">
              <WifiOff size={16} className="text-violet2" /> Works offline
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Coin size={16} /> Gasless
            </span>
          </div>
        </div>
        <div className="relative grid place-items-center animate-float-up" style={{ animationDelay: "0.15s" }}>
          <div className="absolute h-64 w-64 rounded-full bg-white/50 blur-2xl" />
          <KumoMascot state="waving" width={300} parens coin />
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    { n: 1, icon: <Mic size={26} />, title: "Say it", body: "“Send 5 to Maria” or “claim my UBI” — by voice or text, in plain language." },
    { n: 2, icon: <Lock size={24} />, title: "Sign offline", body: "Your phone signs the payment locally. The key never leaves the browser." },
    { n: 3, icon: <Wifi size={26} />, title: "Settles itself", body: "On reconnect a relayer submits it for you — gas paid in cUSD, not by you." },
  ]
  return (
    <section id="how" className="bg-cream">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow className="justify-center">How it works</Eyebrow>
          <h2 className="mt-3 font-display text-[clamp(28px,4vw,42px)] font-black tracking-[-0.02em] text-ink">Three steps. No signal required.</h2>
        </div>
        <div className="relative mt-16 grid gap-10 md:grid-cols-3 md:gap-6">
          <div className="absolute left-[16%] right-[16%] top-9 hidden border-t-2 border-dashed border-lilac-soft md:block" />
          {steps.map((s) => (
            <div key={s.n} className="relative px-2 text-center">
              <div className="relative mx-auto grid h-[72px] w-[72px] place-items-center rounded-full bg-white text-violet2 shadow-card ring-1 ring-slate-100">
                {s.icon}
                <span className="absolute -right-1.5 -top-1.5 grid h-7 w-7 place-items-center rounded-full bg-violet2 font-display text-[13px] font-extrabold text-white shadow-violetglow">
                  {s.n}
                </span>
              </div>
              <h3 className="mt-5 font-display text-[20px] font-extrabold text-ink">{s.title}</h3>
              <p className="mx-auto mt-2 max-w-[280px] text-[15px] leading-relaxed text-slate2">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const FEATURES = [
  { icon: <WifiOff size={22} />, title: "Offline payments", body: "Send G$ with no signal; it settles automatically on reconnect.", grad: "from-cyan/40 to-sky/30" },
  { icon: <Mic size={22} />, title: "Voice & text", body: "Natural language becomes a payment or a claim, fully on-device.", grad: "from-lilac/40 to-violet2/15" },
  { icon: <Coin size={22} />, title: "Gasless UBI claim", body: "Claim your daily UBI without ever owning a gas token.", grad: "from-emerald-200/50 to-cyan/25" },
  { icon: <Split size={22} />, title: "Claim-and-Split", body: "“Split 30 between Ama, Kofi and Esi” → one signature pays everyone.", grad: "from-violet2/20 to-lilac/35" },
  { icon: <List size={22} />, title: "Voice multi-action", body: "“Claim my UBI and send 5 to mom” becomes one ordered plan.", grad: "from-sky/40 to-lilac/25" },
  { icon: <QrCode size={22} />, title: "Pay-by-QR & Request", body: "Scan or generate a “pay me X” QR / link — works offline too.", grad: "from-cyan/35 to-violet2/12" },
  { icon: <Face size={22} />, title: "Face verification", body: "Prove you’re a real human in-app — required to claim UBI.", grad: "from-lilac/45 to-cyan/20" },
  { icon: <Flame size={22} />, title: "Claim streak", body: "A daily-claim streak that builds the habit of showing up.", grad: "from-amber-200/50 to-lilac/25" },
  { icon: <Cloud size={22} />, title: "In-browser PWA", body: "No install friction — just “add to home screen” and go.", grad: "from-sky/45 to-cyan/25" },
]

function Features() {
  return (
    <section id="features" className="bg-white">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="max-w-2xl">
          <Eyebrow>Everything in one wallet</Eyebrow>
          <h2 className="mt-3 font-display text-[clamp(28px,4vw,42px)] font-black tracking-[-0.02em] text-ink">Built for real life, low signal and all.</h2>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={i} className={`press group rounded-2xl bg-gradient-to-br p-6 ${f.grad} ring-1 ring-white/60 transition-transform hover:-translate-y-1`}>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/85 text-violet2-deep shadow-sm backdrop-blur">{f.icon}</div>
              <h3 className="mt-4 font-display text-[18px] font-extrabold text-ink">{f.title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink/65">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TrustStrip() {
  return (
    <section id="about" className="border-y border-slate-200/70 bg-cream">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-10 text-center sm:px-8">
        <span className="inline-flex items-center gap-2 font-display text-[15px] font-bold text-ink">
          <span className="h-2 w-2 rounded-full bg-amber-400" /> Runs on Celo
        </span>
        <span className="hidden h-1 w-1 rounded-full bg-hair sm:block" />
        <span className="inline-flex items-center gap-2 font-display text-[15px] font-bold text-ink">
          <Shield size={18} className="text-violet2" /> Non-custodial
        </span>
        <span className="hidden h-1 w-1 rounded-full bg-hair sm:block" />
        <span className="inline-flex items-center gap-2 font-display text-[15px] font-bold text-ink">
          <Key size={18} className="text-violet2" /> Your key stays on your device
        </span>
      </div>
    </section>
  )
}

function BottomCTA({ onOpenApp }: { onOpenApp: () => void }) {
  return (
    <section className="bg-white px-5 py-20 sm:px-8">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[28px] px-8 py-14 text-white shadow-cardlg sm:px-14" style={{ background: "linear-gradient(120deg,#6d28d9 0%,#7c5cff 55%,#8b5cf6 100%)" }}>
        <div className="absolute -right-6 -top-6 opacity-30">
          <CloudMark size={120} color="#C7B5FF" />
        </div>
        <div className="relative grid items-center gap-8 sm:grid-cols-[1fr_auto]">
          <div>
            <h2 className="font-display text-[clamp(26px,4vw,40px)] font-black leading-tight tracking-[-0.02em]">
              Built to keep paying
              <br />
              even when the signal dies.
            </h2>
            <p className="mt-3 max-w-md text-[16px] text-white/80">Generate a wallet in your browser and send your first G$ in under a minute.</p>
            <PillButton size="lg" onClick={onOpenApp} className="mt-7 !bg-cyan !text-ink" iconRight={<Arrow size={18} />}>
              Open the app
            </PillButton>
          </div>
          <div className="hidden sm:block">
            <KumoMascot state="waving" width={190} coin float />
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  const cols = [
    { h: "Product", items: ["Offline payments", "Voice & text", "Gasless UBI", "Claim-and-Split", "Pay-by-QR"] },
    { h: "Resources", items: ["How it works", "About GoodDollar", "Celo network", "Help center", "Status"] },
    { h: "Legal", items: ["Non-custodial terms", "Privacy", "Security", "Open source"] },
  ]
  return (
    <footer className="bg-ink text-white/70">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <KumoMark size={38} />
            <span className="font-display text-[18px] font-extrabold text-white">Kumo</span>
          </div>
          <p className="mt-4 max-w-[240px] text-[15px] text-white/55">Pay when the signal disappears.</p>
          <div className="mt-5 flex items-center gap-3 text-white/60">
            <a href="#" aria-label="Twitter" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20">
              <Twitter size={18} />
            </a>
            <a href="#" aria-label="GitHub" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20">
              <Github size={18} />
            </a>
            <a href="#" aria-label="Discord" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20">
              <Discord size={18} />
            </a>
          </div>
        </div>
        {cols.map((c) => (
          <div key={c.h}>
            <div className="eyebrow text-white/40">{c.h}</div>
            <ul className="mt-4 space-y-2.5 text-[14.5px]">
              {c.items.map((it) => (
                <li key={it}>
                  <a href="#" className="transition-colors hover:text-white">
                    {it}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-[13px] text-white/45 sm:px-8">
          <span>© 2026 Kumo · A community project on Celo.</span>
          <span className="inline-flex items-center gap-1.5">
            Made for low-connectivity places <Cloud size={15} />
          </span>
        </div>
      </div>
    </footer>
  )
}
