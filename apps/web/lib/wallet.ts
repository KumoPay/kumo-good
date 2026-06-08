"use client"
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts"
import type { Hex } from "@kumo-good/shared"
import { passkeySupported, enrollPasskey, unlockWithPasskey, restoreWithPasskey, hasPasskeyWallet, passkeyAddress, clearPasskeyWallet } from "./passkey"

// Non-custodial in-browser wallet. Two storage modes:
//   • Passkey wallet: the key is DERIVED from the passkey's PRF (see passkey.ts),
//     never stored. Unlocked into memory after Face ID / fingerprint, and
//     recoverable on any device the passkey syncs to. Preferred.
//   • Plain burner: key in localStorage (fallback when passkeys/PRF aren't
//     available, or for an imported key).

const KEY = "kumo-good.wallet.pk.v1"

// Derived/loaded key for this session (passkey wallets). Never persisted.
let session: PrivateKeyAccount | null = null

export function loadKey(): Hex | null {
  if (typeof localStorage === "undefined") return null
  return localStorage.getItem(KEY) as Hex | null
}

export function hasWallet(): boolean {
  return hasPasskeyWallet() || (typeof localStorage !== "undefined" && !!localStorage.getItem(KEY))
}

/** Whether passkey recovery is possible in this browser (for the "Restore" option). */
export function canRestore(): boolean {
  return passkeySupported()
}

/** A passkey wallet exists on this device but isn't unlocked this session → gate the app. */
export function isLocked(): boolean {
  return hasPasskeyWallet() && !session
}

/**
 * Create a wallet. Tries to secure it behind a platform passkey (Face ID /
 * fingerprint) with the key DERIVED from the passkey (so it's recoverable);
 * falls back to a plain on-device burner if PRF isn't available.
 */
export async function createWallet(): Promise<{ address: Hex; secured: boolean }> {
  if (passkeySupported()) {
    try {
      const r = await enrollPasskey()
      if (r) {
        localStorage.removeItem(KEY) // no plaintext key on disk
        session = privateKeyToAccount(r.privateKey)
        return { address: r.address, secured: true }
      }
    } catch {
      /* fall through to plain burner */
    }
  }
  const pk = generatePrivateKey()
  localStorage.setItem(KEY, pk)
  session = privateKeyToAccount(pk)
  return { address: session.address, secured: false }
}

/** Face ID / fingerprint → re-derive the key into memory for this session (this device). */
export async function unlock(): Promise<Hex> {
  session = privateKeyToAccount(await unlockWithPasskey())
  return session.address
}

/** Restore a passkey wallet on a new device / after clearing storage. */
export async function restore(): Promise<Hex> {
  const r = await restoreWithPasskey()
  session = privateKeyToAccount(r.privateKey)
  return r.address
}

export function importWallet(pk: string): Hex {
  const norm = (pk.startsWith("0x") ? pk : `0x${pk}`).toLowerCase() as Hex
  if (!/^0x[0-9a-f]{64}$/.test(norm)) throw new Error("invalid private key")
  const account = privateKeyToAccount(norm) // throws if malformed
  // Imported keys use the plain-burner path (no passkey enrollment).
  clearPasskeyWallet()
  localStorage.setItem(KEY, norm)
  session = account
  return norm
}

export function clearWallet() {
  localStorage.removeItem(KEY)
  clearPasskeyWallet()
  session = null
}

export function getAccount(): PrivateKeyAccount | null {
  if (session) return session
  const pk = loadKey() // plain-burner fallback
  return pk ? privateKeyToAccount(pk) : null
}

export function getAddress(): Hex | null {
  if (session) return session.address
  const pa = passkeyAddress() // known even while locked (it's public)
  if (pa) return pa
  const pk = loadKey()
  return pk ? privateKeyToAccount(pk).address : null
}

/** Reveal the raw private key — re-derives via passkey for passkey wallets. */
export async function revealKey(): Promise<Hex | null> {
  if (hasPasskeyWallet()) return unlockWithPasskey()
  return loadKey()
}
