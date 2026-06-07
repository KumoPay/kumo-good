"use client"
import { createWalletClient, http, type Hex } from "viem"
import type { PrivateKeyAccount } from "viem/accounts"
import { publicClient, chain } from "./chain"
import { G_TOKEN_ADDR, gd, RPC_URL } from "./config"
import { gTokenAbi, identityAbi, ubiAbi } from "./abi"

export async function getBalance(owner: Hex): Promise<bigint> {
  return publicClient.readContract({ address: G_TOKEN_ADDR, abi: gTokenAbi, functionName: "balanceOf", args: [owner] }) as Promise<bigint>
}

export async function getNonce(owner: Hex): Promise<bigint> {
  return publicClient.readContract({ address: G_TOKEN_ADDR, abi: gTokenAbi, functionName: "nonces", args: [owner] }) as Promise<bigint>
}

export type IdentityStatus = { isWhitelisted: boolean; lastAuthenticated: bigint }

export async function getIdentity(owner: Hex): Promise<IdentityStatus> {
  const [isWhitelisted, lastAuthenticated] = (await Promise.all([
    publicClient.readContract({ address: gd.identity, abi: identityAbi, functionName: "isWhitelisted", args: [owner] }),
    publicClient.readContract({ address: gd.identity, abi: identityAbi, functionName: "lastAuthenticated", args: [owner] }),
  ])) as [boolean, bigint]
  return { isWhitelisted, lastAuthenticated }
}

export async function getUbiEntitlement(owner: Hex): Promise<bigint> {
  return publicClient.readContract({ address: gd.ubiScheme, abi: ubiAbi, functionName: "checkEntitlement", args: [owner] }) as Promise<bigint>
}

/** UBIScheme day counter — used for claim-streak tracking. */
export async function getCurrentDay(): Promise<number> {
  const d = (await publicClient.readContract({ address: gd.ubiScheme, abi: ubiAbi, functionName: "currentDay" })) as bigint
  return Number(d)
}

/** Attempt the daily UBI claim from the user's own wallet (needs a little CELO for gas). */
export async function claimUbi(account: PrivateKeyAccount): Promise<{ ok: boolean; txHash?: Hex; error?: string }> {
  try {
    const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txHash = await wallet.writeContract({ address: gd.ubiScheme, abi: ubiAbi, functionName: "claim", account, chain } as any)
    await publicClient.waitForTransactionReceipt({ hash: txHash })
    return { ok: true, txHash }
  } catch (e) {
    return { ok: false, error: (e as Error).message.split("\n")[0].slice(0, 200) }
  }
}

/** Where users complete GoodDollar face verification (no native/embeddable SDK path). */
export const VERIFY_URL = "https://goodapp.gooddollar.org"
