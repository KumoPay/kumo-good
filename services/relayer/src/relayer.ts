import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  type Account,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import {
  RelayPermitTransferSchema,
  RelaySplitTransferSchema,
  type RelayResult,
  type RelaySplitResult,
  type SplitLegResult,
} from "@kumo-good/shared"
import { erc2612Abi } from "./abi.js"
import { feeFields } from "./celo-gas.js"
import { config as defaultConfig, type RelayerConfig } from "./config.js"

export type Relayer = {
  publicClient: PublicClient
  walletClient?: WalletClient
  account?: Account
  address?: Hex
  dryRun: boolean
  config: RelayerConfig
}

/** Build a relayer from config. With no RELAYER_PK it runs in dry-run mode (simulate only). */
export function createRelayer(cfg: RelayerConfig = defaultConfig): Relayer {
  const publicClient = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpcUrl) })
  if (!cfg.relayerPk) return { publicClient, dryRun: true, config: cfg }
  const account = privateKeyToAccount(cfg.relayerPk)
  const walletClient = createWalletClient({ account, chain: cfg.chain, transport: http(cfg.rpcUrl) })
  return { publicClient, walletClient, account, address: account.address, dryRun: false, config: cfg }
}

function splitSig(sig: Hex): { v: number; r: Hex; s: Hex } {
  return {
    r: `0x${sig.slice(2, 66)}` as Hex,
    s: `0x${sig.slice(66, 130)}` as Hex,
    v: parseInt(sig.slice(130, 132), 16),
  }
}

function shortErr(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.split("\n")[0].slice(0, 240)
}

// In-flight de-dup. A single signed permit (owner+signature) must never be
// settled by two concurrent requests: between the allowance read and the
// transferFrom legs, a second runner could see allowance already set and replay
// legs against the same allowance → double-pay. Node is single-threaded, so a
// Set check-then-add before any await is atomic and serializes per permit.
const inFlight = new Set<string>()
function permitKey(owner: string, signature: string): string {
  return `${owner.toLowerCase()}:${signature.toLowerCase()}`
}

/**
 * Settle an offline-signed G$ payment: apply the EIP-2612 permit (if not already
 * applied) granting the relayer an allowance, then transferFrom owner → recipient.
 * Two sequential txs from the relayer EOA; safe because the permit's spender is
 * the relayer, so no one else can spend the granted allowance.
 */
export async function settlePermitTransfer(relayer: Relayer, raw: unknown): Promise<RelayResult> {
  const parsed = RelayPermitTransferSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: `invalid request: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` }
  }
  const req = parsed.data
  const { publicClient, config: cfg } = relayer

  if (req.chainId !== cfg.chainId) return { ok: false, error: `chainId mismatch: request ${req.chainId} vs relayer ${cfg.chainId}` }
  if (getAddress(req.token) !== getAddress(cfg.gToken)) return { ok: false, error: `unexpected token ${req.token} (relayer settles ${cfg.gToken})` }

  const now = Math.floor(Date.now() / 1000)
  if (req.deadline <= now) return { ok: false, error: `permit expired (deadline ${req.deadline} ≤ now ${now}) — re-sign required` }

  const owner = getAddress(req.owner)
  const spender = getAddress(req.spender)
  const recipient = getAddress(req.recipient)
  const value = BigInt(req.value)
  const { v, r, s } = splitSig(req.signature as Hex)

  if (relayer.address && getAddress(relayer.address) !== spender) {
    return { ok: false, error: `permit spender ${spender} is not this relayer ${relayer.address}` }
  }
  const caller = relayer.address ?? spender

  const key = permitKey(owner, req.signature)
  if (inFlight.has(key)) return { ok: false, error: "a settlement for this permit is already in progress" }
  inFlight.add(key)
  try {
    const [allowance, balance] = (await Promise.all([
      publicClient.readContract({ address: cfg.gToken, abi: erc2612Abi, functionName: "allowance", args: [owner, spender] }),
      publicClient.readContract({ address: cfg.gToken, abi: erc2612Abi, functionName: "balanceOf", args: [owner] }),
    ])) as [bigint, bigint]

    if (balance < value) return { ok: false, error: `insufficient G$: owner has ${balance}, needs ${value}` }
    const needPermit = allowance < value

    // --- dry-run: simulate only -----------------------------------------------
    if (relayer.dryRun || !relayer.walletClient || !relayer.account) {
      try {
        if (needPermit) {
          await publicClient.simulateContract({
            address: cfg.gToken, abi: erc2612Abi, functionName: "permit",
            args: [owner, spender, value, BigInt(req.deadline), v, r, s], account: caller,
          })
        } else {
          await publicClient.simulateContract({
            address: cfg.gToken, abi: erc2612Abi, functionName: "transferFrom",
            args: [owner, recipient, value], account: caller,
          })
        }
        return { ok: true, error: "dry-run: simulated only (set RELAYER_PK to submit)", feeCurrency: cfg.feeCurrency }
      } catch (e) {
        return { ok: false, error: `dry-run simulation failed: ${shortErr(e)}` }
      }
    }

    // --- live submit ----------------------------------------------------------
    const wallet = relayer.walletClient
    const account = relayer.account
    try {
      const fee = await feeFields(publicClient, cfg.feeCurrency)
      if (needPermit) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const permitHash = await wallet.writeContract({
          address: cfg.gToken, abi: erc2612Abi, functionName: "permit",
          args: [owner, spender, value, BigInt(req.deadline), v, r, s],
          account, chain: cfg.chain, ...fee,
        } as any)
        const rcpt = await publicClient.waitForTransactionReceipt({ hash: permitHash })
        if (rcpt.status !== "success") return { ok: false, error: `permit tx reverted (${permitHash})` }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txHash = await wallet.writeContract({
        address: cfg.gToken, abi: erc2612Abi, functionName: "transferFrom",
        args: [owner, recipient, value],
        account, chain: cfg.chain, ...fee,
      } as any)
      const rcpt2 = await publicClient.waitForTransactionReceipt({ hash: txHash })
      if (rcpt2.status !== "success") return { ok: false, error: `transferFrom tx reverted (${txHash})` }
      return { ok: true, txHash, feeCurrency: cfg.feeCurrency, gasUsed: rcpt2.gasUsed.toString() }
    } catch (e) {
      return { ok: false, error: shortErr(e) }
    }
  } finally {
    inFlight.delete(key)
  }
}

/**
 * Settle a Claim-and-Split: ONE offline-signed permit authorises the relayer for
 * a SUM; we apply it once (if needed), then transferFrom owner → each recipient
 * for that recipient's leg. The legs must sum EXACTLY to the permitted value, so
 * no leg can over-spend and the whole allowance is consumed.
 *
 * Double-pay safety has two layers:
 *   1. Concurrency: an in-flight lock keyed by (owner, signature) serialises two
 *      requests bearing the SAME permit, so they can't both read the allowance
 *      and replay the legs against it. This is the real guard.
 *   2. Sequential retry: after the legs run the permit nonce is consumed, so a
 *      later whole-retry's `permit()` reverts before any leg runs.
 * Pre-checks (balance ≥ sum, allowance == sum after permit, EOA recipients) make
 * a mid-way leg revert practically impossible; if one *does* fail after others
 * succeeded we return `partial: true` with per-leg results. A partial does NOT
 * auto-complete — the consumed nonce blocks the remaining legs — so the caller
 * surfaces it and the user re-creates a split for the unpaid remainder rather
 * than reusing this (now spent) signature.
 */
export async function settleSplitTransfer(relayer: Relayer, raw: unknown): Promise<RelaySplitResult> {
  const parsed = RelaySplitTransferSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: `invalid request: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` }
  }
  const req = parsed.data
  const { publicClient, config: cfg } = relayer

  if (req.chainId !== cfg.chainId) return { ok: false, error: `chainId mismatch: request ${req.chainId} vs relayer ${cfg.chainId}` }
  if (getAddress(req.token) !== getAddress(cfg.gToken)) return { ok: false, error: `unexpected token ${req.token} (relayer settles ${cfg.gToken})` }

  const now = Math.floor(Date.now() / 1000)
  if (req.deadline <= now) return { ok: false, error: `permit expired (deadline ${req.deadline} ≤ now ${now}) — re-sign required` }

  const owner = getAddress(req.owner)
  const spender = getAddress(req.spender)
  const value = BigInt(req.value)
  const { v, r, s } = splitSig(req.signature as Hex)

  // Legs: every leg positive, and Σ legs === permitted value (no over-spend, no dust).
  const legs = req.legs.map((l) => ({ recipient: getAddress(l.recipient), value: BigInt(l.value) }))
  if (legs.some((l) => l.value <= 0n)) return { ok: false, error: "every split leg must be > 0" }
  const legSum = legs.reduce((a, l) => a + l.value, 0n)
  if (legSum !== value) return { ok: false, error: `split legs sum ${legSum} ≠ permitted value ${value} — re-sign required` }

  if (relayer.address && getAddress(relayer.address) !== spender) {
    return { ok: false, error: `permit spender ${spender} is not this relayer ${relayer.address}` }
  }
  const caller = relayer.address ?? spender

  const key = permitKey(owner, req.signature)
  if (inFlight.has(key)) return { ok: false, error: "a settlement for this permit is already in progress" }
  inFlight.add(key)
  try {
    const [allowance, balance] = (await Promise.all([
      publicClient.readContract({ address: cfg.gToken, abi: erc2612Abi, functionName: "allowance", args: [owner, spender] }),
      publicClient.readContract({ address: cfg.gToken, abi: erc2612Abi, functionName: "balanceOf", args: [owner] }),
    ])) as [bigint, bigint]

    if (balance < value) return { ok: false, error: `insufficient G$: owner has ${balance}, needs ${value}` }
    const needPermit = allowance < value

    // --- dry-run: simulate only -----------------------------------------------
    if (relayer.dryRun || !relayer.walletClient || !relayer.account) {
      try {
        if (needPermit) {
          await publicClient.simulateContract({
            address: cfg.gToken, abi: erc2612Abi, functionName: "permit",
            args: [owner, spender, value, BigInt(req.deadline), v, r, s], account: caller,
          })
        } else {
          // Representative leg — simulate doesn't mutate state, so one proves the path.
          await publicClient.simulateContract({
            address: cfg.gToken, abi: erc2612Abi, functionName: "transferFrom",
            args: [owner, legs[0].recipient, legs[0].value], account: caller,
          })
        }
        return {
          ok: true,
          error: "dry-run: simulated only (set RELAYER_PK to submit)",
          feeCurrency: cfg.feeCurrency,
          legs: legs.map((l) => ({ recipient: l.recipient, value: l.value.toString(), ok: true })),
        }
      } catch (e) {
        return { ok: false, error: `dry-run simulation failed: ${shortErr(e)}` }
      }
    }

    // --- live submit ----------------------------------------------------------
    const wallet = relayer.walletClient
    const account = relayer.account
    let permitTxHash: Hex | undefined
    try {
      const fee = await feeFields(publicClient, cfg.feeCurrency)
      if (needPermit) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        permitTxHash = (await wallet.writeContract({
          address: cfg.gToken, abi: erc2612Abi, functionName: "permit",
          args: [owner, spender, value, BigInt(req.deadline), v, r, s],
          account, chain: cfg.chain, ...fee,
        } as any)) as Hex
        const rcpt = await publicClient.waitForTransactionReceipt({ hash: permitTxHash })
        if (rcpt.status !== "success") return { ok: false, error: `permit tx reverted (${permitTxHash})`, permitTxHash }
      }

      const results: SplitLegResult[] = []
      let gasUsed = 0n
      for (const leg of legs) {
        let legTx: Hex | undefined
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          legTx = (await wallet.writeContract({
            address: cfg.gToken, abi: erc2612Abi, functionName: "transferFrom",
            args: [owner, leg.recipient, leg.value],
            account, chain: cfg.chain, ...fee,
          } as any)) as Hex
          const rcpt = await publicClient.waitForTransactionReceipt({ hash: legTx })
          if (rcpt.status === "success") {
            gasUsed += rcpt.gasUsed
            results.push({ recipient: leg.recipient, value: leg.value.toString(), ok: true, txHash: legTx })
          } else {
            results.push({ recipient: leg.recipient, value: leg.value.toString(), ok: false, txHash: legTx, error: "transferFrom reverted" })
          }
        } catch (e) {
          // If the tx was already broadcast it may yet mine — surface its hash so the
          // caller never treats a possibly-paid leg as cleanly unpaid (no blind re-pay).
          results.push({
            recipient: leg.recipient,
            value: leg.value.toString(),
            ok: false,
            ...(legTx ? { txHash: legTx } : {}),
            error: legTx ? `broadcast but unconfirmed: ${shortErr(e)}` : shortErr(e),
          })
        }
      }

      const allOk = results.every((x) => x.ok)
      const anyOk = results.some((x) => x.ok)
      return {
        ok: allOk,
        ...(allOk ? {} : { partial: anyOk }),
        ...(permitTxHash ? { permitTxHash } : {}),
        legs: results,
        feeCurrency: cfg.feeCurrency,
        gasUsed: gasUsed.toString(),
      }
    } catch (e) {
      return { ok: false, error: shortErr(e), ...(permitTxHash ? { permitTxHash } : {}) }
    }
  } finally {
    inFlight.delete(key)
  }
}
