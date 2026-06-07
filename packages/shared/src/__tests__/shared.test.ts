import { describe, it, expect } from "vitest"
import {
  toBaseUnits,
  fromBaseUnits,
  formatUnits,
  parseIntentRegex,
  parseCommand,
  parseSplit,
  splitEvenly,
  hashSplit,
  hashIntent,
  buildPermitTypedData,
  permitDeadline,
  flowRatePerSecond,
  buildIntentPayload,
  parseIntentPayload,
  buildPaymentRequest,
  parsePaymentRequest,
  isStreamIntent,
  expiresInLabel,
  MAX_SPLIT_RECIPIENTS,
  G_TOKEN,
  G_DECIMALS,
  CELO_CHAIN_ID,
} from "../index"

describe("units", () => {
  it("converts whole and fractional G$ to 18-dec base units", () => {
    expect(toBaseUnits(50)).toBe(50n * 10n ** 18n)
    expect(toBaseUnits(12.5)).toBe(12_500_000_000_000_000_000n)
    expect(toBaseUnits(0.000000000000000001)).toBe(1n)
  })
  it("round-trips through fromBaseUnits for display", () => {
    expect(fromBaseUnits(toBaseUnits(50))).toBe(50)
    expect(fromBaseUnits(toBaseUnits(12.5))).toBe(12.5)
  })
  it("formats trimmed", () => {
    expect(formatUnits(toBaseUnits(50))).toBe("50")
    expect(formatUnits(toBaseUnits(12.5))).toBe("12.5")
    expect(formatUnits(toBaseUnits(12.345), 18, 2)).toBe("12.34")
  })
  it("rejects negative amounts", () => {
    expect(() => toBaseUnits(-1)).toThrow()
  })
})

describe("regex parser", () => {
  it("parses a simple send", () => {
    expect(parseIntentRegex("send Maria 50 G dollars")).toMatchObject({ recipient: "Maria", amount: 50 })
  })
  it("captures a memo", () => {
    expect(parseIntentRegex("pay 12.5 to bob for groceries")).toMatchObject({
      recipient: "bob",
      amount: 12.5,
      memo: "groceries",
    })
  })
  it("recognises a 0x recipient", () => {
    const r = parseIntentRegex("send 100 G$ to 0x1111111111111111111111111111111111111111")
    expect(r?.recipient).toBe("0x1111111111111111111111111111111111111111")
    expect(r?.amount).toBe(100)
  })
  it("detects a monthly stream period", () => {
    const r = parseIntentRegex("stream 30 G dollars a month to mom")
    expect(r?.period).toBe("month")
    expect(r?.amount).toBe(30)
    expect(isStreamIntent(r!)).toBe(true)
  })
  it("returns null on unmatchable input", () => {
    expect(parseIntentRegex("hello there")).toBeNull()
    expect(parseIntentRegex("")).toBeNull()
  })
})

describe("parseCommand (multi-verb)", () => {
  it("parses a single send", () => {
    const a = parseCommand("send 5 to 0x1111111111111111111111111111111111111111")
    expect(a.map((x) => x.type)).toEqual(["send"])
  })
  it("parses claim + send as an ordered plan", () => {
    const a = parseCommand("claim my UBI and send 5 to mom")
    expect(a.map((x) => x.type)).toEqual(["claim", "send"])
    const send = a.find((x) => x.type === "send")
    expect(send && send.type === "send" && send.intent.amount).toBe(5)
  })
  it("parses a bare claim", () => {
    expect(parseCommand("claim my daily money").map((x) => x.type)).toEqual(["claim"])
  })
  it("does not split a memo containing 'and'", () => {
    const a = parseCommand("send 3 to 0x2222222222222222222222222222222222222222 for tea and bread")
    const send = a.find((x) => x.type === "send")
    expect(send && send.type === "send" && send.intent.memo).toBe("tea and bread")
  })
  it("recognises a balance query", () => {
    expect(parseCommand("what's my balance").map((x) => x.type)).toEqual(["balance"])
  })
})

describe("parseSplit", () => {
  it("parses 'split N between A, B and C'", () => {
    const s = parseSplit("split 30 between Ama, Kofi and Esi")
    expect(s).toMatchObject({ total: 30, recipients: ["Ama", "Kofi", "Esi"] })
  })
  it("handles 'among' and 'g$' currency", () => {
    const s = parseSplit("split 12 g$ among alice and bob")
    expect(s).toMatchObject({ total: 12, recipients: ["alice", "bob"] })
  })
  it("parses 0x addresses in the list without eating digits as the amount", () => {
    const s = parseSplit("split 9 between 0x1111111111111111111111111111111111111111 and 0x2222222222222222222222222222222222222222")
    expect(s?.total).toBe(9)
    expect(s?.recipients).toEqual([
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
    ])
  })
  it("captures a memo and keeps it out of the recipient list", () => {
    const s = parseSplit("split 10 between mom and dad for dinner")
    expect(s).toMatchObject({ total: 10, recipients: ["mom", "dad"], memo: "dinner" })
  })
  it("returns null for a single recipient or non-split text", () => {
    expect(parseSplit("split 10 between alice")).toBeNull()
    expect(parseSplit("send 5 to bob")).toBeNull()
    expect(parseSplit("")).toBeNull()
  })
  it("rejects more than MAX_SPLIT_RECIPIENTS recipients", () => {
    const many = Array.from({ length: MAX_SPLIT_RECIPIENTS + 1 }, (_, i) => `p${i}`).join(", ")
    expect(parseSplit(`split 100 between ${many}`)).toBeNull()
  })
  it("reads grouped-thousands amounts correctly (not silently truncated)", () => {
    expect(parseSplit("split 1,000 between alice and bob")?.total).toBe(1000)
    expect(parseSplit("split 12,5 between alice and bob")?.total).toBe(12.5) // european decimal
  })
  it("keeps a recipient literally named like a currency word", () => {
    expect(parseSplit("split 30 between G and Bob")?.recipients).toEqual(["G", "Bob"])
    expect(parseSplit("split 12 between gd and dollars")?.recipients).toEqual(["gd", "dollars"])
  })
})

describe("splitEvenly", () => {
  it("divides evenly when divisible", () => {
    expect(splitEvenly(toBaseUnits(30), 3)).toEqual([toBaseUnits(10), toBaseUnits(10), toBaseUnits(10)])
  })
  it("always sums EXACTLY to the total, remainder to earliest legs", () => {
    const total = toBaseUnits(10) // 1e19, not divisible by 3
    const parts = splitEvenly(total, 3)
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(total)
    expect(parts[0] - parts[2]).toBe(1n) // first leg carries the +1 wei remainder
  })
  it("rejects non-positive totals or counts", () => {
    expect(() => splitEvenly(0n, 3)).toThrow()
    expect(() => splitEvenly(toBaseUnits(1), 0)).toThrow()
  })
})

describe("parseCommand (split)", () => {
  it("recognises a standalone split", () => {
    const a = parseCommand("split 30 between Ama, Kofi and Esi")
    expect(a.map((x) => x.type)).toEqual(["split"])
    const sp = a.find((x) => x.type === "split")
    expect(sp && sp.type === "split" && sp.split.recipients.length).toBe(3)
  })
  it("parses 'claim my UBI and split …' as claim + split", () => {
    const a = parseCommand("claim my UBI and split 20 between alice and bob")
    expect(a.map((x) => x.type)).toEqual(["claim", "split"])
  })
  it("does NOT turn an unparseable split into a send to a recipient named 'split'", () => {
    // "split N for <names>" has no connector → unparseable; must not become a send.
    expect(parseCommand("split 30 for ama and kofi")).toEqual([])
  })
  it("does not mis-trigger split when 'split' only appears in a memo", () => {
    const a = parseCommand("send 5 to 0x1111111111111111111111111111111111111111 for the split")
    expect(a.map((x) => x.type)).toEqual(["send"])
  })
})

describe("hashSplit", () => {
  it("is deterministic and changes with the recipient set", async () => {
    const a = await hashSplit({ total: 30, recipients: ["a", "b", "c"] })
    const b = await hashSplit({ total: 30, recipients: ["a", "b", "c"] })
    const c = await hashSplit({ total: 30, recipients: ["a", "b"] })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("payment request (QR/link)", () => {
  it("round-trips and extracts from a URL", () => {
    const uri = buildPaymentRequest({ to: "0x3333333333333333333333333333333333333333", amount: 30, label: "Tea Stall", memo: "chai" })
    expect(uri.startsWith("kumo-good:pay:v1:")).toBe(true)
    const back = parsePaymentRequest(`https://kumo.app/?r=${uri}&x=1`)
    expect(back.to).toBe("0x3333333333333333333333333333333333333333")
    expect(back.amount).toBe(30)
    expect(back.label).toBe("Tea Stall")
  })
  it("rejects non-requests", () => {
    expect(() => parsePaymentRequest("hello")).toThrow()
  })
})

describe("hashIntent", () => {
  it("is deterministic and order-independent of optional fields", async () => {
    const a = await hashIntent({ recipient: "bob", amount: 5 })
    const b = await hashIntent({ amount: 5, recipient: "bob" } as any)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
  it("changes when the amount changes", async () => {
    const a = await hashIntent({ recipient: "bob", amount: 5 })
    const b = await hashIntent({ recipient: "bob", amount: 6 })
    expect(a).not.toBe(b)
  })
})

describe("permit typed data", () => {
  it("builds the G$ EIP-712 domain and Permit types", () => {
    const td = buildPermitTypedData({
      message: {
        owner: "0x1111111111111111111111111111111111111111",
        spender: "0x2222222222222222222222222222222222222222",
        value: toBaseUnits(50),
        nonce: 0n,
        deadline: permitDeadline(1_700_000_000),
      },
    })
    expect(td.domain).toEqual({
      name: "GoodDollar",
      version: "1",
      chainId: CELO_CHAIN_ID,
      verifyingContract: G_TOKEN.production,
    })
    expect(td.primaryType).toBe("Permit")
    expect(td.types.Permit.map((f) => f.name)).toEqual(["owner", "spender", "value", "nonce", "deadline"])
  })
})

describe("streaming", () => {
  it("computes a positive int96 flow rate", () => {
    const rate = flowRatePerSecond(30, "month")
    expect(rate).toBe(toBaseUnits(30) / 2_592_000n)
    expect(rate > 0n).toBe(true)
  })
  it("throws when the rate rounds to zero", () => {
    expect(() => flowRatePerSecond(0.000000000000000001, "month")).toThrow()
  })
})

describe("intent payload round-trip", () => {
  it("encodes and decodes a signed permit payload", () => {
    const permit = {
      token: G_TOKEN.production,
      owner: "0x1111111111111111111111111111111111111111" as const,
      spender: "0x2222222222222222222222222222222222222222" as const,
      value: toBaseUnits(50).toString(),
      nonce: "0",
      deadline: 1_700_000_000,
      chainId: CELO_CHAIN_ID,
    }
    const uri = buildIntentPayload(
      {
        intent: { recipient: "Maria", amount: 50 },
        intentHash: "a".repeat(64),
        permit,
        recipient: "0x3333333333333333333333333333333333333333",
        signature: "0x" + "b".repeat(130),
        createdAt: 1_700_000_000,
      },
      { address: "0x1111111111111111111111111111111111111111", label: "me" },
    )
    expect(uri.startsWith("kumo-good:intent:v1:")).toBe(true)
    const back = parseIntentPayload(uri)
    expect(back.intent.amount).toBe(50)
    expect(back.permit.value).toBe(toBaseUnits(50).toString())
    expect(back.recipient).toBe("0x3333333333333333333333333333333333333333")
  })
  it("rejects a non-payload string", () => {
    expect(() => parseIntentPayload("not-a-payload")).toThrow()
  })
})

describe("queue helpers", () => {
  it("formats an expiry label", () => {
    const now = 1_700_000_000
    expect(expiresInLabel(now + 14 * 86_400, now)).toBe("expires in 14 days")
    expect(expiresInLabel(now + 3 * 3_600, now)).toBe("expires in 3 hours")
    expect(expiresInLabel(now - 1, now)).toBe("expired")
  })
})

void G_DECIMALS
