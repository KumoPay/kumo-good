// Inline SVG icon set in the Kumo line style. Ported from the design bundle
// (kumogood/project/kumo-icons.jsx). Icons inherit currentColor; pass `size`
// (px) and `stroke` (width) to tune. Some are filled marks.
type P = { className?: string; size?: number; stroke?: number; style?: React.CSSProperties }

const Ic = ({
  size = 22,
  className = "",
  children,
  stroke = 1.9,
  fill = "none",
  vb = 24,
  style,
}: Omit<P, "stroke"> & { children: React.ReactNode; fill?: string; vb?: number; stroke?: number | string }) => (
  <svg
    width={size}
    height={size}
    viewBox={`0 0 ${vb} ${vb}`}
    fill={fill}
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const Home = (p: P) => (
  <Ic {...p}>
    <path d="M3 11.2 12 4l9 7.2" />
    <path d="M5.5 9.8V20h13V9.8" />
    <path d="M10 20v-5h4v5" fill="none" />
  </Ic>
)
export const Activity = (p: P) => (
  <Ic {...p}>
    <path d="M3 12h4l2.5 6 4-13L16 12h5" />
  </Ic>
)
export const Identity = (p: P) => (
  <Ic {...p}>
    <circle cx="12" cy="9" r="3.4" />
    <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
  </Ic>
)
export const Wallet = (p: P) => (
  <Ic {...p}>
    <rect x="3" y="6" width="18" height="13" rx="3" />
    <path d="M3 10h18" />
    <circle cx="17" cy="14" r="1.3" fill="currentColor" stroke="none" />
  </Ic>
)
export const Mic = (p: P) => (
  <Ic {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <path d="M12 17.5V21" />
    <path d="M8.5 21h7" />
  </Ic>
)
export const QrCode = (p: P) => (
  <Ic {...p}>
    <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.4" />
    <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.4" />
    <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.4" />
    <path d="M14 14h3v3M20.5 14v6.5M14 20.5h3" />
  </Ic>
)
export const Scan = (p: P) => (
  <Ic {...p}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M4 12h16" />
  </Ic>
)
export const Camera = (p: P) => (
  <Ic {...p}>
    <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <circle cx="12" cy="13" r="3.5" />
  </Ic>
)
export const Arrow = (p: P) => (
  <Ic {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Ic>
)
export const ArrowUp = (p: P) => (
  <Ic {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Ic>
)
export const ArrowDown = (p: P) => (
  <Ic {...p}>
    <path d="M12 5v14M18 13l-6 6-6-6" />
  </Ic>
)
export const Check = (p: P) => (
  <Ic {...p}>
    <path d="M5 12.5 10 17l9-10" />
  </Ic>
)
export const CheckCircle = (p: P) => (
  <Ic {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.3 11 15l5-6" />
  </Ic>
)
export const Info = (p: P) => (
  <Ic {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r="0.75" fill="currentColor" stroke="none" />
  </Ic>
)
export const Copy = (p: P) => (
  <Ic {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" />
  </Ic>
)
export const Wifi = (p: P) => (
  <Ic {...p}>
    <path d="M2.5 9.5a14 14 0 0 1 19 0" />
    <path d="M6 13a9 9 0 0 1 12 0" />
    <path d="M9.5 16.4a4 4 0 0 1 5 0" />
    <circle cx="12" cy="20" r="0.6" fill="currentColor" stroke="none" />
  </Ic>
)
export const WifiOff = (p: P) => (
  <Ic {...p}>
    <path d="M2.5 9.5a14 14 0 0 1 6-3.6M15 6a14 14 0 0 1 6.5 3.5" />
    <path d="M9.5 16.4a4 4 0 0 1 5 0" />
    <circle cx="12" cy="20" r="0.6" fill="currentColor" stroke="none" />
    <path d="M3 3l18 18" />
  </Ic>
)
export const Flame = (p: P) => (
  <Ic {...p} fill="currentColor" stroke="none">
    <path d="M12 2.5c2.2 3 1 5-0.3 6.4C10 11 9 12 9 13.6a3 3 0 0 0 6 0c0-.7-.2-1.3-.5-1.9 1.6.7 3 2.3 3 4.6a5.5 5.5 0 0 1-11 0c0-3.4 2.2-5.4 3.4-7.3C10.9 7 11.6 5 12 2.5Z" />
  </Ic>
)
export const Split = (p: P) => (
  <Ic {...p}>
    <path d="M6 3v5a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v5" />
    <path d="M3 6l3-3 3 3" />
    <path d="M15 18l3 3 3-3" />
  </Ic>
)
export const List = (p: P) => (
  <Ic {...p}>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <circle cx="4" cy="6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="18" r="1.1" fill="currentColor" stroke="none" />
  </Ic>
)
export const Shield = (p: P) => (
  <Ic {...p}>
    <path d="M12 3 5 6v5c0 4.2 2.9 7.5 7 9 4.1-1.5 7-4.8 7-9V6l-7-3Z" />
    <path d="M9 12l2 2 4-4" />
  </Ic>
)
export const Key = (p: P) => (
  <Ic {...p}>
    <circle cx="8" cy="8" r="4" />
    <path d="M11 11l8 8M16 16l2-2M18.5 18.5l1.5-1.5" />
  </Ic>
)
export const ChevR = (p: P) => (
  <Ic {...p}>
    <path d="M9 6l6 6-6 6" />
  </Ic>
)
export const Close = (p: P) => (
  <Ic {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Ic>
)
export const Plus = (p: P) => (
  <Ic {...p}>
    <path d="M12 5v14M5 12h14" />
  </Ic>
)
export const Bolt = (p: P) => (
  <Ic {...p} fill="currentColor" stroke="none">
    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
  </Ic>
)
export const Link = (p: P) => (
  <Ic {...p}>
    <path d="M9 14a4 4 0 0 0 6 0l2.5-2.5a4 4 0 1 0-5.7-5.7L10.5 7" />
    <path d="M15 10a4 4 0 0 0-6 0l-2.5 2.5a4 4 0 1 0 5.7 5.7L13.5 17" />
  </Ic>
)
export const Clock = (p: P) => (
  <Ic {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Ic>
)
export const Download = (p: P) => (
  <Ic {...p}>
    <path d="M12 4v11M7 11l5 5 5-5" />
    <path d="M5 19.5h14" />
  </Ic>
)
export const Refresh = (p: P) => (
  <Ic {...p}>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 4v3.5h-3.5" />
  </Ic>
)
export const User = (p: P) => (
  <Ic {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
  </Ic>
)
export const Face = (p: P) => (
  <Ic {...p}>
    <path d="M4 8V6.5A2.5 2.5 0 0 1 6.5 4H8M16 4h1.5A2.5 2.5 0 0 1 20 6.5V8M20 16v1.5a2.5 2.5 0 0 1-2.5 2.5H16M8 20H6.5A2.5 2.5 0 0 1 4 17.5V16" />
    <circle cx="9.5" cy="11" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="11" r="0.7" fill="currentColor" stroke="none" />
    <path d="M9.5 14.5a3.2 3.2 0 0 0 5 0" />
  </Ic>
)
export const Sparkle = (p: P) => (
  <Ic {...p} fill="currentColor" stroke="none">
    <path d="M12 2c.5 3.6 1.9 5 5.5 5.5C13.9 8 12.5 9.4 12 13c-.5-3.6-1.9-5-5.5-5.5C10.1 7 11.5 5.6 12 2Z" />
  </Ic>
)
export const Globe = (p: P) => (
  <Ic {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.3 3.6 8.5S14.4 18.2 12 20.5C9.6 18.2 8.4 15.2 8.4 12S9.6 5.8 12 3.5Z" />
  </Ic>
)
export const Trash = (p: P) => (
  <Ic {...p}>
    <path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.4L18 7" />
  </Ic>
)
export const Eye = (p: P) => (
  <Ic {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Ic>
)
export const Lock = (p: P) => (
  <Ic {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Ic>
)
export const Cloud = (p: P) => (
  <Ic {...p}>
    <path d="M7 18a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 9.2 3.9 3.9 0 0 1 17 18Z" />
  </Ic>
)
export const Play = (p: P) => (
  <Ic {...p} fill="currentColor" stroke="none">
    <path d="M7 4.5v15l13-7.5-13-7.5Z" />
  </Ic>
)
export const Send = (p: P) => (
  <Ic {...p}>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </Ic>
)
export const Bell = (p: P) => (
  <Ic {...p}>
    <path d="M18 16H6l-1.2-2.4A4.5 4.5 0 0 1 7 9.2V7.5a5 5 0 0 1 10 0V9.2a4.5 4.5 0 0 1 2.2 4.4L18 16Z" />
    <path d="M10 18.5a2 2 0 0 0 4 0" />
  </Ic>
)
export const Users = (p: P) => (
  <Ic {...p}>
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M14.5 19.5a4.5 4.5 0 0 1 6.5-4" />
  </Ic>
)
export const Gift = (p: P) => (
  <Ic {...p}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13M4 12v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8" />
    <path d="M12 8S10 3 7.5 4.5 9 8 12 8s2.5-4-1-3.5S12 8 12 8Z" />
  </Ic>
)
export const Message = (p: P) => (
  <Ic {...p}>
    <path d="M6 8a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H10l-4 3V8Z" />
  </Ic>
)

/** Gold G$ coin mark (filled, fixed colors). */
export const Coin = ({ size = 22, className = "" }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="#16a34a" />
    <circle cx="12" cy="12" r="10" fill="none" stroke="#0B1020" strokeWidth="1.4" opacity="0.12" />
    <text x="12" y="16.4" textAnchor="middle" fontFamily="Inter" fontWeight="800" fontSize="11" fill="#fff">
      G$
    </text>
  </svg>
)

// social
export const Twitter = (p: P) => (
  <Ic {...p}>
    <path d="M21 5.5c-.7.4-1.5.6-2.3.8a3.6 3.6 0 0 0-6.1 3.3A10.2 10.2 0 0 1 4 5.8a3.6 3.6 0 0 0 1.1 4.8c-.6 0-1.1-.2-1.6-.4a3.6 3.6 0 0 0 2.9 3.5c-.5.2-1 .2-1.5.1a3.6 3.6 0 0 0 3.3 2.5A7.2 7.2 0 0 1 3 17.6 10.2 10.2 0 0 0 20 9.2c.7-.5 1.3-1.1 1.8-1.8-.6.3-1.3.5-2 .6.7-.4 1.3-1.1 1.6-1.9" />
  </Ic>
)
export const Github = (p: P) => (
  <Ic {...p}>
    <path d="M9 19c-4 1.2-4-2-5.5-2.5M15 21v-3.2c0-.9-.1-1.5-.6-2 2.3-.3 4.6-1.1 4.6-5a3.8 3.8 0 0 0-1-2.7 3.5 3.5 0 0 0-.1-2.6s-.9-.3-2.9 1.1a10 10 0 0 0-5 0C6.5 2.9 5.6 3.2 5.6 3.2a3.5 3.5 0 0 0-.1 2.6 3.8 3.8 0 0 0-1 2.7c0 3.9 2.3 4.7 4.6 5-.3.3-.5.7-.6 1.4" />
  </Ic>
)
export const Discord = (p: P) => (
  <Ic {...p}>
    <path d="M8 6.5c2.6-.8 5.4-.8 8 0M8 17.5c2.6.8 5.4.8 8 0M6.5 7c-1.4 2.4-2 5-1.8 8 1.3 1 2.7 1.7 4.3 2l.8-1.5M17.5 7c1.4 2.4 2 5 1.8 8-1.3 1-2.7 1.7-4.3 2l-.8-1.5" />
    <circle cx="9.5" cy="12.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="12.5" r="1.1" fill="currentColor" stroke="none" />
  </Ic>
)
