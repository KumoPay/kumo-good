import { getAddress, parseEther, type Hex } from "viem"
import { RelayClaimSchema, type RelayClaimResult } from "@kumo-good/shared"
import { ubiSchemeAbi } from "./abi.js"
import { feeFields } from "./celo-gas.js"
import { effectiveFeeCurrency, type Relayer } from "./relayer.js"

// Gasless UBI claim. Two strategies, tried in order:
//   1. claimFor(user) — works on a GoodCollective UBIPool; the relayer is the
//      sender and pays gas in cUSD. Truly gasless, no user signature.
//   2. gas-grant — classic UBIScheme.claim() is msg.sender-only, so the relayer
//      can't claim for the user. Instead it funds the user's gas (native CELO)
//      and the browser self-claims. Still gasless from the user's wallet's view.

const GAS_GRANT = parseEther("0.05")
const MIN_USER_BALANCE = parseEther("0.02")

function shortErr(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.split("\n")[0].slice(0, 200)
}

export async function settleClaim(relayer: Relayer, raw: unknown): Promise<RelayClaimResult> {
  const parsed = RelayClaimSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: `invalid request: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` }
  }
  const { chainId } = parsed.data
  const { publicClient, config: cfg } = relayer
  if (chainId !== cfg.chainId) return { ok: false, error: `chainId mismatch: request ${chainId} vs relayer ${cfg.chainId}` }

  const user = getAddress(parsed.data.user)
  const ubi = cfg.gd.ubiScheme

  const entitlement = (await publicClient.readContract({
    address: ubi, abi: ubiSchemeAbi, functionName: "checkEntitlement", args: [user],
  })) as bigint
  if (entitlement === 0n) {
    return { ok: false, error: "nothing to claim right now (already claimed today, or not entitled)" }
  }

  if (relayer.dryRun || !relayer.walletClient || !relayer.account) {
    return { ok: true, mode: "none", amount: entitlement.toString(), error: "dry-run: would claim", feeCurrency: cfg.feeCurrency }
  }
  const wallet = relayer.walletClient
  const account = relayer.account
  const feeCur = await effectiveFeeCurrency(relayer) // native fallback if relayer holds no cUSD

  // 1) claimFor (UBIPool) — relayer claims directly, gas paid by the relayer.
  try {
    await publicClient.simulateContract({ address: ubi, abi: ubiSchemeAbi, functionName: "claimFor", args: [user], account })
    const fee = await feeFields(publicClient, feeCur)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txHash = await wallet.writeContract({ address: ubi, abi: ubiSchemeAbi, functionName: "claimFor", args: [user], account, chain: cfg.chain, ...fee } as any)
    const rcpt = await publicClient.waitForTransactionReceipt({ hash: txHash })
    if (rcpt.status === "success") {
      return { ok: true, mode: "claimFor", txHash, amount: entitlement.toString(), feeCurrency: feeCur }
    }
  } catch {
    /* classic UBIScheme has no claimFor — fall through to gas-grant */
  }

  // 2) gas-grant — fund the user so the browser can self-claim.
  try {
    const bal = await publicClient.getBalance({ address: user })
    if (bal < MIN_USER_BALANCE) {
      const fee = await feeFields(publicClient, feeCur)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const grantTx = await wallet.sendTransaction({ account, chain: cfg.chain, to: user, value: GAS_GRANT, ...fee } as any)
      await publicClient.waitForTransactionReceipt({ hash: grantTx })
    }
    return { ok: true, mode: "gas-grant", selfClaim: true, amount: entitlement.toString(), feeCurrency: feeCur }
  } catch (e) {
    return { ok: false, error: shortErr(e) }
  }
}
