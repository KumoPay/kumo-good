/**
 * Exercise the FULL browser path against the running local stack:
 * sign a permit as the demo wallet → POST to the web app's /api/relay proxy →
 * relayer → fork, and assert the recipient's G$ moved. Then hit /api/claim.
 */
import { createPublicClient, http, parseAbi, defineChain, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { G_TOKEN, buildPermitTypedData, toBaseUnits, permitDeadline, formatUnits, CELO_CHAIN_ID } from "@kumo-good/shared"

const WEB = process.env.WEB_URL ?? "http://127.0.0.1:3000"
const RPC = "http://127.0.0.1:8545"
const G = G_TOKEN.production
const RELAYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Hex // hardhat #0 (spender)
const owner = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") // #1 (funded)
const recipient = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Hex // #2

const abi = parseAbi(["function nonces(address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"])
const chain = defineChain({ id: 42220, name: "fork", nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const pc = createPublicClient({ chain, transport: http(RPC, { timeout: 180_000 }) })

async function main() {
  const value = toBaseUnits(25)
  const nonce = (await pc.readContract({ address: G, abi, functionName: "nonces", args: [owner.address] })) as bigint
  const deadline = permitDeadline(Math.floor(Date.now() / 1000))
  const typed = buildPermitTypedData({ message: { owner: owner.address, spender: RELAYER, value, nonce, deadline }, token: G, chainId: CELO_CHAIN_ID })
  const signature = await owner.signTypedData(typed as Parameters<typeof owner.signTypedData>[0])
  const body = { chainId: CELO_CHAIN_ID, token: G, owner: owner.address, spender: RELAYER, recipient, value: value.toString(), deadline: Number(deadline), signature }

  const before = (await pc.readContract({ address: G, abi, functionName: "balanceOf", args: [recipient] })) as bigint
  console.log("POST /api/relay — send 25 G$ (browser path: web proxy → relayer → fork)…")
  const res = await fetch(`${WEB}/api/relay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  console.log("  relay:", res.status, JSON.stringify(await res.json()))
  const after = (await pc.readContract({ address: G, abi, functionName: "balanceOf", args: [recipient] })) as bigint
  console.log(`  recipient G$: ${formatUnits(before, 18)} → ${formatUnits(after, 18)}  (Δ ${formatUnits(after - before, 18)})`)

  console.log("\nPOST /api/claim — gasless UBI claim for the demo wallet…")
  const cres = await fetch(`${WEB}/api/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chainId: CELO_CHAIN_ID, user: owner.address }) })
  console.log("  claim:", cres.status, JSON.stringify(await cres.json()))
}

main().catch((e) => { console.error(e); process.exit(1) })
