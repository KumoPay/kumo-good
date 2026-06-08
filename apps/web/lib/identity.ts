"use client"
import { createWalletClient, http, type Hex } from "viem"
import { getAccount } from "./wallet"
import { publicClient, chain } from "./chain"
import { RPC_URL, CHAIN_ID, GD_ENV } from "./config"

// In-app GoodDollar face verification. Uses @goodsdks/citizen-sdk's
// **IdentityCustodialSDK** — the custodial variant signs the FV identifier
// LOCALLY via the in-browser key's signMessage, instead of IdentitySDK.init()
// which does a personal_sign over the Celo RPC (forno) and throws for a burner.
// That produces a wallet-bound FV link to goodid.gooddollar.org; after one face
// scan GoodServer whitelists this exact address, so UBIScheme.claim() works.
// We import lazily (it pulls a CJS dep, lz-string) and fall back to the live
// GoodDollar app if anything goes wrong, so Verify always does something useful.

// GoodDollar's live identity / face-verification app (the SDK targets this too).
// The old goodapp.gooddollar.org host is dead — do not use it.
const FALLBACK_VERIFY_URL = "https://goodid.gooddollar.org"

export async function startFaceVerification(callbackUrl: string): Promise<{ ok: boolean; url: string; bound: boolean; error?: string }> {
  const account = getAccount()
  if (!account) return { ok: false, url: FALLBACK_VERIFY_URL, bound: false, error: "no wallet" }
  try {
    const mod = (await import("@goodsdks/citizen-sdk")) as unknown as {
      IdentityCustodialSDK: new (o: { account: Hex; publicClient: unknown; walletClient: unknown; env: string }) => {
        generateFVLink: (popup: boolean, cb: string, chainId: number) => Promise<string>
      }
    }
    const walletClient = createWalletClient({ account, chain, transport: http(RPC_URL) })
    // Custodial SDK: account is the address; it signs FV_IDENTIFIER locally.
    const sdk = new mod.IdentityCustodialSDK({ account: account.address, publicClient, walletClient, env: GD_ENV })
    const url = await sdk.generateFVLink(false, callbackUrl, CHAIN_ID)
    return { ok: true, url, bound: true }
  } catch (e) {
    // SDK unavailable / API drift — degrade gracefully to the GoodDollar app.
    return { ok: true, url: FALLBACK_VERIFY_URL, bound: false, error: (e as Error).message.split("\n")[0] }
  }
}

export type { Hex }
