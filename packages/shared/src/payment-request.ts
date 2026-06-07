import { z } from "zod"
import { base64Encode, base64Decode } from "./b64"

// A payee-authored payment request, carried in a QR or deep link. The PAYER
// scans/opens it, then signs an EIP-2612 permit (offline) to fulfil it. Shared by
// the Pay-by-QR scanner and the request-money link flow.

export const PAYMENT_REQUEST_PREFIX = "kumo-good:pay:v1:"

const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/)

export const PaymentRequestSchema = z.object({
  v: z.literal(1),
  to: Address, // recipient (payee) address
  amount: z.number().positive().max(1_000_000).optional(), // G$; omitted = payer chooses
  memo: z.string().max(120).optional(),
  label: z.string().max(40).optional(), // payee/merchant display name
  token: Address.optional(), // defaults to G$ on the client
  chainId: z.number().int().positive().optional(),
})
export type PaymentRequest = z.infer<typeof PaymentRequestSchema>

/** Encode a payment request as `kumo-good:pay:v1:<base64>` (goes in a QR or link). */
export function buildPaymentRequest(req: Omit<PaymentRequest, "v">): string {
  const payload: PaymentRequest = PaymentRequestSchema.parse({ v: 1, ...req })
  return `${PAYMENT_REQUEST_PREFIX}${base64Encode(JSON.stringify(payload))}`
}

/**
 * Parse a payment request. Accepts the bare `kumo-good:pay:v1:<b64>` URI or any
 * string/URL that contains it (e.g. an https deep link with the URI in a param).
 */
export function parsePaymentRequest(input: string): PaymentRequest {
  const at = input.indexOf(PAYMENT_REQUEST_PREFIX)
  if (at < 0) throw new Error("Not a kumo-good payment request")
  // take everything after the prefix up to the first char that can't be in base64url/base64
  const rest = input.slice(at + PAYMENT_REQUEST_PREFIX.length)
  const b64 = rest.match(/^[A-Za-z0-9+/=]+/)?.[0] ?? ""
  let json: string
  try {
    json = base64Decode(b64)
  } catch {
    throw new Error("Not a kumo-good payment request: invalid base64")
  }
  return PaymentRequestSchema.parse(JSON.parse(json))
}
