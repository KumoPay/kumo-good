import { formatUnits, CELOSCAN_TX, CELOSCAN_ADDRESS } from "@kumo-good/shared"

export function fmtG(units: bigint, maxFrac = 2): string {
  return formatUnits(units, 18, maxFrac)
}

/** Format any token balance to its own decimals (trailing zeros trimmed). */
export function fmtToken(units: bigint, decimals = 18, maxFrac = 4): string {
  return formatUnits(units, decimals, maxFrac)
}

export function shortAddr(addr?: string | null): string {
  if (!addr) return "—"
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function txLink(hash: string): string {
  return CELOSCAN_TX(hash)
}

export function addrLink(addr: string): string {
  return CELOSCAN_ADDRESS(addr)
}

export function relTime(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function isAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s.trim())
}
