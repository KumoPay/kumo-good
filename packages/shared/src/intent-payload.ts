import { z } from "zod"
import { PaymentIntentSchema, type PaymentIntent } from "./payment-intent"
import { base64Encode, base64Decode } from "./b64"

/**
 * URI prefix for kumo-good intent payloads. Lets a receiver detect a payload
 * inside any text channel (QR scan, SMS, Telegram, AirDrop). Carries the
 * offline-signed EIP-2612 permit so the recipient (or a relayer) can settle it.
 */
export const INTENT_PAYLOAD_PREFIX = "kumo-good:intent:v1:"

const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const HexSig = z.string().regex(/^0x[0-9a-fA-F]{130}$/)
const Uint = z.string().regex(/^\d+$/)
const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/i)

export const IntentPayloadWalletSchema = z.object({
  label: z.string().optional(),
  address: Address,
})
export type IntentPayloadWallet = z.infer<typeof IntentPayloadWalletSchema>

export const IntentPayloadPermitSchema = z.object({
  token: Address,
  owner: Address,
  spender: Address,
  value: Uint,
  nonce: Uint,
  deadline: z.number().int().nonnegative(),
  chainId: z.number().int().positive(),
})

export const IntentPayloadSchema = z.object({
  v: z.literal(1),
  kind: z.literal("kumo-good.intent"),
  wallet: IntentPayloadWalletSchema,
  intent: PaymentIntentSchema,
  intentHash: Sha256Hex,
  permit: IntentPayloadPermitSchema,
  recipient: Address,
  signature: HexSig,
  createdAt: z.number().int().nonnegative(),
})
export type IntentPayload = z.infer<typeof IntentPayloadSchema>

export type IntentPayloadInput = {
  intent: PaymentIntent
  intentHash: string
  permit: z.infer<typeof IntentPayloadPermitSchema>
  recipient: string
  signature: string
  createdAt: number
}

/**
 * Build a self-contained, transport-agnostic payload carrying the intent plus
 * the offline-signed permit. Encoded as `kumo-good:intent:v1:<base64-json>` so
 * it survives QR, SMS, Telegram, AirDrop.
 */
export function buildIntentPayload(
  entry: IntentPayloadInput,
  wallet: IntentPayloadWallet,
): string {
  const payload: IntentPayload = {
    v: 1,
    kind: "kumo-good.intent",
    wallet: {
      ...(wallet.label ? { label: wallet.label } : {}),
      address: wallet.address,
    },
    intent: entry.intent,
    intentHash: entry.intentHash,
    permit: entry.permit,
    recipient: entry.recipient as IntentPayload["recipient"],
    signature: entry.signature as IntentPayload["signature"],
    createdAt: entry.createdAt,
  }
  return `${INTENT_PAYLOAD_PREFIX}${base64Encode(JSON.stringify(payload))}`
}

/** Inverse of buildIntentPayload. Validates with zod — throws on a malformed payload. */
export function parseIntentPayload(uri: string): IntentPayload {
  if (!uri.startsWith(INTENT_PAYLOAD_PREFIX)) {
    throw new Error("Not a kumo-good intent payload: missing prefix")
  }
  const b64 = uri.slice(INTENT_PAYLOAD_PREFIX.length)
  let json: string
  try {
    json = base64Decode(b64)
  } catch {
    throw new Error("Not a kumo-good intent payload: invalid base64")
  }
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error("Not a kumo-good intent payload: invalid JSON")
  }
  return IntentPayloadSchema.parse(data)
}
