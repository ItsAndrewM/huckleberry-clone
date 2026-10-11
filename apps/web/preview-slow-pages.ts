import type { Plugin } from "vite"
import { hasCookie } from "./preview-sign-out.ts"

export const SLOW_PAGES_COOKIE = "bt-preview-slow-pages"
export const SLOW_PAGE_MS = 15_000

export const previewSlowPages = (): Plugin => ({
  name: "bt:preview-slow-pages",
  configurePreviewServer(server) {
    server.middlewares.use((request, _response, next) => {
      const isPage = request.headers.accept?.includes("text/html") ?? false
      if (!isPage || !hasCookie(request.headers.cookie, SLOW_PAGES_COOKIE)) return next()
      setTimeout(next, SLOW_PAGE_MS)
    })
  },
})
