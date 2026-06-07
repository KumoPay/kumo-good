import { toBaseUnits } from "./units"
import { G_DECIMALS } from "./constants"

// Superfluid money-streaming helpers for G$ (a Pure SuperToken, so there is NO
// wrap/upgrade step — you stream native G$ directly). Flows are opened via the
// canonical CFAv1Forwarder (see CFA_V1_FORWARDER in constants).

export type StreamPeriod = "day" | "week" | "month"

const SECONDS_PER: Record<StreamPeriod, bigint> = {
  day: 86_400n,
  week: 604_800n,
  month: 2_592_000n, // 30 days, per GoodDollar's own streaming guide
}

/**
 * Convert a human "amount per period" into the int96 wei-per-second flow rate
 * Superfluid expects. Throws if the rate would round to 0 (too small) or
 * exceed int96 (too large).
 */
export function flowRatePerSecond(
  amountPerPeriod: number,
  period: StreamPeriod,
  decimals: number = G_DECIMALS,
): bigint {
  const total = toBaseUnits(amountPerPeriod, decimals)
  const rate = total / SECONDS_PER[period]
  if (rate <= 0n) throw new Error("flow rate rounds to 0 — increase the amount")
  const INT96_MAX = (1n << 95n) - 1n
  if (rate > INT96_MAX) throw new Error("flow rate exceeds int96 bounds")
  return rate
}

/** ABI fragment for the idempotent setFlowrate call (create-or-update-or-delete). */
export const CFA_FORWARDER_ABI = [
  {
    type: "function",
    name: "setFlowrate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "receiver", type: "address" },
      { name: "flowrate", type: "int96" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getFlowrate",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "sender", type: "address" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "", type: "int96" }],
  },
] as const
