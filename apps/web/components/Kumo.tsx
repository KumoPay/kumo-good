// The Kumo brand kit: the real mascot (brand PNGs), a small cloud watermark, and
// shared UI primitives in the Kumo light "cloud" language. Mascot artwork +
// state library come from the kumo-frontend brand (apps/web/public/brand).
import { Wifi, WifiOff } from "@/components/Icons"

const CLOUD_PATH =
  "M46 138 C24 138 18 110 40 104 C30 78 66 68 80 86 C86 58 132 56 142 84 C158 70 190 80 184 106 C206 110 202 138 180 138 Z"

export type MascotState = "cheerful" | "waving" | "signal" | "sleeping" | "celebrating" | "offline"

// Each state maps to a brand illustration. The art already bakes in its own
// decoration (signal waves, sleep z's on a cloud, excitement, the red no-signal
// mark), so we render the pet directly — no SVG overlays.
const MASCOT_SRC: Record<MascotState, string> = {
  cheerful: "/brand/state-07.png", // standing, content
  waving: "/brand/kumo-mascot.png", // hero pet, signal waves both sides
  signal: "/brand/kumo-mascot.png", // online — radiating signal
  celebrating: "/brand/state-03.png", // excited, open-mouth grin
  sleeping: "/brand/state-02.png", // dozing on a cloud with z z z
  offline: "/brand/kumo-offline-mascot.png", // worried + red no-signal
}

/** The Kumo pet — the brand's real mascot illustration, by expression state. */
export function KumoMascot({
  state = "cheerful",
  width = 160,
  parens = false,
  float = true,
  className = "",
}: {
  state?: MascotState
  width?: number
  /** kept for call-site compatibility; the brand pet carries its own props */
  coin?: boolean
  parens?: boolean
  float?: boolean
  className?: string
}) {
  const pet = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={MASCOT_SRC[state]}
      alt={`Kumo mascot — ${state}`}
      width={width}
      height={width}
      className={float ? "animate-breathe" : ""}
      style={{ width, height: width, objectFit: "contain" }}
      draggable={false}
    />
  )

  if (!parens) return <div className={`inline-block ${className}`}>{pet}</div>

  return (
    <div className={`inline-flex items-center justify-center gap-1 ${className}`}>
      <span className="select-none font-display leading-none text-lilac" style={{ fontSize: width * 0.5, fontWeight: 300, marginRight: -width * 0.03 }}>
        ❨
      </span>
      {pet}
      <span className="select-none font-display leading-none text-lilac" style={{ fontSize: width * 0.5, fontWeight: 300, marginLeft: -width * 0.03 }}>
        ❩
      </span>
    </div>
  )
}

/** Small inline mascot mark for nav / top bars / footers (the brand pet, scaled). */
export function KumoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/kumo-mascot.png"
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain", display: "inline-block", verticalAlign: "middle" }}
      draggable={false}
    />
  )
}

/** Tiny abstract cloud watermark — decorative only (faint background puffs). */
export function CloudMark({ size = 26, color = "#7FE8FF" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size * 0.78} viewBox="0 0 220 170" aria-hidden="true">
      <path d={CLOUD_PATH} fill={color} stroke="#0B1020" strokeWidth="0" />
      <circle cx="91" cy="104" r="5.5" fill="#0B1020" />
      <circle cx="131" cy="104" r="5.5" fill="#0B1020" />
      <path d="M100 118 q11 9 22 0" fill="none" stroke="#0B1020" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

// --- shared primitives -----------------------------------------------------

export function PillButton({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  disabled,
  onClick,
  className = "",
  type = "button",
  ariaLabel,
}: {
  children: React.ReactNode
  variant?: "primary" | "secondary" | "violet" | "ghost" | "danger"
  size?: "sm" | "md" | "lg" | "block"
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  disabled?: boolean
  onClick?: () => void
  className?: string
  type?: "button" | "submit"
  ariaLabel?: string
}) {
  const sizes = {
    sm: "text-[13px] px-4 py-2",
    md: "text-[15px] px-5 py-2.5",
    lg: "text-[16px] px-6 py-3.5",
    block: "text-[16px] px-6 py-3.5 w-full",
  }
  const variants = {
    primary: "bg-cyan text-ink shadow-glow hover:shadow-glowlg",
    secondary: "bg-white text-ink ring-[1.5px] ring-inset ring-ink/85 hover:bg-cream",
    violet: "bg-violet2 text-white shadow-violetglow hover:bg-violet2-deep",
    ghost: "bg-lilac/25 text-violet2-deep hover:bg-lilac/40",
    danger: "bg-white text-red-600 ring-[1.5px] ring-inset ring-red-200 hover:bg-red-50",
  }
  const disabledCls = "bg-hair text-white/90 shadow-none cursor-not-allowed"
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`press inline-flex select-none items-center justify-center gap-2 rounded-full font-display font-extrabold
        focus:outline-none focus-visible:ring-2 focus-visible:ring-violet2 focus-visible:ring-offset-2
        ${sizes[size]} ${disabled ? disabledCls : variants[variant]} ${className}`}
    >
      {icon}
      <span>{children}</span>
      {iconRight}
    </button>
  )
}

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`eyebrow ${className}`}>{children}</div>
}

export type ChipTone = "cyan" | "lilac" | "violet" | "green" | "red" | "slate" | "amber"
export function Chip({
  children,
  tone = "cyan",
  className = "",
  icon,
}: {
  children: React.ReactNode
  tone?: ChipTone
  className?: string
  icon?: React.ReactNode
}) {
  const tones: Record<ChipTone, string> = {
    cyan: "bg-cyan/35 text-ink",
    lilac: "bg-lilac/45 text-violet2-deep",
    violet: "bg-violet2/12 text-violet2-deep",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-600",
    slate: "bg-slate-100 text-slate2",
    amber: "bg-amber-100 text-amber-700",
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-bold font-display ${tones[tone]} ${className}`}>
      {icon}
      {children}
    </span>
  )
}

export function Card({
  children,
  className = "",
  onClick,
  pad = true,
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  pad?: boolean
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-card shadow-card ${pad ? "p-5" : ""} ${onClick ? "press cursor-pointer hover:shadow-cardlg" : ""} ${className}`}
    >
      {children}
    </div>
  )
}

/** key/value row with dashed bottom divider; uppercase tracked key. */
export function KvRow({
  label,
  children,
  last = false,
  className = "",
}: {
  label: string
  children: React.ReactNode
  last?: boolean
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-3 ${last ? "" : "dashed-divider"} ${className}`}>
      <span className="eyebrow shrink-0">{label}</span>
      <span className="min-w-0 truncate text-right text-[14.5px] font-semibold text-ink">{children}</span>
    </div>
  )
}

export type ItemStatus = "queued" | "settling" | "settled" | "failed" | "expired"
export function StatusPill({ status }: { status: ItemStatus }) {
  const map: Record<ItemStatus, { tone: ChipTone; label: string }> = {
    queued: { tone: "violet", label: "Queued" },
    settling: { tone: "violet", label: "Settling" },
    settled: { tone: "green", label: "Settled" },
    failed: { tone: "red", label: "Failed" },
    expired: { tone: "red", label: "Expired" },
  }
  const s = map[status] || map.queued
  const dot = ({ violet: "#7c5cff", green: "#16a34a", red: "#dc2626" } as Record<string, string>)[s.tone]
  return (
    <Chip tone={s.tone} icon={<span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}>
      {s.label}
    </Chip>
  )
}

export function OnlineChip({ online, onClick, asButton = true }: { online: boolean; onClick?: () => void; asButton?: boolean }) {
  const inner = online ? (
    <>
      <Wifi size={14} /> Online
    </>
  ) : (
    <>
      <WifiOff size={14} /> Offline
    </>
  )
  const cls = `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold font-display press
    ${online ? "bg-cyan/40 text-ink" : "bg-lilac/50 text-violet2-deep"}`
  if (asButton && onClick)
    return (
      <button onClick={onClick} className={cls} aria-label={`Network: ${online ? "online" : "offline"}.`}>
        {inner}
      </button>
    )
  return <span className={cls}>{inner}</span>
}

/** G$ amount display — number in ink, "G$" in green. */
export function GAmount({ value, size = "text-3xl", className = "" }: { value: React.ReactNode; size?: string; className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 font-display font-black tracking-tight ${size} ${className}`}>
      {value}
      <span className="font-extrabold text-gpos" style={{ fontSize: "0.62em" }}>
        G$
      </span>
    </span>
  )
}

/** Labeled input/textarea in Kumo style. */
export function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
  prefix,
  suffix,
  type = "text",
  textarea,
  rows = 3,
  className = "",
  inputMode,
}: {
  label?: string
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  mono?: boolean
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  type?: string
  textarea?: boolean
  rows?: number
  className?: string
  inputMode?: "text" | "decimal" | "numeric"
}) {
  const base = `w-full bg-cream rounded-2xl border border-slate-200 px-4 py-3 text-[15px] text-ink placeholder:text-muted
    focus:outline-none focus:border-violet2/60 focus:ring-2 focus:ring-violet2/15 ${mono ? "font-mono tracking-tight" : "font-body"}`
  return (
    <label className={`block ${className}`}>
      {label && <span className="eyebrow mb-1.5 block">{label}</span>}
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-4 text-[15px] font-semibold text-muted">{prefix}</span>}
        {textarea ? (
          <textarea
            value={value}
            onChange={(e) => onChange && onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className={base + " resize-none leading-relaxed"}
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange && onChange(e.target.value)}
            placeholder={placeholder}
            type={type}
            inputMode={inputMode}
            className={base + (prefix ? " pl-9" : "") + (suffix ? " pr-12" : "")}
          />
        )}
        {suffix && <span className="absolute right-4 text-[14px] font-bold font-display text-slate2">{suffix}</span>}
      </div>
    </label>
  )
}
