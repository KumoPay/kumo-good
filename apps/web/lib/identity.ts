"use client"
import { createWalletClient, http, type Hex } from "viem"
import { getAccount } from "./wallet"
import { publicClient, chain } from "./chain"
import { RPC_URL, CHAIN_ID, GD_ENV } from "./config"

// In-app GoodDollar face verification. Uses @goodsdks/citizen-sdk's IdentitySDK
// to generate a wallet-bound FV link that returns to this PWA. The SDK pulls a
// CJS dep (lz-string), so we import it lazily and fall back to an outbound link
// if anything goes wrong — the Verify button always does something useful.

const FALLBACK_VERIFY_URL = "https://goodapp.gooddollar.org"

export async function startFaceVerification(callbackUrl: string): Promise<{ ok: boolean; url: string; bound: boolean; error?: string }> {
  const account = getAccount()
  if (!account) return { ok: false, url: FALLBACK_VERIFY_URL, bound: false, error: "no wallet" }
  try {
    const mod = (await import("@goodsdks/citizen-sdk")) as unknown as {
      IdentitySDK: { init: (o: { publicClient: unknown; walletClient: unknown; env: string }) => Promise<{ generateFVLink: (popup: boolean, cb: string, chainId: number) => Promise<string> }> }
    }
    const walletClient = createWalletClient({ account, chain, transport: http(RPC_URL) })
    const sdk = await mod.IdentitySDK.init({ publicClient, walletClient, env: GD_ENV })
    const url = await sdk.generateFVLink(false, callbackUrl, CHAIN_ID)
    return { ok: true, url, bound: true }
  } catch (e) {
    // SDK unavailable / API drift — degrade gracefully to the GoodDollar app.
    return { ok: true, url: FALLBACK_VERIFY_URL, bound: false, error: (e as Error).message.split("\n")[0] }
  }
}

export type { Hex }
