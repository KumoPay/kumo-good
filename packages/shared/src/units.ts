import { G_DECIMALS } from "./constants"

/**
 * Convert a human G$ amount (whole tokens, e.g. 50 or 12.5) to base units
 * (wei-style integer) as a bigint. Uses toFixed to dodge float/exponential
 * drift, then clamps to `decimals` of precision.
 */
export function toBaseUnits(amount: number, decimals: number = G_DECIMALS): bigint {
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`invalid amount: ${amount}`)
  const fixed = amount.toFixed(decimals)
  const [intPart, fracPart = ""] = fixed.split(".")
  return BigInt(intPart + fracPart.padEnd(decimals, "0").slice(0, decimals))
}

/** Inverse of toBaseUnits. Lossy for values beyond JS number precision — display only. */
export function fromBaseUnits(units: bigint, decimals: number = G_DECIMALS): number {
  const base = 10n ** BigInt(decimals)
  const whole = units / base
  const frac = units % base
  return Number(whole) + Number(frac) / Number(base)
}

/** Format base units as a human string with up to `maxFrac` decimals, trailing zeros trimmed. */
export function formatUnits(units: bigint, decimals: number = G_DECIMALS, maxFrac = 2): string {
  const base = 10n ** BigInt(decimals)
  const whole = units / base
  const frac = units % base
  if (frac === 0n || maxFrac === 0) return whole.toString()
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "")
  return fracStr ? `${whole}.${fracStr}` : whole.toString()
}
