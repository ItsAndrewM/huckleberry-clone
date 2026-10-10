import { fetchBuild, type Shell } from "./build-files.ts"
import { routeOf } from "./routes.ts"
import { assetResponse, cacheName, pageResponse, type SavedCopy, staleCaches } from "./shell-cache.ts"

declare const self: ServiceWorkerGlobalScope
declare const SHELL: Shell

const current = cacheName(SHELL.version)
const network = (request: Request) => fetch(request)
const fetchFile = (url: string) => fetch(url, { cache: "no-cache", redirect: "error" })
const saved: SavedCopy = { match: (request, options) => caches.match(request, { ...options, cacheName: current }) }
const reportUnreadableCopy = (failure: Error) =>
  console.error("Couldn't read the offline copy, so asked the network", failure)
const keepPreviousCopy = (failure: Error) => {
  console.error("Kept the previous offline copy: this build's files didn't all arrive as themselves", failure)
  throw failure
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    fetchBuild(SHELL, fetchFile)
      .then((files) =>
        caches.open(current).then((cache) => Promise.all(files.map(([url, file]) => cache.put(url, file)))),
      )
      .then(() => self.skipWaiting())
      .catch(keepPreviousCopy),
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
