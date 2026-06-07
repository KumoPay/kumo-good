import type { PaymentIntent } from "./payment-intent"
import type { SplitIntent } from "./split"

/** SHA-256 hex of a string. Works in Node 20+ and the browser. */
async function sha256Hex(canonical: string): Promise<string> {
  const enc = new TextEncoder().encode(canonical)
  const buf = await crypto.subtle.digest("SHA-256", enc as BufferSource)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * SHA-256 hex of the canonical intent JSON. Used as the intent's stable identity
 * (queue key, audit trail). Canonicalization is strict: fixed field order, with
 * absent optional fields normalised to "" so the same intent always hashes the
 * same way across mobile, web and relayer.
 */
export function hashIntent(intent: PaymentIntent): Promise<string> {
  return sha256Hex(
    JSON.stringify({
      recipient: intent.recipient,
      amount: intent.amount,
      memo: intent.memo ?? "",
      period: intent.period ?? "",
    }),
  )
}

/** Stable identity for a Claim-and-Split intent (queue key, audit trail). */
export function hashSplit(split: SplitIntent): Promise<string> {
  return sha256Hex(
    JSON.stringify({
      total: split.total,
      recipients: split.recipients,
      memo: split.memo ?? "",
    }),
  )
}
