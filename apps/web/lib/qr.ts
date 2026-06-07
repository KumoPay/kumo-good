"use client"
import QRCode from "qrcode"

// QR generation (for request-money) + scanning (for pay-by-QR). Scanning uses the
// native BarcodeDetector (Android Chrome / our target) with a graceful "paste"
// fallback elsewhere — no scanner dependency.

export async function toQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 320, color: { dark: "#0B0E14", light: "#FFC24B" } })
}

type BarcodeDetectorLike = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
type BarcodeCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

export function barcodeScanSupported(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window
}

export type ScanHandle = { stop: () => void }

/** Start the rear camera and call onResult with the first decoded QR text. */
export async function startScan(
  video: HTMLVideoElement,
  onResult: (text: string) => void,
  onError: (msg: string) => void,
): Promise<ScanHandle> {
  let stopped = false
  let stream: MediaStream | null = null
  let raf = 0
  const stop = () => {
    stopped = true
    if (raf) cancelAnimationFrame(raf)
    stream?.getTracks().forEach((t) => t.stop())
  }
  try {
    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeCtor }).BarcodeDetector
    if (!Ctor) {
      onError("camera scanning not supported here — paste the link instead")
      return { stop }
    }
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    video.srcObject = stream
    await video.play()
    const detector = new Ctor({ formats: ["qr_code"] })
    let last = 0
    const tick = async (t: number) => {
      if (stopped) return
      if (t - last > 250 && video.readyState >= 2) {
        last = t
        try {
          const codes = await detector.detect(video)
          if (codes[0]?.rawValue) {
            stop()
            onResult(codes[0].rawValue)
            return
          }
        } catch {
          /* transient detect error — keep scanning */
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  } catch (e) {
    onError((e as Error).message || "camera unavailable")
  }
  return { stop }
}
