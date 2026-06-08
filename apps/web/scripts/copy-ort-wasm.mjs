// Copy onnxruntime-web's WASM binaries into public/ort so we can serve them
// same-origin. That makes them cacheable by our service worker → the offline
// voice model runs in true airplane mode after one online download.
//
// Runs on `postinstall` and `prebuild` (so Vercel regenerates them); the files
// are gitignored. transformers.js v4 uses the JSEP build (CPU-WASM + WebGPU in
// one binary); we also copy the plain build as a fallback.
import { readdirSync, existsSync, mkdirSync, copyFileSync, statSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = join(here, "..") // apps/web
const repoRoot = join(webRoot, "..", "..")
const pnpmDir = join(repoRoot, "node_modules", ".pnpm")
const outDir = join(webRoot, "public", "ort")

// Files ORT fetches at runtime from wasmPaths. jsep = the unified build.
const WANT = [
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
]

function findOrtDist() {
  if (!existsSync(pnpmDir)) return null
  const match = readdirSync(pnpmDir).find((d) => d.startsWith("onnxruntime-web@"))
  if (!match) return null
  const dist = join(pnpmDir, match, "node_modules", "onnxruntime-web", "dist")
  return existsSync(dist) ? dist : null
}

const dist = findOrtDist()
if (!dist) {
  console.warn("[copy-ort-wasm] onnxruntime-web dist not found — skipping (run after install)")
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })
let copied = 0
for (const f of WANT) {
  const src = join(dist, f)
  if (!existsSync(src)) continue
  copyFileSync(src, join(outDir, f))
  copied++
  console.log(`[copy-ort-wasm] ${f} (${(statSync(src).size / 1e6).toFixed(1)} MB)`)
}
console.log(`[copy-ort-wasm] copied ${copied} file(s) → public/ort`)
