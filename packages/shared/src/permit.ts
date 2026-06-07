import { z } from "zod"
import { CELO_CHAIN_ID, G_PERMIT_DOMAIN, G_TOKEN, type GoodDollarEnv, type Hex } from "./constants"
import { MAX_SPLIT_RECIPIENTS } from "./split"

// EIP-2612 permit support for G$. The typed-data builder returns a plain
// object intentionally compatible with viem's `signTypedData` / `verifyTypedData`
// and ethers' `_signTypedData`, so this package needs no chain SDK dependency.

/** 14 days — long enough to survive a rural dead-zone, short enough to bound risk. */
export const DEFAULT_PERMIT_TTL_SECONDS = 14 * 24 * 60 * 60

export const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const

export type PermitMessage = {
  owner: Hex
  spender: Hex
  value: bigint
  nonce: bigint
  deadline: bigint
}

/**
 * Build the EIP-712 typed data for a G$ EIP-2612 permit. Pass the result
 * straight to `walletClient.signTypedData({ ...typedData, account })`.
 */
export function buildPermitTypedData(params: {
  message: PermitMessage
  token?: Hex
  chainId?: number
  env?: GoodDollarEnv
}) {
  const token = params.token ?? G_TOKEN[params.env ?? "production"]
  const chainId = params.chainId ?? CELO_CHAIN_ID
  return {
    domain: {
      name: G_PERMIT_DOMAIN.name,
      version: G_PERMIT_DOMAIN.version,
      chainId,
      verifyingContract: token,
    },
    types: PERMIT_TYPES,
    primaryType: "Permit" as const,
    message: params.message,
  }
}

/** Compute a permit deadline `ttl` seconds from `nowSeconds`. */
export function permitDeadline(nowSeconds: number, ttl = DEFAULT_PERMIT_TTL_SECONDS): bigint {
  return BigInt(Math.floor(nowSeconds) + ttl)
}

// --- Relayer wire format ------------------------------------------------------
// JSON-safe shapes the mobile/web client POSTs to services/relayer. bigints are
// carried as decimal strings so they survive JSON.stringify untouched.

const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected a 20-byte 0x address")
const HexSig = z.string().regex(/^0x[0-9a-fA-F]{130}$/, "expected a 65-byte 0x signature")
const Uint = z.string().regex(/^\d+$/, "expected a uint as a decimal string")
const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/i)

export const RelayPermitTransferSchema = z.object({
  chainId: z.number().int().positive(),
  token: Address, // G$ token = EIP-712 verifyingContract
  owner: Address, // the payer (permit signer)
  spender: Address, // the relayer address named in the permit
  recipient: Address, // final transferFrom destination
  value: Uint, // base units (18-dec) as a decimal string
  deadline: z.number().int().positive(), // unix seconds
  signature: HexSig, // packed 65-byte EIP-2612 signature
  intentHash: Sha256Hex.optional(),
  memo: z.string().max(120).optional(),
})
export type RelayPermitTransfer = z.infer<typeof RelayPermitTransferSchema>

export const RelayResultSchema = z.object({
  ok: z.boolean(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  feeCurrency: Address.optional(), // which stablecoin paid the gas
  gasUsed: Uint.optional(),
  error: z.string().optional(),
})
export type RelayResult = z.infer<typeof RelayResultSchema>

// --- Claim-and-Split wire format ---------------------------------------------
// One permit authorizes a SUM; the relayer fans it out to N recipients as N
// transferFrom legs. `value` is the permitted total and MUST equal Σ legs[].value
// so the whole allowance is consumed and no leg can over-spend. Fan-out is
// bounded by MAX_SPLIT_RECIPIENTS (the single source of truth in ./split).

const TxHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/)

export const SplitLegSchema = z.object({
  recipient: Address,
  value: Uint, // base units, decimal string
})
export type SplitLeg = z.infer<typeof SplitLegSchema>

export const RelaySplitTransferSchema = z.object({
  chainId: z.number().int().positive(),
  token: Address, // G$ token = EIP-712 verifyingContract
  owner: Address, // the payer (permit signer)
  spender: Address, // the relayer named in the permit
  value: Uint, // permitted SUM = Σ legs[].value (base units)
  deadline: z.number().int().positive(), // unix seconds
  signature: HexSig, // the single 65-byte EIP-2612 signature over the sum
  legs: z.array(SplitLegSchema).min(1).max(MAX_SPLIT_RECIPIENTS),
  intentHash: Sha256Hex.optional(),
  memo: z.string().max(120).optional(),
})
export type RelaySplitTransfer = z.infer<typeof RelaySplitTransferSchema>

export const SplitLegResultSchema = z.object({
  recipient: Address,
  value: Uint,
  ok: z.boolean(),
  txHash: TxHash.optional(),
  error: z.string().optional(),
})
export type SplitLegResult = z.infer<typeof SplitLegResultSchema>

export const RelaySplitResultSchema = z.object({
  ok: z.boolean(), // true only when every leg settled
  partial: z.boolean().optional(), // some legs settled, some didn't (see note in relayer)
  permitTxHash: TxHash.optional(),
  legs: z.array(SplitLegResultSchema).optional(),
  feeCurrency: Address.optional(),
  gasUsed: Uint.optional(),
  error: z.string().optional(),
})
export type RelaySplitResult = z.infer<typeof RelaySplitResultSchema>
