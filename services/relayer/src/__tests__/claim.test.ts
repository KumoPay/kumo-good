import { describe, it, expect } from "vitest"
import { CELO_CHAIN_ID, toBaseUnits } from "@kumo-good/shared"
import { settleClaim } from "../claim.js"
import type { Relayer } from "../relayer.js"

const USER = "0x1111111111111111111111111111111111111111"

function fakeRelayer(entitlement: bigint): Relayer {
  return {
    dryRun: true,
    config: { chainId: CELO_CHAIN_ID, feeCurrency: undefined, gd: { ubiScheme: "0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1" } } as unknown as Relayer["config"],
    publicClient: {
      readContract: async () => entitlement,
    } as unknown as Relayer["publicClient"],
  }
}

describe("settleClaim", () => {
  it("rejects a bad address", async () => {
    const r = await settleClaim(fakeRelayer(toBaseUnits(100)), { chainId: CELO_CHAIN_ID, user: "nope" })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/invalid request/i)
  })

  it("rejects a chainId mismatch", async () => {
    const r = await settleClaim(fakeRelayer(toBaseUnits(100)), { chainId: 1, user: USER })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/chainId mismatch/i)
  })

  it("reports nothing to claim when entitlement is 0", async () => {
    const r = await settleClaim(fakeRelayer(0n), { chainId: CELO_CHAIN_ID, user: USER })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/nothing to claim/i)
  })

  it("returns a dry-run result with the entitlement when there is something to claim", async () => {
    const r = await settleClaim(fakeRelayer(toBaseUnits(127)), { chainId: CELO_CHAIN_ID, user: USER })
    expect(r.ok).toBe(true)
    expect(r.mode).toBe("none")
    expect(r.amount).toBe(toBaseUnits(127).toString())
  })
})
