"use client"
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts"
import type { Hex } from "@kumo-good/shared"
import { passkeySupported, enrollPasskey, unlockWithPasskey, hasEncryptedWallet, encryptedAddress, clearEncryptedWallet } from "./passkey"

// Non-custodial in-browser wallet. Two storage modes:
//   • Passkey-secured: the key is encrypted at rest (see passkey.ts) and only
//     decrypted into memory after a Face ID / fingerprint unlock. Preferred.
//   • Plain burner: key in localStorage (fallback when passkeys/PRF aren't
//     available, or for an imported key). Same trust model as before.

const KEY = "kumo-good.wallet.pk.v1"

// Decrypted key for this session (passkey wallets). Never persisted in plaintext.
let session: PrivateKeyAccount | null = null

export function loadKey(): Hex | null {
  if (typeof localStorage === "undefined") return null
  return localStorage.getItem(KEY) as Hex | null
}

export function hasWallet(): boolean {
  return hasEncryptedWallet() || (typeof localStorage !== "undefined" && !!localStorage.getItem(KEY))
}

/** A passkey wallet exists but hasn't been unlocked this session → app should gate. */
export function isLocked(): boolean {
  return hasEncryptedWallet() && !session
}

/**
 * Create a wallet. Tries to secure it behind a platform passkey (Face ID /
 * fingerprint); falls back to a plain on-device burner if PRF isn't available.
 * Returns whether biometric security was enabled.
 */
export async function createWallet(): Promise<{ address: Hex; secured: boolean }> {
  const pk = generatePrivateKey()
  const account = privateKeyToAccount(pk)
  let secured = false
  if (passkeySupported()) {
    try {
      secured = await enrollPasskey(pk, account.address)
    } catch {
      secured = false
    }
  }
  if (secured) {
    localStorage.removeItem(KEY) // no plaintext key on disk
    session = account
  } else {
    localStorage.setItem(KEY, pk) // fallback burner
    session = account
  }
  return { address: account.address, secured }
}

/** Face ID / fingerprint → decrypt the key into memory for this session. */
export async function unlock(): Promise<Hex> {
  const pk = await unlockWithPasskey()
  session = privateKeyToAccount(pk)
  return session.address
}

export function importWallet(pk: string): Hex {
  const norm = (pk.startsWith("0x") ? pk : `0x${pk}`).toLowerCase() as Hex
  if (!/^0x[0-9a-f]{64}$/.test(norm)) throw new Error("invalid private key")
  const account = privateKeyToAccount(norm) // throws if malformed
  // Imported keys use the plain-burner path (no passkey re-enrollment).
  clearEncryptedWallet()
  localStorage.setItem(KEY, norm)
  session = account
  return norm
}

export function clearWallet() {
  localStorage.removeItem(KEY)
  clearEncryptedWallet()
  session = null
}

export function getAccount(): PrivateKeyAccount | null {
  if (session) return session
  const pk = loadKey() // plain-burner fallback
  return pk ? privateKeyToAccount(pk) : null
}

export function getAddress(): Hex | null {
  if (session) return session.address
  const enc = encryptedAddress() // public address is known even while locked
  if (enc) return enc
  const pk = loadKey()
  return pk ? privateKeyToAccount(pk).address : null
}

/** Reveal the raw private key — unlocks via passkey for encrypted wallets. */
export async function revealKey(): Promise<Hex | null> {
  if (hasEncryptedWallet()) return unlockWithPasskey()
  return loadKey()
}
