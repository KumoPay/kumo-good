"use client"
import {
  buildPermitTypedData,
  permitDeadline,
  toBaseUnits,
  hashIntent,
  hashSplit,
  splitEvenly,
  type PaymentIntent,
  type SplitIntent,
  type QueuedPayment,
  type QueuedClaim,
  type QueuedSplit,
  type RelayPermitTransfer,
  type RelaySplitTransfer,
  type RelayResult,
  type RelaySplitResult,
  type RelayClaimResult,
  type Hex,
} from "@kumo-good/shared"
import { CHAIN_ID, G_TOKEN_ADDR, RELAY_ENDPOINT } from "./config"
import { getAccount } from "./wallet"
import { getNonce } from "./gd"
import { readQueue } from "./queue"

export type RelayerInfo = {
  relayerAddress: Hex | null
  chainId: number
  gToken: Hex
  feeCurrency: string
  dryRun: boolean
}

const RELAYER_KEY = "kumo-good.relayer.v1"
const NONCE_KEY = "kumo-good.nonce.v1"

export function getCachedRelayer(): RelayerInfo | null {
  try {
    const r = localStorage.getItem(RELAYER_KEY)
    return r ? (JSON.parse(r) as RelayerInfo) : null
  } catch {
    return null
  }
}

/** Fetch relayer config from the same-origin proxy and cache it (for offline signing). */
export async function fetchRelayerInfo(): Promise<RelayerInfo | null> {
  try {
    const r = await fetch(RELAY_ENDPOINT, { method: "GET", cache: "no-store" })
    if (!r.ok) return getCachedRelayer()
    const info = (await r.json()) as RelayerInfo
    if (info?.relayerAddress) localStorage.setItem(RELAYER_KEY, JSON.stringify(info))
    return info
  } catch {
    return getCachedRelayer()
  }
}

export function getCachedNonce(owner: Hex): bigint {
  try {
    const r = JSON.parse(localStorage.getItem(NONCE_KEY) ?? "null")
    if (r && String(r.owner).toLowerCase() === owner.toLowerCase()) return BigInt(r.nonce)
  } catch {
    /* ignore */
  }
  return 0n
}

export async function refreshNonce(owner: Hex): Promise<bigint> {
  try {
    const n = await getNonce(owner)
    localStorage.setItem(NONCE_KEY, JSON.stringify({ owner, nonce: n.toString() }))
    return n
  } catch {
    return getCachedNonce(owner)
  }
}

/**
 * How many queued/in-flight items still hold an unspent permit nonce. Each
 * payment/split signs exactly one permit (one nonce); claims sign none. A new
 * permit must skip past every not-yet-settled permit — including one mid-flight
 * (`settling`) — so it never reuses a nonce that is about to be consumed.
 * (`failed` is excluded: such a permit may or may not have been mined, so the
 * on-chain nonce refresh on reconnect is the source of truth for those.)
 */
function queuedPermitOffset(): bigint {
  return BigInt(
    readQueue().filter((e) => (e.kind === "payment" || e.kind === "split") && (e.status === "queued" || e.status === "settling")).length,
  )
}

/** Pick the nonce for a fresh permit: live when online, cached when offline, offset by queued permits. */
async function nextPermitNonce(owner: Hex): Promise<bigint> {
  const base = typeof navigator !== "undefined" && navigator.onLine ? await refreshNonce(owner) : getCachedNonce(owner)
  return base + queuedPermitOffset()
}

/** Build, EIP-712-sign (offline-capable) and return a queued G$ payment entry. */
export async function buildSignedPayment(intent: PaymentIntent, recipient: Hex): Promise<QueuedPayment> {
  const account = getAccount()
  if (!account) throw new Error("no wallet in this browser")
  const spender = getCachedRelayer()?.relayerAddress
  if (!spender) throw new Error("relayer not set up — connect once while the relayer is running")

  const owner = account.address
  const value = toBaseUnits(intent.amount)
  const nonce = await nextPermitNonce(owner)
  const deadline = permitDeadline(Math.floor(Date.now() / 1000))

  const typed = buildPermitTypedData({ message: { owner, spender, value, nonce, deadline }, token: G_TOKEN_ADDR, chainId: CHAIN_ID })
  const signature = await account.signTypedData(typed as Parameters<typeof account.signTypedData>[0])
  const intentHash = await hashIntent(intent)

  const relay: RelayPermitTransfer = {
    chainId: CHAIN_ID,
    token: G_TOKEN_ADDR,
    owner,
    spender,
    recipient,
    value: value.toString(),
    deadline: Number(deadline),
    signature,
    intentHash,
    ...(intent.memo ? { memo: intent.memo } : {}),
  }
  const now = Math.floor(Date.now() / 1000)
  return { kind: "payment", id: crypto.randomUUID(), intent, intentHash, relay, status: "queued", createdAt: now, updatedAt: now }
}

/**
 * Build, EIP-712-sign (offline-capable) and return a queued Claim-and-Split.
 * ONE permit authorises the SUM; `recipients` are resolved 0x addresses (same
 * order as `split.recipients`). The per-leg base-unit values are split evenly
 * and sum EXACTLY to the permitted total.
 */
export async function buildSignedSplit(split: SplitIntent, recipients: Hex[]): Promise<QueuedSplit> {
  const account = getAccount()
  if (!account) throw new Error("no wallet in this browser")
  const spender = getCachedRelayer()?.relayerAddress
  if (!spender) throw new Error("relayer not set up — connect once while the relayer is running")
  if (recipients.length !== split.recipients.length) throw new Error("recipient count mismatch")

  const owner = account.address
  const value = toBaseUnits(split.total)
  const legValues = splitEvenly(value, recipients.length)
  const legs = recipients.map((recipient, i) => ({ recipient, value: legValues[i].toString() }))

  const nonce = await nextPermitNonce(owner)
  const deadline = permitDeadline(Math.floor(Date.now() / 1000))
  const typed = buildPermitTypedData({ message: { owner, spender, value, nonce, deadline }, token: G_TOKEN_ADDR, chainId: CHAIN_ID })
  const signature = await account.signTypedData(typed as Parameters<typeof account.signTypedData>[0])
  const intentHash = await hashSplit(split)

  const relay: RelaySplitTransfer = {
    chainId: CHAIN_ID,
    token: G_TOKEN_ADDR,
    owner,
    spender,
    value: value.toString(),
    deadline: Number(deadline),
    signature,
    legs,
    intentHash,
    ...(split.memo ? { memo: split.memo } : {}),
  }
  const now = Math.floor(Date.now() / 1000)
  return { kind: "split", id: crypto.randomUUID(), split, intentHash, relay, status: "queued", createdAt: now, updatedAt: now }
}

/** Build a queued UBI claim entry (settled gaslessly via the relayer on flush). */
export function buildClaimEntry(owner: Hex, claimDay?: number): QueuedClaim {
  const now = Math.floor(Date.now() / 1000)
  return { kind: "claim", id: crypto.randomUUID(), owner, ...(claimDay != null ? { claimDay } : {}), status: "queued", createdAt: now, updatedAt: now }
}

/** Ask the relayer to settle a signed permit. */
export async function settle(relay: RelayPermitTransfer): Promise<RelayResult> {
  try {
    const r = await fetch(RELAY_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(relay),
    })
    return (await r.json()) as RelayResult
  } catch (e) {
    return { ok: false, error: `relayer unreachable: ${(e as Error).message}` }
  }
}

/** Ask the relayer to settle a Claim-and-Split (one permit → N transferFrom legs). */
export async function settleSplit(relay: RelaySplitTransfer): Promise<RelaySplitResult> {
  try {
    const r = await fetch("/api/relay-split", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(relay),
    })
    return (await r.json()) as RelaySplitResult
  } catch (e) {
    return { ok: false, error: `relayer unreachable: ${(e as Error).message}` }
  }
}

/** Ask the relayer to claim UBI for a user (gasless; may return selfClaim=true). */
export async function settleClaim(user: Hex): Promise<RelayClaimResult> {
  try {
    const r = await fetch("/api/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId: CHAIN_ID, user }),
    })
    return (await r.json()) as RelayClaimResult
  } catch (e) {
    return { ok: false, error: `relayer unreachable: ${(e as Error).message}` }
  }
}
