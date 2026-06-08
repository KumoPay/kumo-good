"use client"
import { useRef } from "react"
import { useRouter } from "next/navigation"
import { CloudMark } from "@/components/Kumo"
import {
  Arrow,
  Mic,
  WifiOff,
  Wifi,
  QrCode,
  Coin,
  Gift,
  Shield,
  Lock,
  Sparkle,
} from "@/components/Icons"

const LOGO = "/kumo-states/logo-superior.png"
const MASCOT_SIGNAL = "/kumo-states/state-00-signal-transparent.png"
const NAV_KUMO = "/kumo-states/nav-kumo.png"
const FLAME = "/kumo-states/streak-flame.png"

const ASSETS = { LOGO, MASCOT_SIGNAL, NAV_KUMO, FLAME }

export default function Landing() {
  const router = useRouter()
  const howRef = useRef<HTMLElement>(null)
  const launch = () => router.push("/app")
  const scrollHow = () => howRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })

  return (
    <div className="landing-root overflow-x-clip bg-[#FAFCFF] text-ink">
      <LandingNav onLaunch={launch} />
      <Hero onLaunch={launch} onHow={scrollHow} />
      <FeatureStrip />
      <section ref={howRef}>
        <HowItWorks />
      </section>
      <OfflineSection />
      <UbiSection />
      <AppPreview />
      <FinalCTA onLaunch={launch} />
      <LandingFooter />
    </div>
  )
}

/* ─── shared primitives ─── */

function Particles() {
  const dots = [
    { top: "12%", left: "8%", size: 6, delay: "0s" },
    { top: "22%", right: "14%", size: 5, delay: "1.2s" },
    { top: "55%", left: "18%", size: 4, delay: "0.6s" },
    { top: "70%", right: "22%", size: 5, delay: "2s" },
    { top: "38%", right: "8%", size: 4, delay: "1.8s" },
  ]
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {dots.map((d, i) => (
        <Sparkle
          key={i}
          size={d.size}
          className="absolute animate-sparkle text-lilac/60"
          style={{ top: d.top, left: d.left, right: d.right, animationDelay: d.delay }}
        />
      ))}
    </div>
  )
}

function SignalWaves({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 grid place-items-center ${className}`} aria-hidden>
      {[0, 0.9, 1.8].map((delay) => (
        <span
          key={delay}
          className="absolute h-[72%] w-[72%] rounded-full border-2 border-cyan/40 animate-signal-wave"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </div>
  )
}

function BtnPrimary({ children, onClick, className = "" }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press animate-pulse-glow inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-cyan px-7 font-display text-[16px] font-extrabold text-ink shadow-glow transition-transform hover:shadow-glowlg ${className}`}
    >
      {children}
    </button>
  )
}

function BtnSecondary({ children, onClick, className = "" }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border-2 border-ink/10 bg-white/80 px-7 font-display text-[15px] font-bold text-ink shadow-card backdrop-blur-sm transition-all hover:border-violet2/30 hover:shadow-cardlg ${className}`}
    >
      {children}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-violet2-deep/70">{children}</p>
}

function GlassCard({ children, className = "", hover = true }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div
      className={`rounded-[26px] border border-white/60 bg-white/75 p-6 shadow-card backdrop-blur-md ${hover ? "transition-all duration-300 hover:-translate-y-1 hover:shadow-cardlg" : ""} ${className}`}
    >
      {children}
    </div>
  )
}

/* ─── 0. Nav ─── */

function LandingNav({ onLaunch }: { onLaunch: () => void }) {
  return (
    <header className="safe-top sticky top-0 z-50 border-b border-white/50 bg-[#FAFCFF]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[60px] max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ASSETS.LOGO} alt="kumo good" className="h-10 w-auto sm:h-11" draggable={false} />
        </a>
        <nav className="hidden items-center gap-8 font-display text-[14px] font-semibold text-slate2 md:flex">
          <a href="#features" className="transition-colors hover:text-ink">Features</a>
          <a href="#how" className="transition-colors hover:text-ink">How it works</a>
          <a href="#preview" className="transition-colors hover:text-ink">Preview</a>
        </nav>
        <button
          type="button"
          onClick={onLaunch}
          className="press rounded-full bg-violet2 px-5 py-2.5 font-display text-[14px] font-bold text-white shadow-violetglow transition-transform hover:bg-violet2-deep"
        >
          Launch app
        </button>
      </div>
    </header>
  )
}

/* ─── 1. Hero ─── */

function Hero({ onLaunch, onHow }: { onLaunch: () => void; onHow: () => void }) {
  return (
    <section id="top" className="relative min-h-[min(92svh,880px)] overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 90% 70% at 15% 10%, rgba(199,181,255,0.4), transparent 55%),
            radial-gradient(ellipse 70% 60% at 85% 20%, rgba(127,232,255,0.35), transparent 50%),
            radial-gradient(ellipse 80% 50% at 50% 100%, rgba(237,233,254,0.5), transparent 60%),
            linear-gradient(180deg, #FAFCFF 0%, #F5F0FF 50%, #EDE9FE 100%)
          `,
        }}
      />
      <div className="pointer-events-none absolute -left-16 top-24 animate-blob-drift opacity-50">
        <CloudMark size={100} color="#E8DEFF" />
      </div>
      <div className="pointer-events-none absolute -right-10 top-40 animate-blob-drift opacity-40" style={{ animationDelay: "4s" }}>
        <CloudMark size={72} color="#B7F1FF" />
      </div>
      <Particles />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:min-h-[min(88svh,840px)] lg:grid-cols-2 lg:gap-8 lg:pb-20 lg:pt-16">
        <div className="animate-reveal">
          <SectionLabel>kumo good, GoodDollar wallet</SectionLabel>
          <h1 className="mt-4 font-display text-[clamp(2.25rem,6.5vw,3.75rem)] font-black leading-[1.02] tracking-[-0.03em] text-ink">
            Pay, claim and build good,{" "}
            <span className="bg-gradient-to-r from-violet2 to-[#4A90E2] bg-clip-text text-transparent">even offline.</span>
          </h1>
          <p className="mt-5 max-w-lg font-body text-[17px] leading-[1.65] text-slate2">
            Voice, QR, daily UBI and offline signing in one browser wallet. Your keys stay on your device.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <BtnPrimary onClick={onLaunch}>
              Launch app <Arrow size={18} />
            </BtnPrimary>
            <BtnSecondary onClick={onHow}>See how it works</BtnSecondary>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {["Non-custodial", "Gasless UBI", "PWA"].map((t) => (
              <span key={t} className="rounded-full bg-white/70 px-3.5 py-1.5 font-display text-[12px] font-bold text-slate2 ring-1 ring-white shadow-sm">
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="relative flex justify-center lg:justify-end">
          <div className="relative w-[min(100%,340px)]">
            <div
              className="pointer-events-none absolute bottom-[2%] left-1/2 h-16 w-[80%] -translate-x-1/2 rounded-full blur-2xl"
              style={{ background: "radial-gradient(ellipse at center, rgba(183,241,255,0.85) 0%, rgba(199,181,255,0) 70%)" }}
              aria-hidden="true"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ASSETS.MASCOT_SIGNAL}
              alt="Kumo mascot"
              width={340}
              height={320}
              className="relative z-10 mx-auto w-full max-w-[300px] animate-float-slow object-contain drop-shadow-[0_20px_50px_rgba(124,92,255,0.18)] sm:max-w-[340px]"
              draggable={false}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── 2. Feature strip ─── */

const FEATURES = [
  { icon: <Gift size={24} />, title: "Claim UBI daily", body: "Your GoodDollar entitlement, gasless via relayer.", tint: "from-lilac/30 to-violet2/10" },
  { icon: <Mic size={24} />, title: "Pay by voice or text", body: "Say what you want. Kumo turns it into a payment.", tint: "from-cyan/35 to-sky/25" },
  { icon: <WifiOff size={24} />, title: "Sign offline", body: "Queue payments with no bars. Settles on reconnect.", tint: "from-violet2/15 to-lilac/30" },
  { icon: <QrCode size={24} />, title: "Request with QR", body: "Create a pay-me link or QR in seconds.", tint: "from-sky/35 to-cyan/20" },
]

function FeatureStrip() {
  return (
    <section id="features" className="relative px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <SectionLabel>Why kumo good</SectionLabel>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.5rem)] font-black tracking-tight">Everything you need in one wallet.</h2>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={`group animate-reveal rounded-[26px] bg-gradient-to-br p-6 ring-1 ring-white/70 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-cardlg ${f.tint}`}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/90 text-violet2-deep shadow-sm transition-transform group-hover:scale-105">
                {f.icon}
              </span>
              <h3 className="mt-4 font-display text-[17px] font-extrabold">{f.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-slate2">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── 3. How it works ─── */

function HowItWorks() {
  const steps = [
    { n: "1", icon: <Mic size={26} />, title: "Say what you want", body: 'Voice or text like "send 5 to Maria" or "claim my UBI".', mock: <MockPayBubble /> },
    { n: "2", icon: <Lock size={24} />, title: "Sign safely", body: "Signed locally. Your key never leaves the browser.", mock: <MockSigned /> },
    { n: "3", icon: <Wifi size={26} />, title: "Settle when online", body: "Relayer submits for you. Gas paid in cUSD.", mock: <MockSettled /> },
  ]
  return (
    <section id="how" className="bg-white px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionLabel>How it works</SectionLabel>
        <h2 className="mt-3 max-w-md font-display text-[clamp(1.75rem,4vw,2.5rem)] font-black tracking-tight">Three steps. Zero panic.</h2>

        <div className="relative mt-14 grid gap-8 lg:grid-cols-3 lg:gap-6">
          <div className="pointer-events-none absolute left-[16%] right-[16%] top-[120px] hidden h-0.5 bg-gradient-to-r from-transparent via-lilac to-transparent lg:block" />
          {steps.map((s, i) => (
            <div key={s.n} className="animate-reveal text-center" style={{ animationDelay: `${i * 0.15}s` }}>
              <div className="relative mx-auto mb-6 max-w-[220px]">{s.mock}</div>
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-violet2 font-display text-[15px] font-extrabold text-white shadow-violetglow">
                {s.n}
              </span>
              <span className="mx-auto mt-4 grid h-11 w-11 place-items-center rounded-2xl bg-lilac/25 text-violet2-deep">{s.icon}</span>
              <h3 className="mt-4 font-display text-[18px] font-extrabold">{s.title}</h3>
              <p className="mx-auto mt-2 max-w-[240px] text-[14px] leading-relaxed text-slate2">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function MockPayBubble() {
  return (
    <div className="rounded-[20px] bg-[#F5F2FF] p-4 ring-1 ring-lilac/30">
      <div className="ml-auto max-w-[90%] rounded-2xl rounded-tr-md bg-violet2 px-3.5 py-2.5 font-display text-[13px] font-semibold text-white">
        send 5 to Maria
      </div>
      <div className="mt-2 grid h-10 w-10 place-items-center rounded-full bg-cyan/40">
        <Mic size={18} className="text-violet2-deep" />
      </div>
    </div>
  )
}

function MockSigned() {
  return (
    <div className="rounded-[20px] bg-[#F5F2FF] p-4 ring-1 ring-lilac/30">
      <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm">
        <Lock size={16} className="text-violet2" />
        <span className="font-display text-[13px] font-bold text-ink">Signed offline</span>
      </div>
      <p className="mt-2 text-[11px] font-semibold text-muted">Queued, 0 bars</p>
    </div>
  )
}

function MockSettled() {
  return (
    <div className="rounded-[20px] bg-[#E8F4FF] p-4 ring-1 ring-cyan/40">
      <div className="flex items-center justify-between">
        <span className="font-display text-[20px] font-black">5 <span className="text-gpos">G$</span></span>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-display text-[10px] font-bold text-emerald-700">settled</span>
      </div>
      <p className="mt-1 text-[11px] text-slate2">to Maria, lunch</p>
    </div>
  )
}

/* ─── 4. Offline section ─── */

function OfflineSection() {
  return (
    <section className="relative overflow-hidden px-4 py-20 sm:px-6 sm:py-28">
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(145deg, #0B1020 0%, #151B33 40%, #1a1040 100%)",
        }}
      />
      <div className="pointer-events-none absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-cyan/15 blur-[80px]" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-violet2/20 blur-[90px]" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <div className="animate-reveal">
          <p className="font-display text-[12px] font-bold uppercase tracking-[0.18em] text-cyan">Offline-first</p>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.75rem)] font-black leading-tight text-white">
            Signal disappears.
            <br />
            <span className="text-lilac">Kumo keeps going.</span>
          </h2>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-white/60">
            Prepare payments with one bar or none. They wait patiently in your queue and settle the moment you reconnect.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-cyan backdrop-blur-sm">
              <WifiOff size={28} />
            </div>
            <div>
              <p className="font-display text-[15px] font-bold text-white">Queue &amp; forget</p>
              <p className="text-[13px] text-white/50">Relayer handles the rest</p>
            </div>
          </div>
        </div>

        <div className="relative flex justify-center">
          <SignalWaves />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ASSETS.MASCOT_SIGNAL} alt="" className="relative z-10 h-56 w-56 animate-float-slow object-contain sm:h-64 sm:w-64" draggable={false} />
          <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/10 px-4 py-2 font-display text-[13px] font-bold text-cyan backdrop-blur-md">
            ✓ 2 payments queued
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── 5. UBI section ─── */

function UbiSection() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionLabel>GoodDollar UBI</SectionLabel>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.5rem)] font-black tracking-tight">Claim daily. Build your streak.</h2>
          <p className="mt-4 max-w-md text-[16px] leading-relaxed text-slate2">
            Verify once as a real human, then claim your daily G$ entitlement. Gasless, with a streak that keeps you coming back.
          </p>
        </div>

        <GlassCard className="!p-0 overflow-hidden" hover={false}>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-[#D1FAE5] px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wide text-emerald-700">Verified</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#EDE9FE] px-2.5 py-1 font-display text-[11px] font-bold text-violet2-deep">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ASSETS.FLAME} alt="" className="h-4 w-4 object-contain" draggable={false} />
                3-day streak
              </span>
            </div>
            <p className="mt-5 font-display text-[11px] font-bold uppercase tracking-wider text-[#8E84AD]">Daily UBI entitlement</p>
            <p className="mt-1 font-display text-[40px] font-black tracking-tight">
              12.50 <span className="text-gpos">G$</span>
            </p>
            <button type="button" className="press mt-5 flex h-[48px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan to-sky font-display text-[15px] font-bold text-ink shadow-glow">
              <Coin size={18} />
              Claim today&apos;s UBI
            </button>
          </div>
          <div className="flex items-center gap-2 border-t border-lilac/20 bg-[#FFF6EE] px-6 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ASSETS.FLAME} alt="" className="h-5 w-5 object-contain" draggable={false} />
            <span className="font-display text-[13px] font-semibold text-slate2">Keep your streak going!</span>
          </div>
        </GlassCard>
      </div>
    </section>
  )
}

/* ─── 6. App preview ─── */

function AppPreview() {
  return (
    <section id="preview" className="bg-gradient-to-b from-[#F5F0FF] to-[#FAFCFF] px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <SectionLabel>Inside the app</SectionLabel>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.5rem)] font-black tracking-tight">Familiar screens. Delightful details.</h2>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <PreviewHome />
          <PreviewPay />
          <PreviewClaim />
          <PreviewRequest />
        </div>
      </div>
    </section>
  )
}

function PreviewFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="group animate-reveal rounded-[28px] bg-white p-3 shadow-card ring-1 ring-lilac/20 transition-all duration-300 hover:-translate-y-2 hover:shadow-cardlg">
      <div className="overflow-hidden rounded-[20px] bg-[#FAFCFF] p-4">{children}</div>
      <p className="mt-3 text-center font-display text-[12px] font-bold uppercase tracking-wider text-muted">{label}</p>
    </div>
  )
}

function PreviewHome() {
  return (
    <PreviewFrame label="Home">
      <div className="rounded-[16px] px-3 py-4" style={{ background: "linear-gradient(120deg,#EDE9FE,#D6EAFE)" }}>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate2">Balance</p>
        <p className="font-display text-xl font-black">G$ 128</p>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {["Pay", "Claim", "Request"].map((l) => (
          <div key={l} className="rounded-xl bg-white py-2 text-center font-display text-[9px] font-bold shadow-sm">{l}</div>
        ))}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ASSETS.NAV_KUMO} alt="" className="mx-auto mt-2 h-10 w-10 object-contain opacity-80" draggable={false} />
    </PreviewFrame>
  )
}

function PreviewPay() {
  return (
    <PreviewFrame label="Pay">
      <div className="flex flex-col items-center py-2">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-violet2 text-white shadow-violetglow">
          <Mic size={24} />
        </div>
        <p className="mt-2 font-display text-[10px] font-semibold text-slate2">Tap to speak</p>
        <div className="mt-3 w-full rounded-xl bg-white px-3 py-2 font-display text-[10px] text-muted ring-1 ring-lilac/30">
          send 5 to Maria
        </div>
      </div>
    </PreviewFrame>
  )
}

function PreviewClaim() {
  return (
    <PreviewFrame label="Claim UBI">
      <div className="flex items-center gap-2 rounded-xl bg-[#D1FAE5] px-3 py-2">
        <Shield size={16} className="text-emerald-700" />
        <span className="font-display text-[10px] font-bold text-emerald-900">Verified human</span>
      </div>
      <p className="mt-3 font-display text-2xl font-black">8 <span className="text-gpos text-base">G$</span></p>
      <div className="mt-2 flex items-center gap-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ASSETS.FLAME} alt="" className="h-4 w-4" draggable={false} />
        <span className="font-display text-[10px] font-bold text-violet2-deep">2-day streak</span>
      </div>
    </PreviewFrame>
  )
}

function PreviewRequest() {
  return (
    <PreviewFrame label="Request QR">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-ink/90">
        <QrCode size={28} className="text-white" />
      </div>
      <p className="mt-2 text-center font-display text-lg font-black">30 <span className="text-gpos text-sm">G$</span></p>
      <p className="text-center font-display text-[10px] text-slate2">Tea Stall, chai</p>
    </PreviewFrame>
  )
}

/* ─── 7. Final CTA ─── */

function FinalCTA({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section className="px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-3xl text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ASSETS.MASCOT_SIGNAL} alt="" className="mx-auto h-28 w-28 animate-float-slow object-contain sm:h-32 sm:w-32" draggable={false} />
        <h2 className="mt-6 font-display text-[clamp(1.75rem,4vw,2.5rem)] font-black tracking-tight">
          Ready to use GoodDollar the easy way?
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-[16px] text-slate2">No app store. No gas token. Just open and go.</p>
        <BtnPrimary onClick={onLaunch} className="mt-8">
          Open kumo-good <Arrow size={18} />
        </BtnPrimary>
      </div>
    </section>
  )
}

function LandingFooter() {
  return (
    <footer className="border-t border-lilac/20 bg-white py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ASSETS.NAV_KUMO} alt="" className="h-8 w-8" draggable={false} />
          <span className="font-display text-[15px] font-bold">kumo good</span>
        </div>
        <p className="font-display text-[12px] text-muted">GoodDollar, Celo, Non-custodial PWA</p>
        <p className="font-display text-[12px] text-muted">© 2026 Kumo</p>
      </div>
    </footer>
  )
}
