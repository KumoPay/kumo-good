import { z } from "zod"

// Wire format for the relayer's gasless UBI claim endpoint.

const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/)

export const RelayClaimSchema = z.object({
  chainId: z.number().int().positive(),
  user: Address,
})
export type RelayClaim = z.infer<typeof RelayClaimSchema>

export const RelayClaimResultSchema = z.object({
  ok: z.boolean(),
  /** How the claim was handled. */
  mode: z.enum(["claimFor", "gas-grant", "none"]).optional(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  /** When true, the relayer only funded gas — the browser must self-claim. */
  selfClaim: z.boolean().optional(),
  /** Entitlement at claim time, base units (display only). */
  amount: z.string().optional(),
  feeCurrency: Address.optional(),
  error: z.string().optional(),
})
export type RelayClaimResult = z.infer<typeof RelayClaimResultSchema>
