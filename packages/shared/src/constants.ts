// All Celo / GoodDollar on-chain constants for kumo-good, in one place so the
// mobile app, web companion and relayer never disagree.
//
// Verified during research (see ../../../README.md and kumo-app GOODDOLLAR_FIT.md).
// ⚠️  The G$ SuperToken reports decimals() === 18 ON-CHAIN even though some
//     GoodDollar docs say 2. Always use G_DECIMALS below; never hardcode 2.

export type Hex = `0x${string}`
export type GoodDollarEnv = "production" | "staging" | "development"

// --- Chain --------------------------------------------------------------------
export const CELO_CHAIN_ID = 42220 as const
export const CELO_RPC_URL = "https://forno.celo.org"
export const CELOSCAN_TX = (hash: string) => `https://celoscan.io/tx/${hash}`
export const CELOSCAN_ADDRESS = (addr: string) => `https://celoscan.io/address/${addr}`

// --- G$ token (Superfluid Pure SuperToken; ERC-20 + EIP-2612 compatible) ------
export const G_DECIMALS = 18 as const
export const G_TOKEN: Record<GoodDollarEnv, Hex> = {
  production: "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A",
  staging: "0x61FA0fB802fd8345C06da558240E0651886fec69",
  development: "0xFa51eFDc0910CCdA91732e6806912Fa12e2FD475",
}

// EIP-712 domain for the G$ EIP-2612 permit. verifyingContract = the token addr.
// Confirmed on-chain by matching DOMAIN_SEPARATOR() (see relayer validation).
export const G_PERMIT_DOMAIN = { name: "GoodDollar", version: "1" } as const

// --- Stablecoins usable as Celo fee currency ----------------------------------
// Gas is paid in one of these, NOT in G$ — G$ is not a registered fee currency
// (CGP-0085/0089 never shipped to mainnet). For cUSD the feeCurrency IS the
// token address (18 dec). For USDC the feeCurrency MUST be the adapter, not the
// 6-dec token, because Celo's gas math assumes 18 decimals.
export const CELO_NATIVE: Hex = "0x471EcE3750Da237f93B8E339c536989b8978a438"
export const CUSD: Hex = "0x765DE816845861e75A25fCA122bb6898B8B1282a"
export const USDC_TOKEN: Hex = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C"
export const USDC_FEE_ADAPTER: Hex = "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B"
export const FEE_CURRENCY_DIRECTORY: Hex = "0x15F344b9E6c3Cb6F0376A36A64928b13F62C6276"

// --- GoodDollar protocol contracts (Celo) -------------------------------------
export const IDENTITY: Record<"production" | "staging", Hex> = {
  production: "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42",
  staging: "0x0108BBc09772973aC27983Fc17c7D82D8e87ef4D",
}
export const UBI_SCHEME: Record<"production" | "staging", Hex> = {
  production: "0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1",
  staging: "0x2881d417dA066600372753E73A3570F0781f18cB",
}
export const FAUCET: Hex = "0x4F93Fa058b03953C851eFaA2e4FC5C34afDFAb84"
export const ENGAGEMENT_REWARDS: Record<"production" | "development", Hex> = {
  production: "0x25db74CF4E7BA120526fd87e159CF656d94bAE43",
  development: "0xb44fC3A592aDaA257AECe1Ae8956019EA53d0465",
}

// --- Superfluid (streaming) ---------------------------------------------------
// Canonical CFAv1Forwarder — same address on every EVM chain, including Celo.
export const CFA_V1_FORWARDER: Hex = "0xcfA132E353cB4E398080B9700609bb008eceB125"

/** Resolve every address that depends on the GoodDollar environment in one call. */
export function gdConfig(env: GoodDollarEnv = "production") {
  const identityEnv = env === "development" ? "staging" : env
  return {
    env,
    chainId: CELO_CHAIN_ID,
    rpcUrl: CELO_RPC_URL,
    gToken: G_TOKEN[env],
    identity: IDENTITY[identityEnv],
    ubiScheme: UBI_SCHEME[identityEnv],
    faucet: FAUCET,
    engagementRewards: env === "production" ? ENGAGEMENT_REWARDS.production : ENGAGEMENT_REWARDS.development,
    cfaForwarder: CFA_V1_FORWARDER,
    cusd: CUSD,
  }
}
