"use client"
import { CUSD, type Hex } from "@kumo-good/shared"
import { publicClient } from "./chain"
import { G_TOKEN_ADDR } from "./config"
import { gTokenAbi } from "./abi"

export type TokenBalance = {
  symbol: string
  name: string
  balance: bigint
  decimals: number
}

/** The wallet's Celo holdings shown on Home. G$ is the star; CELO is the native
 *  gas token; cUSD is what the relayer pays gas in. All three are 18-decimals. */
export async function getPortfolio(owner: Hex): Promise<TokenBalance[]> {
  // Promise.all: if the RPC is unreachable (offline) the whole read rejects and
  // the caller keeps the last-known portfolio instead of zeroing it out.
  const [gd, celo, cusd] = await Promise.all([
    publicClient.readContract({ address: G_TOKEN_ADDR, abi: gTokenAbi, functionName: "balanceOf", args: [owner] }) as Promise<bigint>,
    publicClient.getBalance({ address: owner }), // native CELO
    publicClient.readContract({ address: CUSD, abi: gTokenAbi, functionName: "balanceOf", args: [owner] }) as Promise<bigint>,
  ])
  return [
    { symbol: "G$", name: "GoodDollar", balance: gd, decimals: 18 },
    { symbol: "CELO", name: "Celo", balance: celo, decimals: 18 },
    { symbol: "cUSD", name: "Celo Dollar", balance: cusd, decimals: 18 },
  ]
}
