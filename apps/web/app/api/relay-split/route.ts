import { NextResponse } from "next/server"

// Same-origin proxy to the relayer's Claim-and-Split endpoint, so the browser
// never needs CORS and the relayer URL stays server-side.
const RELAYER_URL = process.env.RELAYER_URL ?? "http://127.0.0.1:8787"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// A split is permit + N sequential transferFrom legs (each with a receipt wait),
// so it needs well over the default 10s. 60s is the Vercel Hobby max; for very
// large splits move the web app to a Pro plan and raise this to 300.
export const maxDuration = 60

export async function POST(req: Request) {
  const body = await req.text()
  try {
    const r = await fetch(`${RELAYER_URL}/relay-split`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: `relayer unreachable: ${(e as Error).message}` }, { status: 502 })
  }
}
