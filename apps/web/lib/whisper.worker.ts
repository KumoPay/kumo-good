// Offline speech-to-text in a Web Worker, via transformers.js (Whisper / ONNX).
// Kept off the main thread so model load + inference never freeze the UI.
//
// Model + tokenizer are cached by transformers.js in the browser Cache Storage;
// the ONNX-Runtime WASM is served same-origin from /ort (see copy-ort-wasm.mjs).
// After one online "download", everything runs in airplane mode.
import { pipeline, env } from "@huggingface/transformers"

// Fetch models from the HF hub (cached after first load); never look for local repos.
env.allowLocalModels = false
const wasmBackend = env.backends?.onnx?.wasm
if (wasmBackend) {
  // Serve the ORT WASM from our own origin so the service worker can cache it offline.
  wasmBackend.wasmPaths = "/ort/"
  // Single-threaded: avoids the COOP/COEP cross-origin-isolation requirement for
  // SharedArrayBuffer. Slower, but works on every host with no header gymnastics.
  wasmBackend.numThreads = 1
}

// English-only tiny model: smallest download (~45 MB q8), fast on CPU, plenty for
// short payment commands. Swap to "Xenova/whisper-tiny" for multilingual.
const MODEL_ID = "Xenova/whisper-tiny.en"

// Worker globals typed minimally so this compiles under the app's DOM tsconfig.
type WorkerScope = {
  postMessage(message: unknown, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent) => void) | null
}
const ctx = self as unknown as WorkerScope

type Transcriber = (
  audio: Float32Array,
  opts?: Record<string, unknown>,
) => Promise<{ text?: string } | Array<{ text?: string }>>

type InMsg = { type: "load" } | { type: "transcribe"; id: number; audio: Float32Array }

let asrPromise: Promise<Transcriber> | null = null

function getAsr(): Promise<Transcriber> {
  if (!asrPromise) {
    asrPromise = pipeline("automatic-speech-recognition", MODEL_ID, {
      dtype: "q8",
      progress_callback: (p: unknown) => ctx.postMessage({ type: "progress", payload: p }),
    }) as unknown as Promise<Transcriber>
  }
  return asrPromise
}

ctx.onmessage = async (e: MessageEvent) => {
  const msg = e.data as InMsg
  try {
    if (msg.type === "load") {
      await getAsr()
      ctx.postMessage({ type: "ready" })
      return
    }
    if (msg.type === "transcribe") {
      const asr = await getAsr()
      const out = await asr(msg.audio, { chunk_length_s: 30, stride_length_s: 5 })
      const text = Array.isArray(out) ? out.map((o) => o.text ?? "").join(" ") : (out.text ?? "")
      ctx.postMessage({ type: "result", id: msg.id, text: text.trim() })
      return
    }
  } catch (err) {
    const id = "id" in msg ? msg.id : undefined
    ctx.postMessage({ type: "error", id, error: err instanceof Error ? err.message : String(err) })
  }
}
