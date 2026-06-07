import { CELO_CHAIN_ID, CELO_RPC_URL, G_TOKEN, gdConfig, type GoodDollarEnv, type Hex } from "@kumo-good/shared"

// Client config (NEXT_PUBLIC_* is inlined at build time). The relayer URL stays
// server-side (see app/api/relay) — the browser only ever calls same-origin.
export const GD_ENV = (process.env.NEXT_PUBLIC_GD_ENV ?? "production") as GoodDollarEnv
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? CELO_CHAIN_ID)
export const RPC_URL = process.env.NEXT_PUBLIC_CELO_RPC_URL ?? CELO_RPC_URL
export const G_TOKEN_ADDR = (process.env.NEXT_PUBLIC_G_TOKEN ?? G_TOKEN[GD_ENV]) as Hex
export const RELAY_ENDPOINT = "/api/relay" // same-origin proxy to the relayer service
export const gd = gdConfig(GD_ENV)
export const IS_MAINNET = CHAIN_ID === CELO_CHAIN_ID
