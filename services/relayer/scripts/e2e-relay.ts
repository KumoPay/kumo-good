/**
 * End-to-end smoke test of the running relayer: sign a real EIP-2612 permit with
 * a fresh key and POST it to /relay. A fresh key holds 0 G$, so the relayer
 * should reject with "insufficient G$" — which proves the full path works
 * (HTTP → validate → read live on-chain balance). Point RELAYER_URL at a funded
 * owner scenario (fork/mainnet) to exercise the happy path.
 */
import { createPublicClient, http } from "viem"
import { celo } from "viem/chains"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import {
  G_TOKEN,
  CELO_CHAIN_ID,
  CELO_RPC_URL,
  buildPermitTypedData,
  toBaseUnits,
  permitDeadline,
} from "@kumo-good/shared"
import { erc2612Abi } from "../src/abi.js"

const url = process.env.RELAYER_URL ?? "http://127.0.0.1:8799/relay"
const token = G_TOKEN.production
const pc = createPublicClient({ chain: celo, transport: http(CELO_RPC_URL) })

const owner = privateKeyToAccount(generatePrivateKey())
const spender = "0x000000000000000000000000000000000000dEaD" as const
const recipient = "0x000000000000000000000000000000000000bEEF" as const
const value = toBaseUnits(1)

const nonce = (await pc.readContract({
  address: token, abi: erc2612Abi, functionName: "nonces", args: [owner.address],
})) as bigint
const deadline = permitDeadline(Math.floor(Date.now() / 1000))
const typed = buildPermitTypedData({ message: { owner: owner.address, spender, value, nonce, deadline }, token, chainId: CELO_CHAIN_ID })
const signature = await owner.signTypedData(typed as Parameters<typeof owner.signTypedData>[0])

const body = {
  chainId: CELO_CHAIN_ID, token, owner: owner.address, spender, recipient,
  value: value.toString(), deadline: Number(deadline), signature,
}
console.log(`POST ${url}  (owner ${owner.address})`)
const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
console.log(`HTTP ${res.status}`, await res.json())
