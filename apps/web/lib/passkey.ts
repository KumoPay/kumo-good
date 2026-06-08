"use client"
// Passkey-secured wallet WITH RECOVERY. The EOA key is DERIVED from the passkey's
// WebAuthn PRF secret (with a fixed app-wide salt) — it is never stored. Because
// platform passkeys sync across a user's devices (iCloud Keychain / Google
// Password Manager), the SAME passkey regenerates the SAME wallet on any device
// and after clearing storage. Unlock/restore requires the device biometric.
//
// Fallback: if the browser/authenticator can't do PRF, enroll() returns null and
// the caller keeps a plain-localStorage burner (still on-device).
import { privateKeyToAccount } from "viem/accounts"
import type { Hex } from "@kumo-good/shared"

// A per-device hint (which credential + the address). NOT the key — the key is
// re-derived from the passkey on demand.
const REC_KEY = "kumo-good.passkey.v1"
const RP_NAME = "Kumo"
// Constant salt: wallet key = PRF(passkey, PRF_SALT). Constant so the same synced
// passkey derives the same key everywhere — that is the recovery mechanism.
const PRF_SALT = new TextEncoder().encode("kumo-good/wallet-key/v1")

type Rec = { credentialId: string; address: Hex }

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

function readRec(): Rec | null {
  try {
    const raw = localStorage.getItem(REC_KEY)
    return raw ? (JSON.parse(raw) as Rec) : null
  } catch {
    return null
  }
}
export function hasPasskeyWallet(): boolean {
  return !!readRec()
}
export function passkeyAddress(): Hex | null {
  return readRec()?.address ?? null
}
export function clearPasskeyWallet(): void {
  try {
    localStorage.removeItem(REC_KEY)
  } catch {
    /* ignore */
  }
}

/** 32-byte PRF output → secp256k1 private key (overwhelmingly valid range). */
function keyFromPrf(prf: ArrayBuffer): Hex {
  const bytes = new Uint8Array(prf)
  let hex = "0x"
  for (const b of bytes) hex += b.toString(16).padStart(2, "0")
  return hex as Hex
}

/** WebAuthn assertion evaluating PRF at PRF_SALT; returns the secret + credential id. */
async function evalPrf(credentialId: Uint8Array | null): Promise<{ prf: ArrayBuffer; rawId: ArrayBuffer } | null> {
  const publicKey = {
    challenge: randomBytes(32) as BufferSource,
    userVerification: "required",
    ...(credentialId ? { allowCredentials: [{ id: credentialId as BufferSource, type: "public-key" as const }] } : {}),
    extensions: { prf: { eval: { first: PRF_SALT } } } as unknown as AuthenticationExtensionsClientInputs,
  } as PublicKeyCredentialRequestOptions
  const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null
  if (!assertion) return null
  const ext = assertion.getClientExtensionResults() as unknown as { prf?: { results?: { first?: ArrayBuffer } } }
  const first = ext.prf?.results?.first
  return first ? { prf: first, rawId: assertion.rawId } : null
}

/** Create a platform passkey and DERIVE the wallet key from its PRF. null if PRF unsupported. */
export async function enrollPasskey(): Promise<{ privateKey: Hex; address: Hex } | null> {
  if (!passkeySupported()) return null
  let cred: PublicKeyCredential | null
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32) as BufferSource,
        rp: { name: RP_NAME, id: location.hostname },
        user: { id: randomBytes(16) as BufferSource, name: "kumo-wallet", displayName: "Kumo wallet" },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        extensions: { prf: {} } as unknown as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null
  } catch {
    return null // cancelled or no platform authenticator
  }
  if (!cred) return null
  const enabled = (cred.getClientExtensionResults() as unknown as { prf?: { enabled?: boolean } }).prf?.enabled
  if (!enabled) return null // authenticator can't do PRF → fall back
  // Evaluate PRF via a follow-up get() (reliable across browsers).
  const got = await evalPrf(new Uint8Array(cred.rawId))
  if (!got) return null
  const privateKey = keyFromPrf(got.prf)
  const address = privateKeyToAccount(privateKey).address
  localStorage.setItem(REC_KEY, JSON.stringify({ credentialId: b64url(got.rawId), address } satisfies Rec))
  return { privateKey, address }
}

/** Unlock on THIS device (uses the saved credential hint). Returns the derived key. */
export async function unlockWithPasskey(): Promise<Hex> {
  const rec = readRec()
  const got = await evalPrf(rec ? unb64url(rec.credentialId) : null)
  if (!got) throw new Error("biometric unlock failed — try again")
  return keyFromPrf(got.prf)
}

/** Restore on a NEW device / after clearing storage: pick a synced passkey, derive the key, save the hint. */
export async function restoreWithPasskey(): Promise<{ privateKey: Hex; address: Hex }> {
  if (!passkeySupported()) throw new Error("passkeys aren't supported in this browser")
  const got = await evalPrf(null) // discoverable — the platform offers the user's synced passkeys
  if (!got) throw new Error("couldn't read the passkey — try again")
  const privateKey = keyFromPrf(got.prf)
  const address = privateKeyToAccount(privateKey).address
  localStorage.setItem(REC_KEY, JSON.stringify({ credentialId: b64url(got.rawId), address } satisfies Rec))
  return { privateKey, address }
}
