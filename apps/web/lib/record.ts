"use client"
// Mic capture for offline STT. Records via MediaRecorder, then decodes + downmixes
// to mono and resamples to 16 kHz PCM — the format Whisper expects.

export type RecordHandle = {
  /** Stop recording and return 16 kHz mono PCM. */
  stop: () => Promise<Float32Array>
  /** Abort without transcribing; releases the mic. */
  cancel: () => void
}

export function micSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"
}

type ACtor = typeof AudioContext
function audioCtor(): ACtor {
  const w = window as unknown as { AudioContext?: ACtor; webkitAudioContext?: ACtor }
  const C = w.AudioContext ?? w.webkitAudioContext
  if (!C) throw new Error("Web Audio not supported")
  return C
}

async function blobToPcm16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer()
  const AC = audioCtor()
  const ctx = new AC()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(buf)
  } finally {
    void ctx.close()
  }
  // Downmix to mono + resample to 16 kHz by rendering through an OfflineAudioContext.
  const targetRate = 16000
  const frames = Math.max(1, Math.ceil(decoded.duration * targetRate))
  const offline = new OfflineAudioContext(1, frames, targetRate)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0)
}

/** Begin recording from the mic. Throws if permission is denied. */
export async function startRecording(): Promise<RecordHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const rec = new MediaRecorder(stream)
  const chunks: BlobPart[] = []
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }
  rec.start()
  const release = () => stream.getTracks().forEach((t) => t.stop())

  return {
    stop: () =>
      new Promise<Float32Array>((resolve, reject) => {
        rec.onstop = async () => {
          release()
          try {
            resolve(await blobToPcm16k(new Blob(chunks, { type: rec.mimeType || "audio/webm" })))
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)))
          }
        }
        try {
          rec.stop()
        } catch (e) {
          release()
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      }),
    cancel: () => {
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
      release()
    },
  }
}
