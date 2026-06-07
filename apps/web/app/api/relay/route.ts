import { NextResponse } from "next/server"

// Same-origin proxy to the relayer service, so the browser never needs CORS and
// the relayer URL stays server-side. Set RELAYER_URL in the web app's env.
const RELAYER_URL = process.env.RELAYER_URL ?? "http://127.0.0.1:8787"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const r = await fetch(`${RELAYER_URL}/health`, { cache: "no-store" })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: `relayer unreachable: ${(e as Error).message}` }, { status: 502 })
  }
}

export async function POST(req: Request) {
  const body = await req.text()
  try {
    const r = await fetch(`${RELAYER_URL}/relay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: `relayer unreachable: ${(e as Error).message}` }, { status: 502 })
  }
}
