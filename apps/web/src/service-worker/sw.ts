import { routeOf } from "./routes.ts"
import { assetResponse, cacheName, pageResponse, type SavedCopy, staleCaches } from "./shell-cache.ts"

declare const self: ServiceWorkerGlobalScope
declare const SHELL: { readonly version: string; readonly urls: readonly string[] }

const current = cacheName(SHELL.version)
const network = (request: Request) => fetch(request)
const saved: SavedCopy = { match: (request, options) => caches.match(request, { ...options, cacheName: current }) }
const reportUnreadableCopy = (failure: Error) =>
  console.error("Couldn't read the offline copy, so asked the network", failure)

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(current)
      .then((cache) => cache.addAll(SHELL.urls.map((url) => new Request(url, { cache: "no-cache" }))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(staleCaches(names, current).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const route = routeOf(event.request, self.location.origin)
  if (route === "network") return
  const answer =
    route === "page"
      ? pageResponse(event.request, network, saved)
      : assetResponse(event.request, network, saved, reportUnreadableCopy)
  event.respondWith(answer)
})
