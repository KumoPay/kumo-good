import { createPublicClient, defineChain, http, type Chain } from "viem"
import { celo } from "viem/chains"
import { CHAIN_ID, RPC_URL } from "./config"

export const chain: Chain =
  CHAIN_ID === 42220
    ? { ...celo, rpcUrls: { default: { http: [RPC_URL] } } }
    : defineChain({
        id: CHAIN_ID,
        name: `celo-fork-${CHAIN_ID}`,
        nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
        rpcUrls: { default: { http: [RPC_URL] } },
      })

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL) })
