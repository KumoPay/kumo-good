"use client"
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts"
import type { Hex } from "@kumo-good/shared"

// Non-custodial in-browser burner wallet. The key lives only in this browser's
// localStorage — the same trust model as the mobile app's SecureStore key, but
// for the web. Demo-grade: clearly labelled, exportable, resettable.

const KEY = "kumo-good.wallet.pk.v1"

export function hasWallet(): boolean {
  return typeof localStorage !== "undefined" && !!localStorage.getItem(KEY)
}

export function loadKey(): Hex | null {
  if (typeof localStorage === "undefined") return null
  return localStorage.getItem(KEY) as Hex | null
}

export function createWallet(): Hex {
  const pk = generatePrivateKey()
  localStorage.setItem(KEY, pk)
  return pk
}

export function importWallet(pk: string): Hex {
  const norm = (pk.startsWith("0x") ? pk : `0x${pk}`).toLowerCase() as Hex
  if (!/^0x[0-9a-f]{64}$/.test(norm)) throw new Error("invalid private key")
  privateKeyToAccount(norm) // throws if malformed
  localStorage.setItem(KEY, norm)
  return norm
}

export function clearWallet() {
  localStorage.removeItem(KEY)
}

export function getAccount(): PrivateKeyAccount | null {
  const pk = loadKey()
  return pk ? privateKeyToAccount(pk) : null
}

export function getAddress(): Hex | null {
  return getAccount()?.address ?? null
}
