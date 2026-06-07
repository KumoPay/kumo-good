import { z } from "zod"
import { PaymentIntentSchema } from "./payment-intent"
import { RelayPermitTransferSchema, RelaySplitTransferSchema } from "./permit"
import { SplitIntentSchema } from "./split"

// The persisted offline queue, shared by web (localStorage) and mobile. The
// *store* is platform-specific; this schema + status state machine are not.
//
// A queued item is a discriminated union by `kind`:
//   - payment: an offline-signed EIP-2612 permit the relayer settles.
//   - claim:   a UBI claim to run on reconnect (gasless via the relayer).
//   - split:   one offline permit for a sum, fanned out to N recipients.
//
// Status state machine (both kinds):
//   queued ──flush──▶ settling ──ok──▶ settled
//      │                  └──error──▶ failed (retryable)
//      └──deadline passed (payment only)──▶ expired (must re-sign)

export const QUEUE_STATUSES = ["queued", "settling", "settled", "failed", "expired"] as const
export const QueueStatusSchema = z.enum(QUEUE_STATUSES)
export type QueueStatus = z.infer<typeof QueueStatusSchema>

const baseFields = {
  id: z.string(),
  status: QueueStatusSchema,
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  failureReason: z.string().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
}

export const QueuedPaymentSchema = z.object({
  kind: z.literal("payment"),
  ...baseFields,
  intent: PaymentIntentSchema,
  intentHash: z.string().regex(/^[0-9a-f]{64}$/i),
  /** Everything the relayer needs to settle — already signed, offline. */
  relay: RelayPermitTransferSchema,
})
export type QueuedPayment = z.infer<typeof QueuedPaymentSchema>

export const QueuedClaimSchema = z.object({
  kind: z.literal("claim"),
  ...baseFields,
  owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  /** UBIScheme currentDay() when queued, for "fresh day" detection. */
  claimDay: z.number().int().nonnegative().optional(),
})
export type QueuedClaim = z.infer<typeof QueuedClaimSchema>

export const QueuedSplitSchema = z.object({
  kind: z.literal("split"),
  ...baseFields,
  split: SplitIntentSchema,
  intentHash: z.string().regex(/^[0-9a-f]{64}$/i),
  /** One signed permit for the sum + the N legs the relayer transferFroms. */
  relay: RelaySplitTransferSchema,
})
export type QueuedSplit = z.infer<typeof QueuedSplitSchema>

export const QueuedItemSchema = z.discriminatedUnion("kind", [QueuedPaymentSchema, QueuedClaimSchema, QueuedSplitSchema])
export type QueuedItem = z.infer<typeof QueuedItemSchema>

/** A queued permit is dead once its deadline passes; claims never expire. */
export function isExpired(entry: QueuedItem, nowSeconds: number): boolean {
  return (entry.kind === "payment" || entry.kind === "split") && entry.relay.deadline <= Math.floor(nowSeconds)
}

/** Human "expires in N days/hours" string for the queue UI. */
export function expiresInLabel(deadlineSeconds: number, nowSeconds: number): string {
  const secs = deadlineSeconds - Math.floor(nowSeconds)
  if (secs <= 0) return "expired"
  const days = Math.floor(secs / 86_400)
  if (days >= 1) return `expires in ${days} day${days === 1 ? "" : "s"}`
  const hours = Math.max(1, Math.floor(secs / 3_600))
  return `expires in ${hours} hour${hours === 1 ? "" : "s"}`
}

/** Short human label for any queued item. */
export function itemLabel(e: QueuedItem): string {
  if (e.kind === "claim") return "Claim UBI"
  if (e.kind === "split") return `${e.split.total} G$ · split ${e.split.recipients.length} ways`
  return `${e.intent.amount} G$`
}
