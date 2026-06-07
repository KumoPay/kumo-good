/**
 * Seed a demo wallet on the running fork with REAL G$ (by impersonating the
 * UBIScheme whale) so you can try the app for free. Defaults to Hardhat test
 * account #1, which already holds CELO for gas.
 *
 *   DEMO_ADDR=0x… DEMO_G=200 pnpm --filter devnet seed
 */
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, defineChain, type Hex } from "viem"
import { G_TOKEN, toBaseUnits, formatUnits } from "@kumo-good/shared"

const RPC = process.env.FORK_URL ?? "http://127.0.0.1:8545"
const DEMO = (process.env.DEMO_ADDR ?? "0x70997970C51812dc3A010C7d01b50e0d17dc79C8") as Hex // hardhat account #1
const AMOUNT = Number(process.env.DEMO_G ?? 200)
const G = G_TOKEN.production
const UBI_WHALE = "0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1" as Hex // ~92M G$

const abi = parseAbi(["function transfer(address to, uint256 value) returns (bool)", "function balanceOf(address) view returns (uint256)"])
const chain = defineChain({ id: 42220, name: "celo-fork", nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const transport = http(RPC, { timeout: 180_000 })
const pc = createPublicClient({ chain, transport })

const setBal = (a: Hex, wei: bigint) => pc.request({ method: "hardhat_setBalance" as never, params: [a, `0x${wei.toString(16)}`] as never })

async function main() {
  await setBal(UBI_WHALE, parseEther("10"))
  await setBal(DEMO, parseEther("10")) // ensure gas for self-claim too
  await pc.request({ method: "hardhat_impersonateAccount" as never, params: [UBI_WHALE] as never })
  const whale = createWalletClient({ account: UBI_WHALE, chain, transport })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = await whale.writeContract({ address: G, abi, functionName: "transfer", args: [DEMO, toBaseUnits(AMOUNT)] } as any)
  await pc.waitForTransactionReceipt({ hash: tx, timeout: 180_000 })
  await pc.request({ method: "hardhat_stopImpersonatingAccount" as never, params: [UBI_WHALE] as never })

  const bal = (await pc.readContract({ address: G, abi, functionName: "balanceOf", args: [DEMO] })) as bigint
  console.log(`\n✓ demo wallet ${DEMO}\n  holds ${formatUnits(bal, 18)} G$ + 10 CELO on the fork\n`)
}

main().catch((e) => {
  console.error("seed error:", (e as Error).message)
  process.exit(1)
})
