"use client"
// Main-thread client for the offline Whisper worker. Owns the singleton worker,
// the enable/downloaded flags, and the download-progress + transcribe APIs.

export type VoiceProgress = { pct: number; loadedBytes: number; totalBytes: number; file?: string }

const ENABLED_KEY = "kumo.voice.enabled"
const DOWNLOADED_KEY = "kumo.voice.downloaded"
/** Approx on-disk size of whisper-tiny.en (q8) + tokenizer — for the UI label. */
export const VOICE_MODEL_LABEL = "Whisper tiny (English)"
export const VOICE_MODEL_SIZE_LABEL = "~45 MB"

let worker: Worker | null = null

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" })
  return worker
}

export function voiceModelSupported(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined" && typeof WebAssembly !== "undefined"
}

export function isVoiceEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1"
  } catch {
    return false
  }
}
export function setVoiceEnabled(v: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, v ? "1" : "0")
  } catch {
    /* ignore */
  }
}
export function isVoiceDownloaded(): boolean {
  try {
    return localStorage.getItem(DOWNLOADED_KEY) === "1"
  } catch {
    return false
  }
}
function markDownloaded(): void {
  try {
    localStorage.setItem(DOWNLOADED_KEY, "1")
  } catch {
    /* ignore */
  }
}

type ProgressPayload = { status?: string; file?: string; loaded?: number; total?: number }

/** Load (and on first run, download + cache) the model. Resolves when ready. */
export function downloadVoiceModel(onProgress?: (p: VoiceProgress) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = getWorker()
    const files = new Map<string, { loaded: number; total: number }>()
    const onMsg = (e: MessageEvent) => {
      const m = e.data
      if (m.type === "progress") {
        const p = m.payload as ProgressPayload
        if (p?.file && typeof p.total === "number") {
          files.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
          let loaded = 0
          let total = 0
          for (const b of files.values()) {
            loaded += b.loaded
            total += b.total
          }
          if (onProgress && total > 0) onProgress({ pct: Math.min(1, loaded / total), loadedBytes: loaded, totalBytes: total, file: p.file })
        }
      } else if (m.type === "ready") {
        w.removeEventListener("message", onMsg)
        markDownloaded()
        resolve()
      } else if (m.type === "error") {
        w.removeEventListener("message", onMsg)
        reject(new Error(m.error))
      }
    }
    w.addEventListener("message", onMsg)
    w.postMessage({ type: "load" })
  })
}

let nextId = 1
/** Transcribe 16 kHz mono PCM to text using the on-device model. */
export function transcribe(audio: Float32Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = getWorker()
    const id = nextId++
    const onMsg = (e: MessageEvent) => {
      const m = e.data
      if ((m.type === "result" || m.type === "error") && m.id === id) {
        w.removeEventListener("message", onMsg)
        if (m.type === "result") resolve(m.text as string)
        else reject(new Error(m.error))
      }
    }
    w.addEventListener("message", onMsg)
    w.postMessage({ type: "transcribe", id, audio }, [audio.buffer])
  })
}
