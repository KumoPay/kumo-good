// Minimal PWA service worker: precache the app shell, serve cache-first for
// navigations so the wallet opens with no network (airplane mode). Chain RPC and
// relayer calls always go to the network (and fail gracefully when offline).
const CACHE = "kumo-good-v1"
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"]

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (e) => {
  const req = e.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  // Never cache the relayer proxy or cross-origin RPC.
  if (url.pathname.startsWith("/api/")) return
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put("/", copy))
          return res
        })
        .catch(() => caches.match("/").then((r) => r || caches.match(req))),
    )
    return
  }
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone()
      caches.open(CACHE).then((c) => c.put(req, copy))
      return res
    }).catch(() => cached)))
  }
})
