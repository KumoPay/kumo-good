/**
 * Full Milestone-1 proof on a local Celo fork: fund a demo owner with REAL G$
 * (by impersonating the UBIScheme whale), have the owner sign an EIP-2612 permit
 * offline, then have a relayer submit permit() + transferFrom() — and assert the
 * recipient's G$ balance actually increased. Real contract, real token movement,
 * zero real money.
 *
 * Run a fork first:  pnpm --filter devnet fork
 * Then:              pnpm --filter devnet verify
 */
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, defineChain, type Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { G_TOKEN, buildPermitTypedData, toBaseUnits, permitDeadline, formatUnits } from "@kumo-good/shared"

const RPC = process.env.FORK_URL ?? "http://127.0.0.1:8545"
const G = G_TOKEN.production
const UBI_WHALE = "0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1" as Hex // holds ~92M G$

const abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function nonces(address) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function transferFrom(address from,address to,uint256 value) returns (bool)",
])

const chain = defineChain({
  id: 42220,
  name: "celo-fork",
  nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
})

// Forks lazily fetch every touched storage slot from the upstream RPC, so the
// first heavy tx is slow — give it generous timeouts.
const transport = http(RPC, { timeout: 180_000, retryCount: 1 })
const pc = createPublicClient({ chain, transport })
const waitOpts = { timeout: 180_000, pollingInterval: 1_000 } as const

function split(sig: Hex) {
  return { r: `0x${sig.slice(2, 66)}` as Hex, s: `0x${sig.slice(66, 130)}` as Hex, v: parseInt(sig.slice(130, 132), 16) }
}
const setBalance = (a: Hex, wei: bigint) => pc.request({ method: "hardhat_setBalance" as never, params: [a, `0x${wei.toString(16)}`] as never })
const impersonate = (a: Hex) => pc.request({ method: "hardhat_impersonateAccount" as never, params: [a] as never })
const stop = (a: Hex) => pc.request({ method: "hardhat_stopImpersonatingAccount" as never, params: [a] as never })

async function main() {
  const ok = (m: string) => console.log(`  \x1b[32m✓\x1b[0m ${m}`)
  console.log("\nkumo-good · full permit→transferFrom on a Celo fork\n")

  const owner = privateKeyToAccount(generatePrivateKey())
  const relayer = privateKeyToAccount(generatePrivateKey())
  const recipient = privateKeyToAccount(generatePrivateKey())

  // 1) Fund gas (native CELO) for the relayer + the impersonated whale.
  await setBalance(relayer.address, parseEther("10"))
  await setBalance(UBI_WHALE, parseEther("10"))
  ok("funded relayer + whale with CELO for gas")

  // 2) Give the owner REAL G$ by impersonating the UBIScheme whale.
  await impersonate(UBI_WHALE)
  const whale = createWalletClient({ account: UBI_WHALE, chain, transport })
  const seed = toBaseUnits(100)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const th = await whale.writeContract({ address: G, abi, functionName: "transfer", args: [owner.address, seed] } as any)
  await pc.waitForTransactionReceipt({ hash: th, ...waitOpts })
  await stop(UBI_WHALE)
  const ownerBal = (await pc.readContract({ address: G, abi, functionName: "balanceOf", args: [owner.address] })) as bigint
  ok(`owner funded with ${formatUnits(ownerBal, 18)} G$`)

  // 3) Owner signs an EIP-2612 permit OFFLINE (no gas, no broadcast).
  const value = toBaseUnits(25)
  const nonce = (await pc.readContract({ address: G, abi, functionName: "nonces", args: [owner.address] })) as bigint
  const deadline = permitDeadline(Math.floor(Date.now() / 1000))
  const typed = buildPermitTypedData({ message: { owner: owner.address, spender: relayer.address, value, nonce, deadline }, token: G, chainId: 42220 })
  const sig = await owner.signTypedData(typed as Parameters<typeof owner.signTypedData>[0])
  const { v, r, s } = split(sig)
  ok("owner signed permit offline (spender = relayer)")

  // 4) Relayer settles: permit() then transferFrom(). Gas paid in native CELO (fork).
  const rc = createWalletClient({ account: relayer, chain, transport })
  const before = (await pc.readContract({ address: G, abi, functionName: "balanceOf", args: [recipient.address] })) as bigint
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ph = await rc.writeContract({ address: G, abi, functionName: "permit", args: [owner.address, relayer.address, value, deadline, v, r, s] } as any)
  await pc.waitForTransactionReceipt({ hash: ph, ...waitOpts })
  ok("relayer submitted permit() — allowance granted")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tf = await rc.writeContract({ address: G, abi, functionName: "transferFrom", args: [owner.address, recipient.address, value] } as any)
  const rcpt = await pc.waitForTransactionReceipt({ hash: tf, ...waitOpts })
  ok(`relayer submitted transferFrom() — tx ${rcpt.status}`)

  const after = (await pc.readContract({ address: G, abi, functionName: "balanceOf", args: [recipient.address] })) as bigint
  const moved = after - before
  console.log("")
  if (moved > 0n) {
    const fee = value - moved
    console.log(`\x1b[32mPROVEN\x1b[0m — recipient received ${formatUnits(moved, 18)} G$ via offline permit → relayer settle.`)
    if (fee > 0n) console.log(`         (G$ took a ${formatUnits(fee, 18)} G$ transfer fee on the ${formatUnits(value, 18)} G$ sent)`)
    console.log("")
    process.exit(0)
  } else {
    console.log(`\x1b[31mFAILED\x1b[0m — expected up to ${formatUnits(value, 18)} G$, recipient gained ${formatUnits(moved, 18)}.\n`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error("fork verify error:", (e as Error).message)
  console.error("Is the fork running?  pnpm --filter devnet fork")
  process.exit(1)
})
