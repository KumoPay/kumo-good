// Base64 helpers that work in Node 20+ and the browser. Shared by the QR/transport
// payload encoders (intent-payload, payment-request).

type BufferLike = {
  from(data: string, encoding: "utf8" | "base64"): { toString(encoding: "utf8" | "base64"): string }
}
function bufferGlobal(): BufferLike | undefined {
  return (globalThis as { Buffer?: BufferLike }).Buffer
}

export function base64Encode(s: string): string {
  const B = bufferGlobal()
  if (B) return B.from(s, "utf8").toString("base64")
  return btoa(
    Array.from(new TextEncoder().encode(s))
      .map((b) => String.fromCharCode(b))
      .join(""),
  )
}

export function base64Decode(b64: string): string {
  const B = bufferGlobal()
  if (B) return B.from(b64, "base64").toString("utf8")
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}
