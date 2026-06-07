// Tiny inline icon set (no icon dependency). Inherit currentColor.
type P = { className?: string }
const S = ({ className, children }: P & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {children}
  </svg>
)
export const Mic = (p: P) => (
  <S {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></S>
)
export const Send = (p: P) => (
  <S {...p}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></S>
)
export const Check = (p: P) => (
  <S {...p}><path d="M20 6 9 17l-5-5" /></S>
)
export const Clock = (p: P) => (
  <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>
)
export const Wifi = (p: P) => (
  <S {...p}><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" /></S>
)
export const WifiOff = (p: P) => (
  <S {...p}><path d="m2 2 20 20M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 3-2.2M19 12.5a10 10 0 0 0-7-2.4M12 19.5h.01" /></S>
)
export const Shield = (p: P) => (
  <S {...p}><path d="M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6Z" /><path d="m9 12 2 2 4-4" /></S>
)
export const Gift = (p: P) => (
  <S {...p}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M4 12v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8" /><path d="M12 8S10 3 7.5 4.5 9 8 12 8s2.5-4-1-3.5S12 8 12 8Z" /></S>
)
export const Wallet = (p: P) => (
  <S {...p}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M16 12h.01M3 9h18" /></S>
)
export const Home = (p: P) => (
  <S {...p}><path d="m3 11 9-7 9 7M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" /></S>
)
export const Arrow = (p: P) => (
  <S {...p}><path d="M5 12h14M13 6l6 6-6 6" /></S>
)
export const Copy = (p: P) => (
  <S {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></S>
)
export const Camera = (p: P) => (
  <S {...p}><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><circle cx="12" cy="13" r="3.5" /></S>
)
export const QrCode = (p: P) => (
  <S {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v.01M14 21h.01M21 18v3h-3" /></S>
)
export const Flame = (p: P) => (
  <S {...p}><path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-1.5.7-2.8 1.5-3.6C8 10 9 11 9 12c0-2 1-4 3-4-1 2 .5 3 1.5 3.5C14 12 13 9 12 3Z" /></S>
)
