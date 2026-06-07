/**
 * Milestone-1 gate (kumo-good): prove the LIVE G$ SuperToken accepts a
 * viem-signed EIP-2612 permit before we build the relayer on top of it.
 *
 * Runs READ-ONLY against Celo mainnet — no funds, no private key, no writes.
 * It:
 *   1. Reads name / symbol / decimals and asserts decimals === 18 (the trap).
 *   2. Recomputes the EIP-712 domain separator locally and asserts it equals
 *      the contract's on-chain DOMAIN_SEPARATOR() — proving our domain
 *      (name/version/chainId/verifyingContract) is exactly right. If it doesn't
 *      match, it brute-forces a small grid of name/version to discover the real
 *      domain and prints it.
 *   3. Generates a throwaway owner key, signs a real permit with viem, and
 *      simulates permit(...) against the live contract. A non-reverting
 *      simulation executes the SuperToken's real ecrecover + allowance path,
 *      proving the offline-signed permit is accepted.
 *
 * Usage: pnpm --filter relayer validate    (or: pnpm relayer:validate)
 */
import "dotenv/config"
import {
  createPublicClient,
  http,
  keccak256,
  toBytes,
  encodeAbiParameters,
  type Hex,
} from "viem"
import { celo } from "viem/chains"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import {
  G_TOKEN,
  G_PERMIT_DOMAIN,
  CELO_CHAIN_ID,
  CELO_RPC_URL,
  buildPermitTypedData,
  toBaseUnits,
  permitDeadline,
} from "@kumo-good/shared"
import { erc2612Abi } from "../src/abi.js"

const RPC = process.env.CELO_RPC_URL ?? CELO_RPC_URL
const TOKEN = (process.env.G_TOKEN ?? G_TOKEN.production) as Hex

const pc = createPublicClient({ chain: celo, transport: http(RPC) })

const DOMAIN_TYPEHASH = keccak256(
  toBytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
)

function computeDomainSeparator(name: string, version: string, chainId: number, verifyingContract: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [DOMAIN_TYPEHASH, keccak256(toBytes(name)), keccak256(toBytes(version)), BigInt(chainId), verifyingContract],
    ),
  )
}

function splitSig(sig: Hex): { v: number; r: Hex; s: Hex } {
  const r = `0x${sig.slice(2, 66)}` as Hex
  const s = `0x${sig.slice(66, 130)}` as Hex
  const v = parseInt(sig.slice(130, 132), 16)
  return { v, r, s }
}

async function main() {
  const ok = (msg: string) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`)
  const bad = (msg: string) => console.log(`  \x1b[31m✗\x1b[0m ${msg}`)
  let failures = 0

  console.log(`\nkumo-good · Milestone-1 permit validation`)
  console.log(`  RPC:   ${RPC}`)
  console.log(`  G$:    ${TOKEN}\n`)

  const chainId = await pc.getChainId()
  if (chainId === CELO_CHAIN_ID) ok(`connected to Celo (chainId ${chainId})`)
  else {
    bad(`unexpected chainId ${chainId} (wanted ${CELO_CHAIN_ID})`)
    failures++
  }

  const [name, symbol, decimals] = await Promise.all([
    pc.readContract({ address: TOKEN, abi: erc2612Abi, functionName: "name" }),
    pc.readContract({ address: TOKEN, abi: erc2612Abi, functionName: "symbol" }),
    pc.readContract({ address: TOKEN, abi: erc2612Abi, functionName: "decimals" }),
  ])
  ok(`token: ${name} (${symbol})`)
  if (Number(decimals) === 18) ok(`decimals() === 18 (confirmed — ignore docs that say 2)`)
  else {
    bad(`decimals() === ${decimals}, expected 18`)
    failures++
  }

  // --- EIP-712 domain proof ---------------------------------------------------
  const onchainDS = (await pc.readContract({
    address: TOKEN,
    abi: erc2612Abi,
    functionName: "DOMAIN_SEPARATOR",
  })) as Hex
  const computedDS = computeDomainSeparator(G_PERMIT_DOMAIN.name, G_PERMIT_DOMAIN.version, CELO_CHAIN_ID, TOKEN)

  if (computedDS.toLowerCase() === onchainDS.toLowerCase()) {
    ok(`DOMAIN_SEPARATOR matches our domain {name:"${G_PERMIT_DOMAIN.name}", version:"${G_PERMIT_DOMAIN.version}"}`)
  } else {
    bad(`DOMAIN_SEPARATOR mismatch — searching for the real domain…`)
    failures++
    const names = [name, "GoodDollar", "G$", "SuperGoodDollar"]
    const versions = ["1", "1.0", "2", "v1"]
    for (const n of names) {
      for (const v of versions) {
        if (computeDomainSeparator(n, v, CELO_CHAIN_ID, TOKEN).toLowerCase() === onchainDS.toLowerCase()) {
          console.log(`      → real domain is {name:"${n}", version:"${v}"} — update G_PERMIT_DOMAIN`)
        }
      }
    }
  }

  // --- live permit acceptance proof -------------------------------------------
  const owner = privateKeyToAccount(generatePrivateKey())
  const spender = "0x000000000000000000000000000000000000dEaD" as Hex // arbitrary relayer stand-in
  const value = toBaseUnits(1) // 1 G$
  const nonce = (await pc.readContract({
    address: TOKEN,
    abi: erc2612Abi,
    functionName: "nonces",
    args: [owner.address],
  })) as bigint
  ok(`nonces(freshOwner) === ${nonce}`)

  const deadline = permitDeadline(Math.floor(Date.now() / 1000))
  const typed = buildPermitTypedData({
    message: { owner: owner.address, spender, value, nonce, deadline },
    token: TOKEN,
    chainId: CELO_CHAIN_ID,
  })
  const sig = await owner.signTypedData(typed as Parameters<typeof owner.signTypedData>[0])
  const { v, r, s } = splitSig(sig)

  try {
    await pc.simulateContract({
      address: TOKEN,
      abi: erc2612Abi,
      functionName: "permit",
      args: [owner.address, spender, value, deadline, v, r, s],
      account: owner.address,
    })
    ok(`permit(...) simulated on live G$ — signature accepted, allowance path executes`)
    console.log(`      (would set allowance(${owner.address.slice(0, 10)}…, ${spender.slice(0, 10)}…) = ${value})`)
  } catch (e) {
    bad(`permit(...) simulation reverted: ${(e as Error).message.split("\n")[0]}`)
    failures++
  }

  console.log("")
  if (failures === 0) {
    console.log(`\x1b[32mGATE PASSED\x1b[0m — offline permit → relayer settle is viable on live G$.\n`)
    process.exit(0)
  } else {
    console.log(`\x1b[31mGATE FAILED\x1b[0m — ${failures} check(s) failed; see above before building the relayer.\n`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
