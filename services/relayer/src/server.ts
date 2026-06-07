import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { config } from "./config.js"
import { createRelayer, settlePermitTransfer, settleSplitTransfer } from "./relayer.js"
import { settleClaim } from "./claim.js"

const relayer = createRelayer(config)

function cors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", config.allowOrigin)
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "content-type")
}

function json(res: ServerResponse, status: number, body: unknown) {
  cors(res)
  res.setHeader("content-type", "application/json")
  res.writeHead(status)
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on("data", (c: Buffer) => {
      size += c.length
      if (size > 64 * 1024) reject(new Error("payload too large"))
      else chunks.push(c)
    })
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {})
  const url = new URL(req.url ?? "/", `http://localhost:${config.port}`)

  // Liveness + config discovery (no secrets).
  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/")) {
    return json(res, 200, {
      ok: true,
      service: "kumo-good relayer",
      dryRun: relayer.dryRun,
      chainId: config.chainId,
      gToken: config.gToken,
      gdEnv: config.gdEnv,
      // The address clients must name as the permit `spender`.
      relayerAddress: relayer.address ?? null,
      feeCurrency: config.feeCurrency ?? "native CELO",
    })
  }

  if (req.method === "POST" && url.pathname === "/relay") {
    let body: unknown
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      return json(res, 400, { ok: false, error: "invalid JSON body" })
    }
    const result = await settlePermitTransfer(relayer, body)
    return json(res, result.ok ? 200 : 422, result)
  }

  // Claim-and-Split: one signed permit for a sum, fanned out to N recipients.
  if (req.method === "POST" && url.pathname === "/relay-split") {
    let body: unknown
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      return json(res, 400, { ok: false, error: "invalid JSON body" })
    }
    const result = await settleSplitTransfer(relayer, body)
    return json(res, result.ok ? 200 : 422, result)
  }

  if (req.method === "POST" && url.pathname === "/claim") {
    let body: unknown
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      return json(res, 400, { ok: false, error: "invalid JSON body" })
    }
    const result = await settleClaim(relayer, body)
    return json(res, result.ok ? 200 : 422, result)
  }

  return json(res, 404, { ok: false, error: "not found" })
})

server.listen(config.port, () => {
  console.log(`kumo-good relayer on :${config.port}`)
  console.log(`  chain ${config.chainId} · G$ ${config.gToken} · env ${config.gdEnv}`)
  console.log(`  mode: ${relayer.dryRun ? "DRY-RUN (no RELAYER_PK)" : `LIVE as ${relayer.address}`}`)
  console.log(`  gas paid in: ${config.feeCurrency ?? "native CELO"}`)
})
