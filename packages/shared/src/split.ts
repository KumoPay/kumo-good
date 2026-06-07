import { z } from "zod"

// Claim-and-Split: one offline-signed permit authorizes a TOTAL; on reconnect the
// relayer fans the sum out to N recipients as N transferFrom legs. This module
// holds the chain-agnostic pieces: the parsed intent, an exact-sum even split,
// and a deterministic "split 30 between Ama, Kofi and Esi" parser. The wire
// format (RelaySplitTransfer) lives in ./permit next to the single-recipient one.

/** Fan-out bound. Keeps one permit → N transferFroms cheap and the UI legible. */
export const MAX_SPLIT_RECIPIENTS = 20

export const SplitIntentSchema = z.object({
  /** The whole-G$ sum to divide across `recipients`. */
  total: z.number().positive().max(1_000_000),
  /** 2..MAX names or 0x addresses; resolved to addresses before signing. */
  recipients: z.array(z.string().min(1).max(64)).min(2).max(MAX_SPLIT_RECIPIENTS),
  memo: z.string().max(120).optional(),
})
export type SplitIntent = z.infer<typeof SplitIntentSchema>

/**
 * Divide `total` base units into `n` parts that sum EXACTLY back to `total`.
 * Integer division leaves a remainder of at most `n-1` wei; we hand one extra
 * wei to each of the earliest parts so Σ legs === total and the permit's whole
 * allowance is consumed (no dust allowance left dangling for the spender).
 */
export function splitEvenly(total: bigint, n: number): bigint[] {
  if (!Number.isInteger(n) || n <= 0) throw new Error("split needs at least one recipient")
  if (total <= 0n) throw new Error("split total must be positive")
  // Every leg must be ≥ 1 base unit, matching the relayer's leg > 0 rule.
  if (total < BigInt(n)) throw new Error("split total too small: each recipient must receive at least 1 base unit")
  const each = total / BigInt(n)
  let remainder = total - each * BigInt(n)
  return Array.from({ length: n }, () => {
    const extra = remainder > 0n ? 1n : 0n
    if (remainder > 0n) remainder -= 1n
    return each + extra
  })
}

// --- natural-language parsing -------------------------------------------------
// "split <amount> [g$] (between|among|across|with) <A, B and C>" → SplitIntent.
// Deliberately narrow (same philosophy as the single-send regex parser): returns
// null when it can't confidently match so the caller can fall back / surface an
// error rather than guess.

const SPLIT_VERB = /^\s*(?:split|divide)\s+/i
const CONNECTOR = /\b(?:between|among|amongst|across|with|to)\b/i
// Capture a whole number token (may carry grouping/decimal); normalized below.
const AMOUNT = /(\d[\d.,]*\d|\d)/
const MEMO = /\b(?:for|memo:?|note:?)\s+(.+)$/i
// The amount's trailing unit ("g$", "gd", "g", "dollars"…), stripped ONLY when it
// leads the recipient list (no connector). Never strip interior tokens, so a
// recipient literally named "G"/"GD" is preserved rather than silently dropped.
const LEADING_UNIT = /^\s*(?:good\s?dollars?|g\$|gd|g\s?dollars?|dollars?|bucks?|g|\$)\b\s*/i
// Recipient separators: commas, semicolons, ampersands, "and", "plus".
const LIST_SEP = /\s*(?:,|;|&|\band\b|\bplus\b)\s*/i

/**
 * Parse an amount token unambiguously, returning NaN (→ caller rejects) when it
 * can't be sure. Accepts "30", "12.5", grouped thousands "1,000"/"1,000.50", and
 * a single European decimal comma "12,5"; anything else is rejected rather than
 * silently truncated (e.g. "1,000" must NOT become 1).
 */
function normalizeAmount(raw: string): number {
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) return Number(raw.replace(/,/g, "")) // 1,000 / 1,000.50
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw) // 30 / 12.5
  if (/^\d+,\d{1,2}$/.test(raw)) return Number(raw.replace(",", ".")) // 12,5 (european decimal)
  return NaN
}

export function parseSplit(input: string): SplitIntent | null {
  const text = (input ?? "").trim()
  if (!text || !SPLIT_VERB.test(text)) return null

  // memo first ("…for lunch"), so it isn't parsed as a recipient.
  let working = text
  let memo: string | undefined
  const memoMatch = working.match(MEMO)
  if (memoMatch && memoMatch.index != null) {
    memo = memoMatch[1].trim().replace(/[.,;]+$/, "")
    working = working.slice(0, memoMatch.index).trim()
  }

  // Split the utterance at the connector so the amount is read from the head
  // (never from digits inside a 0x address in the recipient list).
  const conn = working.match(CONNECTOR)
  const head = conn && conn.index != null ? working.slice(0, conn.index) : working
  const listPart = conn && conn.index != null ? working.slice(conn.index + conn[0].length) : working

  const amountMatch = head.match(AMOUNT)
  if (!amountMatch) return null
  const total = normalizeAmount(amountMatch[1])
  if (!Number.isFinite(total) || total <= 0) return null

  // When there was no connector, recipients are whatever follows the amount; strip
  // only a leading unit there. With a connector the unit lives in the head, so the
  // list is taken verbatim (interior currency-word names survive).
  let rawList = conn ? listPart : listPart.slice((amountMatch.index ?? 0) + amountMatch[0].length)
  if (!conn) rawList = rawList.replace(LEADING_UNIT, "")

  const recipients = rawList
    .split(LIST_SEP)
    .map((s) => s.replace(/[^\w.\- ]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((s) => s.slice(0, 64))

  if (recipients.length < 2) return null
  const parsed = SplitIntentSchema.safeParse({ total, recipients, ...(memo ? { memo } : {}) })
  return parsed.success ? parsed.data : null
}

/** Short human label for a split, for queue/activity rows. */
export function splitLabel(s: SplitIntent): string {
  return `${s.total} G$ · split ${s.recipients.length} ways`
}
