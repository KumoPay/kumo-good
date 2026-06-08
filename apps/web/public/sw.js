// Minimal PWA service worker: precache the app shell, serve cache-first for
// navigations so the wallet opens with no network (airplane mode). Chain RPC and
// relayer calls always go to the network (and fail gracefully when offline).
// The wallet lives at /app (start_url); / is the marketing landing.
const CACHE = "kumo-good-v4"
const SHELL = [
  "/",
  "/app",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  // brand mascot — precache the first-paint states so the pet shows offline
  "/brand/kumo-mascot.png",
  "/brand/kumo-offline-mascot.png",
]

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

// The manifest + icons must NEVER go stale (the install prompt reads them), so
// serve them network-first. Hashed Next assets and the rest stay cache-first.
function isFreshAsset(pathname) {
  return pathname === "/manifest.webmanifest" || /^\/(icon|apple-icon)/.test(pathname)
}

self.addEventListener("fetch", (e) => {
  const req = e.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  // Never cache the relayer proxy or cross-origin RPC.
  if (url.pathname.startsWith("/api/")) return

  if (req.mode === "navigate") {
    // Network-first; cache each page under its own path so an offline reload of
    // /app serves /app (not the landing). Fall back to /app, then /.
    const key = url.pathname.startsWith("/app") ? "/app" : url.pathname === "/" ? "/" : url.pathname
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(key, copy))
          return res
        })
        .catch(() => caches.match(key).then((r) => r || caches.match("/app").then((a) => a || caches.match("/")))),
    )
    return
  }

  if (url.origin !== self.location.origin) return

  // Manifest + icons: network-first so a new deploy's icon shows immediately.
  if (isFreshAsset(url.pathname)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req)),
    )
    return
  }

  // Everything else: cache-first with runtime caching.
  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => cached),
    ),
  )
})
