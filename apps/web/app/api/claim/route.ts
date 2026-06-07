import { NextResponse } from "next/server"

// Same-origin proxy to the relayer's gasless UBI claim endpoint.
const RELAYER_URL = process.env.RELAYER_URL ?? "http://127.0.0.1:8787"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const body = await req.text()
  try {
    const r = await fetch(`${RELAYER_URL}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: `relayer unreachable: ${(e as Error).message}` }, { status: 502 })
  }
}
