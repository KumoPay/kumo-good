// Deterministic regex fallback for "pay/send/stream <recipient> <amount> [g$]
// [per month] [for <memo>]" intents. Used only when the on-device LLM is
// unavailable or fails. Coverage goal ~80% of the structured demo grammar; by
// design it does NOT handle freeform speech ("uh send like 12 bucks"). Returns
// null when it can't confidently match so the caller can surface a clear error.

import { PaymentIntentSchema, type PaymentIntent } from "./payment-intent"
import { parseSplit, type SplitIntent } from "./split"

const VERBS = /^(pay|send|transfer|move|stream)\s+/i
const MEMO = /\b(?:for|memo:?|note:?)\s+(.+)$/i
// Bare number (the amount). Currency words are stripped separately below.
const AMOUNT = /\b(\d+(?:[.,]\d+)?)/
// G$ vocabulary, stripped as standalone words so it never eats a real name.
const CURRENCY_WORDS = /\b(?:good\s?dollars?|g\$|gd|g\s?dollars?|dollars?|bucks?|g)\b|\$/gi
const TO_PREP = /\bto\b/gi
const PERIOD = /\b(?:per|every|a|each)\s+(month|week|day)\b|\b(monthly|weekly|daily)\b/i

export function parseIntentRegex(input: string): PaymentIntent | null {
  if (!input || !input.trim()) return null
  const original = input.trim()

  // amount — extract before stripping anything else.
  const amountMatch = original.match(AMOUNT)
  if (!amountMatch) return null
  const amount = Number(amountMatch[1].replace(",", "."))
  if (!Number.isFinite(amount) || amount <= 0) return null

  // period (recurring stream)
  let period: "day" | "week" | "month" | undefined
  const periodMatch = original.match(PERIOD)
  if (periodMatch) {
    const raw = (periodMatch[1] ?? periodMatch[2] ?? "").toLowerCase()
    if (raw.startsWith("month")) period = "month"
    else if (raw.startsWith("week")) period = "week"
    else if (raw.startsWith("day") || raw === "daily") period = "day"
  }

  let working = original

  // memo: "for X" / "memo: X" / "note: X" — capture, then strip from working.
  let memo: string | undefined
  const memoMatch = working.match(MEMO)
  if (memoMatch && memoMatch.index != null) {
    memo = memoMatch[1].trim().replace(/[.,;]+$/, "")
    working = working.slice(0, memoMatch.index).trim()
  }

  working = working.replace(VERBS, "")
  working = working.replace(amountMatch[0], " ") // strip just the amount number
  working = working.replace(CURRENCY_WORDS, " ")
  working = working.replace(PERIOD, " ")
  working = working.replace(TO_PREP, " ")

  // recipient: prefer a 0x address, else the cleaned remainder (names may have spaces).
  const cleaned = working
    .replace(/[^\w.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!cleaned) return null
  const tokens = cleaned.split(" ")
  const addrLike = tokens.find((t) => /^0x[0-9a-fA-F]{40}$/.test(t))
  const finalRecipient = (addrLike ?? cleaned).slice(0, 64)

  const candidate: PaymentIntent = {
    recipient: finalRecipient,
    amount,
    ...(memo ? { memo } : {}),
    ...(period ? { period } : {}),
  }
  const parsed = PaymentIntentSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

// --- multi-verb command parsing -------------------------------------------
// Turns one utterance into an ordered action plan so a single voice command can
// claim UBI, send/stream, or ask a balance — e.g. "claim my UBI and send 5 to mom"
// → [{claim}, {send 5 → mom}]. Powers the voice agent and the claim-and-send combo.

export type Action =
  | { type: "claim" }
  | { type: "send"; intent: PaymentIntent }
  | { type: "split"; split: SplitIntent }
  | { type: "balance" }

const CLAIM_RE = /\b(claim|collect)\b/i
const SPLIT_VERB_RE = /\b(split|divide)\b/i
const SEND_VERB_RE = /\b(send|pay|transfer|move|stream)\b/i
const BALANCE_RE = /\b(balance|how much (?:do )?i (?:have|got)|what(?:'s| is) my balance)\b/i

export function parseCommand(input: string): Action[] {
  const text = (input ?? "").trim()
  if (!text) return []
  const actions: Action[] = []

  const hasClaim = CLAIM_RE.test(text)
  if (hasClaim) actions.push({ type: "claim" })

  // Split takes precedence over send: "split 30 between A and B" (optionally
  // after "claim my UBI and …"). Only treat it as a split when "split/divide" is
  // used as a VERB (followed by content) — not when the word appears in a memo
  // like "send 5 to bob for the split".
  const splitMatch = text.match(SPLIT_VERB_RE)
  const splitIsVerb = splitMatch && splitMatch.index != null && /^(?:split|divide)\s+\S/i.test(text.slice(splitMatch.index))
  if (splitIsVerb) {
    const split = parseSplit(text.slice(splitMatch.index))
    if (split) {
      actions.push({ type: "split", split })
      return actions
    }
    // A split was clearly intended but couldn't be parsed. Do NOT fall through to
    // a send (which would treat "split" as the recipient) or silently run only a
    // preceding claim — return nothing so the caller shows a clear "rephrase".
    return []
  }

  const sendMatch = text.match(SEND_VERB_RE)
  if (sendMatch && sendMatch.index != null) {
    // Parse from the send verb onward so a preceding "claim …" clause is ignored
    // and memos containing "and" aren't split apart.
    const intent = parseIntentRegex(text.slice(sendMatch.index))
    if (intent) actions.push({ type: "send", intent })
  } else if (!hasClaim) {
    if (BALANCE_RE.test(text)) actions.push({ type: "balance" })
    else {
      const intent = parseIntentRegex(text)
      if (intent) actions.push({ type: "send", intent })
    }
  }

  if (actions.length === 0 && BALANCE_RE.test(text)) actions.push({ type: "balance" })
  return actions
}
