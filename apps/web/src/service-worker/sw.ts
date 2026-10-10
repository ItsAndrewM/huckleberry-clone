import { routeOf } from "./routes.ts"
import { assetResponse, cacheName, pageResponse, staleCaches } from "./shell-cache.ts"

declare const self: ServiceWorkerGlobalScope
declare const SHELL: { readonly version: string; readonly urls: readonly string[] }

const current = cacheName(SHELL.version)
const openSaved = () => caches.open(current)
const network = (request: Request) => fetch(request)

self.addEventListener("install", (event) => {
  event.waitUntil(
    openSaved()
      .then((saved) => saved.addAll(SHELL.urls.map((url) => new Request(url, { cache: "no-cache" }))))
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
  const respond = route === "page" ? pageResponse : assetResponse
  event.respondWith(openSaved().then((saved) => respond(event.request, network, saved)))
})
