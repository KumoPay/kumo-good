import { z } from "zod"

// Output of the natural-language → structured intent parser.
// Kept intentionally tiny: every extra field is just more rope for the LLM.
//
// Retargeted from Kumo (USDC on Solana) to G$ (GoodDollar) on Celo. Two
// deliberate changes from the Solana original:
//   1. `amount_usdc` → `amount` (in whole G$).
//   2. The `private` flag is dropped. There is no privacy layer for G$ on
//      Celo in scope, and the original flag had no cryptographic effect —
//      advertising "private" here would be dishonest.
// Added: an optional `period`. When present the intent is a recurring
// Superfluid stream of `amount` G$ per period instead of a one-shot send.

export const PaymentIntentSchema = z.object({
  recipient: z.string().min(1).max(64),
  amount: z.number().positive().max(1_000_000),
  memo: z.string().max(120).optional(),
  period: z.enum(["day", "week", "month"]).optional(),
})
export type PaymentIntent = z.infer<typeof PaymentIntentSchema>

/** True when the intent describes a recurring stream rather than a one-shot send. */
export function isStreamIntent(intent: PaymentIntent): boolean {
  return intent.period != null
}
