import "dotenv/config"
import { type Chain, defineChain } from "viem"
import { celo } from "viem/chains"
import {
  CELO_CHAIN_ID,
  CELO_RPC_URL,
  CUSD,
  G_TOKEN,
  gdConfig,
  type GoodDollarEnv,
  type Hex,
} from "@kumo-good/shared"

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

const GD_ENV = (env("GD_ENV") ?? "production") as GoodDollarEnv
const CHAIN_ID = Number(env("CHAIN_ID") ?? CELO_CHAIN_ID)
const RPC_URL = env("CELO_RPC_URL") ?? CELO_RPC_URL

// For a local fork we keep the Celo chain semantics but point at 127.0.0.1.
// On mainnet we use viem's `celo` chain so the feeCurrency (CIP-64) field works.
const chain: Chain =
  CHAIN_ID === CELO_CHAIN_ID
    ? { ...celo, rpcUrls: { default: { http: [RPC_URL] } } }
    : defineChain({
        id: CHAIN_ID,
        name: `celo-fork-${CHAIN_ID}`,
        nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
        rpcUrls: { default: { http: [RPC_URL] } },
      })

// Fee currency: "native" forces native CELO (needed on a fork — Hardhat won't
// honour CIP-64 fee abstraction); an address overrides; else cUSD on production
// mainnet, else native.
const isMainnet = CHAIN_ID === CELO_CHAIN_ID
const feeRaw = env("FEE_CURRENCY")
const feeCurrency = feeRaw === "native" ? undefined : ((feeRaw as Hex | undefined) ?? (isMainnet ? CUSD : undefined))

export const config = {
  gdEnv: GD_ENV,
  chainId: CHAIN_ID,
  rpcUrl: RPC_URL,
  chain,
  isMainnet,
  /** G$ token = the EIP-712 verifyingContract. */
  gToken: (env("G_TOKEN") as Hex | undefined) ?? G_TOKEN[GD_ENV],
  /** undefined ⇒ pay gas in native CELO (forks/dev). */
  feeCurrency,
  /** Relayer signer; undefined ⇒ dry-run mode (simulate only, never submit). */
  relayerPk: env("RELAYER_PK") as Hex | undefined,
  port: Number(env("PORT") ?? 8787),
  allowOrigin: env("ALLOW_ORIGIN") ?? "*",
  gd: gdConfig(GD_ENV),
}

export type RelayerConfig = typeof config
