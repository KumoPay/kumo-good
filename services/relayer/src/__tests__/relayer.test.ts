import { describe, it, expect } from "vitest"
import { G_TOKEN, CELO_CHAIN_ID, toBaseUnits, splitEvenly, type RelayPermitTransfer, type RelaySplitTransfer } from "@kumo-good/shared"
import { settlePermitTransfer, settleSplitTransfer, type Relayer } from "../relayer.js"

const OWNER = "0x1111111111111111111111111111111111111111"
const SPENDER = "0x2222222222222222222222222222222222222222"
const RECIPIENT = "0x3333333333333333333333333333333333333333"
const SIG = ("0x" + "ab".repeat(65)) as `0x${string}`

function validReq(over: Partial<RelayPermitTransfer> = {}): RelayPermitTransfer {
  return {
    chainId: CELO_CHAIN_ID,
    token: G_TOKEN.production,
    owner: OWNER,
    spender: SPENDER,
    recipient: RECIPIENT,
    value: toBaseUnits(10).toString(),
    deadline: Math.floor(Date.now() / 1000) + 3600,
    signature: SIG,
    ...over,
  }
}

/** A dry-run relayer with a stubbed public client so tests never touch the network. */
function fakeRelayer(stub: {
  allowance?: bigint
  balance?: bigint
  simulate?: (args: { functionName: string }) => Promise<unknown>
}): Relayer {
  const reads: Record<string, bigint> = {
    allowance: stub.allowance ?? 0n,
    balanceOf: stub.balance ?? toBaseUnits(1000),
  }
  return {
    dryRun: true,
    config: { chainId: CELO_CHAIN_ID, gToken: G_TOKEN.production, feeCurrency: undefined } as Relayer["config"],
    publicClient: {
      readContract: async ({ functionName }: { functionName: string }) => reads[functionName],
      simulateContract: stub.simulate ?? (async () => ({ request: {} })),
    } as unknown as Relayer["publicClient"],
  }
}

describe("settlePermitTransfer — validation", () => {
  it("rejects a malformed signature", async () => {
    const r = await settlePermitTransfer(fakeRelayer({}), validReq({ signature: "0xdead" as never }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/invalid request/i)
  })

  it("rejects a chainId mismatch", async () => {
    const r = await settlePermitTransfer(fakeRelayer({}), validReq({ chainId: 1 }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/chainId mismatch/i)
  })

  it("rejects the wrong token", async () => {
    const r = await settlePermitTransfer(fakeRelayer({}), validReq({ token: RECIPIENT }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/unexpected token/i)
  })

  it("rejects an expired permit", async () => {
    const r = await settlePermitTransfer(fakeRelayer({}), validReq({ deadline: Math.floor(Date.now() / 1000) - 1 }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/expired/i)
  })

  it("rejects insufficient balance", async () => {
    const r = await settlePermitTransfer(fakeRelayer({ balance: toBaseUnits(1) }), validReq({ value: toBaseUnits(10).toString() }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/insufficient/i)
  })
})

describe("settlePermitTransfer — dry-run", () => {
  it("simulates a permit when allowance is short, returns dry-run ok", async () => {
    let simulatedFn = ""
    const r = await settlePermitTransfer(
      fakeRelayer({
        allowance: 0n,
        balance: toBaseUnits(1000),
        simulate: async (args) => {
          simulatedFn = args.functionName
          return { request: {} }
        },
      }),
      validReq(),
    )
    expect(r.ok).toBe(true)
    expect(r.error).toMatch(/dry-run/i)
    expect(simulatedFn).toBe("permit")
  })

  it("simulates transferFrom when allowance already covers value", async () => {
    let simulatedFn = ""
    const r = await settlePermitTransfer(
      fakeRelayer({
        allowance: toBaseUnits(1000),
        balance: toBaseUnits(1000),
        simulate: async (args) => {
          simulatedFn = args.functionName
          return { request: {} }
        },
      }),
      validReq(),
    )
    expect(r.ok).toBe(true)
    expect(simulatedFn).toBe("transferFrom")
  })

  it("reports a simulation revert as failure", async () => {
    const r = await settlePermitTransfer(
      fakeRelayer({ simulate: async () => { throw new Error("INVALID_SIGNATURE") } }),
      validReq(),
    )
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/simulation failed/i)
  })
})

// --- Claim-and-Split ---------------------------------------------------------

function validSplitReq(over: Partial<RelaySplitTransfer> = {}): RelaySplitTransfer {
  const value = toBaseUnits(30)
  const legValues = splitEvenly(value, 3)
  return {
    chainId: CELO_CHAIN_ID,
    token: G_TOKEN.production,
    owner: OWNER,
    spender: SPENDER,
    value: value.toString(),
    deadline: Math.floor(Date.now() / 1000) + 3600,
    signature: SIG,
    legs: [
      { recipient: RECIPIENT, value: legValues[0].toString() },
      { recipient: "0x4444444444444444444444444444444444444444", value: legValues[1].toString() },
      { recipient: "0x5555555555555555555555555555555555555555", value: legValues[2].toString() },
    ],
    ...over,
  }
}

describe("settleSplitTransfer — validation", () => {
  it("rejects legs that don't sum to the permitted value", async () => {
    const bad = validSplitReq({
      legs: [
        { recipient: RECIPIENT, value: toBaseUnits(10).toString() },
        { recipient: "0x4444444444444444444444444444444444444444", value: toBaseUnits(10).toString() },
      ], // sums to 20, value is 30
    })
    const r = await settleSplitTransfer(fakeRelayer({}), bad)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/sum.*≠.*permitted value|re-sign/i)
  })

  it("rejects a non-positive leg", async () => {
    const r = await settleSplitTransfer(fakeRelayer({}), validSplitReq({
      legs: [
        { recipient: RECIPIENT, value: "0" },
        { recipient: "0x4444444444444444444444444444444444444444", value: toBaseUnits(30).toString() },
      ],
    }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/leg must be > 0/i)
  })

  it("rejects a chainId mismatch", async () => {
    const r = await settleSplitTransfer(fakeRelayer({}), validSplitReq({ chainId: 1 }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/chainId mismatch/i)
  })

  it("rejects insufficient balance for the sum", async () => {
    const r = await settleSplitTransfer(fakeRelayer({ balance: toBaseUnits(5) }), validSplitReq())
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/insufficient/i)
  })
})

describe("settleSplitTransfer — dry-run", () => {
  it("simulates a permit when allowance is short, returns a leg preview", async () => {
    let simulatedFn = ""
    const r = await settleSplitTransfer(
      fakeRelayer({ allowance: 0n, balance: toBaseUnits(1000), simulate: async (a) => { simulatedFn = a.functionName; return { request: {} } } }),
      validSplitReq(),
    )
    expect(r.ok).toBe(true)
    expect(simulatedFn).toBe("permit")
    expect(r.legs?.length).toBe(3)
    expect(r.legs?.every((l) => l.ok)).toBe(true)
  })

  it("simulates a transferFrom leg when allowance already covers the sum", async () => {
    let simulatedFn = ""
    const r = await settleSplitTransfer(
      fakeRelayer({ allowance: toBaseUnits(1000), balance: toBaseUnits(1000), simulate: async (a) => { simulatedFn = a.functionName; return { request: {} } } }),
      validSplitReq(),
    )
    expect(r.ok).toBe(true)
    expect(simulatedFn).toBe("transferFrom")
  })

  it("rejects a concurrent settle of the SAME permit (in-flight lock → no double-pay)", async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    const relayer = fakeRelayer({
      allowance: 0n,
      balance: toBaseUnits(1000),
      simulate: async () => { await gate; return { request: {} } }, // hold the first call open
    })
    const first = settleSplitTransfer(relayer, validSplitReq()) // acquires the lock, then awaits the gate
    const second = await settleSplitTransfer(relayer, validSplitReq()) // same owner+sig → blocked
    expect(second.ok).toBe(false)
    expect(second.error).toMatch(/already in progress/i)
    release()
    expect((await first).ok).toBe(true) // first completes and releases the lock
  })
})
