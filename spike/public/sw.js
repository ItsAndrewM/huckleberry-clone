// Assets-only service worker (M1.14 shape): precache the shell, never touch /api/*.
const CACHE = "bt-spike-v1"
const SHELL = ["/", "/index.html", "/spike.js", "/manifest.webmanifest"]

// A distinct response, so S4 can tell "service worker active, shell not cached" from "no service worker".
const shellMissing = () =>
  new Response("Offline, and the app shell is not cached.", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8" },
  })

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())))
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()))
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url)
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return // network-only
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(async () => (await caches.match("/index.html")) ?? shellMissing()))
    return
  }
  e.respondWith(caches.match(e.request).then((hit) => hit ?? fetch(e.request)))
})
