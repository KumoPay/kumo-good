// Copy onnxruntime-web's WASM binaries into public/ort so we can serve them
// same-origin. That makes them cacheable by our service worker → the offline
// voice model runs in true airplane mode after one online download.
//
// Runs on `postinstall` and `prebuild` (so Vercel regenerates them); the files
// are gitignored. ORT picks a variant at runtime (jsep / asyncify / jspi /
// plain) depending on the model + browser, so we copy EVERY ort-wasm-simd-
// threaded.* file — missing one (e.g. asyncify) breaks with "no available
// backend found".
import { readdirSync, existsSync, mkdirSync, copyFileSync, statSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = join(here, "..") // apps/web
const repoRoot = join(webRoot, "..", "..")
const pnpmDir = join(repoRoot, "node_modules", ".pnpm")
const outDir = join(webRoot, "public", "ort")

// Match every ORT runtime artifact (all variants: jsep/asyncify/jspi/plain,
// both .wasm and the .mjs glue ORT dynamically imports).
const WANT_RE = /^ort-wasm-simd-threaded\..*\.(wasm|mjs)$|^ort-wasm-simd-threaded\.(wasm|mjs)$/

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
for (const f of readdirSync(dist)) {
  if (!WANT_RE.test(f)) continue
  copyFileSync(join(dist, f), join(outDir, f))
  copied++
  console.log(`[copy-ort-wasm] ${f} (${(statSync(join(dist, f)).size / 1e6).toFixed(1)} MB)`)
}
console.log(`[copy-ort-wasm] copied ${copied} file(s) → public/ort`)
