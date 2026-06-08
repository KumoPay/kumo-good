"use client"
// Passkey-secured wallet: the EOA private key is encrypted at rest with a secret
// derived from a platform passkey via the WebAuthn PRF extension. Unlocking
// requires the device biometric (Face ID / fingerprint). The raw key is never
// stored in plaintext when this path is used.
//
// Fallback: if the browser/authenticator doesn't support PRF, enroll() returns
// false and the caller keeps the plain-localStorage burner (still on-device).
import type { Hex } from "@kumo-good/shared"

const ENC_KEY = "kumo-good.wallet.enc.v1"
const RP_NAME = "Kumo"

type EncBlob = { credentialId: string; salt: string; iv: string; ct: string; address: Hex }

// --- base64url <-> bytes ---------------------------------------------------
function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
function unb64url(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/")
  while (s.length % 4) s += "="
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function randomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return a
}

export function passkeySupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials?.create
}
export function hasEncryptedWallet(): boolean {
  try {
    return !!localStorage.getItem(ENC_KEY)
  } catch {
    return false
  }
}
export function encryptedAddress(): Hex | null {
  try {
    const raw = localStorage.getItem(ENC_KEY)
    return raw ? (JSON.parse(raw) as EncBlob).address : null
  } catch {
    return null
  }
}
export function clearEncryptedWallet(): void {
  try {
    localStorage.removeItem(ENC_KEY)
  } catch {
    /* ignore */
  }
}

async function aesKeyFromPrf(prf: ArrayBuffer): Promise<CryptoKey> {
  // PRF output is 32 high-entropy bytes → use directly as an AES-GCM-256 key.
  return crypto.subtle.importKey("raw", prf, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

/** Run a WebAuthn assertion that evaluates the PRF at `salt`; returns the secret. */
async function evalPrf(credentialId: Uint8Array | null, salt: Uint8Array): Promise<ArrayBuffer | null> {
  const publicKey = {
    challenge: randomBytes(32) as BufferSource,
    userVerification: "required",
    ...(credentialId ? { allowCredentials: [{ id: credentialId as BufferSource, type: "public-key" as const }] } : {}),
    // PRF isn't in the TS DOM types yet — cast through unknown.
    extensions: { prf: { eval: { first: salt } } } as unknown as AuthenticationExtensionsClientInputs,
  } as PublicKeyCredentialRequestOptions
  const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null
  if (!assertion) return null
  const ext = assertion.getClientExtensionResults() as unknown as { prf?: { results?: { first?: ArrayBuffer } } }
  return ext.prf?.results?.first ?? null
}

/**
 * Register a platform passkey (Face ID / fingerprint) and store the EOA key
 * encrypted under its PRF secret. Returns true on success, false if PRF isn't
 * available (caller falls back to a plain burner).
 */
export async function enrollPasskey(privateKey: Hex, address: Hex): Promise<boolean> {
  if (!passkeySupported()) return false
  let cred: PublicKeyCredential | null
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32) as BufferSource,
        rp: { name: RP_NAME, id: location.hostname },
        user: { id: randomBytes(16) as BufferSource, name: `kumo-${address.slice(0, 10)}`, displayName: "Kumo wallet" },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        extensions: { prf: {} } as unknown as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null
  } catch {
    return false // user cancelled or no platform authenticator
  }
  if (!cred) return false
  const enabled = (cred.getClientExtensionResults() as unknown as { prf?: { enabled?: boolean } }).prf?.enabled
  if (!enabled) return false // authenticator can't do PRF → fall back

  const salt = randomBytes(32)
  const prf = await evalPrf(new Uint8Array(cred.rawId), salt)
  if (!prf) return false

  const key = await aesKeyFromPrf(prf)
  const iv = randomBytes(12)
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(privateKey) as BufferSource)
  const blob: EncBlob = { credentialId: b64url(cred.rawId), salt: b64url(salt), iv: b64url(iv), ct: b64url(ct), address }
  localStorage.setItem(ENC_KEY, JSON.stringify(blob))
  return true
}

/** Prompt Face ID / fingerprint, decrypt, and return the EOA private key. Throws on failure. */
export async function unlockWithPasskey(): Promise<Hex> {
  const raw = localStorage.getItem(ENC_KEY)
  if (!raw) throw new Error("no passkey wallet on this device")
  const blob = JSON.parse(raw) as EncBlob
  const prf = await evalPrf(unb64url(blob.credentialId), unb64url(blob.salt))
  if (!prf) throw new Error("biometric unlock failed — try again")
  const key = await aesKeyFromPrf(prf)
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64url(blob.iv) as BufferSource }, key, unb64url(blob.ct) as BufferSource)
  return new TextDecoder().decode(pt) as Hex
}
