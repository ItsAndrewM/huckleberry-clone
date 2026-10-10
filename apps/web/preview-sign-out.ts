import type { Plugin } from "vite"

export const SIGNED_OUT_COOKIE = "bt-preview-signed-out"
const ACCESS_LOGIN = "https://access.example.test/cdn-cgi/access/login"

export const previewSignOut = (): Plugin => ({
  name: "bt:preview-sign-out",
  configurePreviewServer(server) {
    server.middlewares.use((request, response, next) => {
      const signedOut = request.headers.cookie?.includes(`${SIGNED_OUT_COOKIE}=1`) ?? false
      if (!signedOut || request.url?.startsWith("/api/") !== true) return next()
      if (request.url.startsWith("/api/login")) {
        response.setHeader("set-cookie", `${SIGNED_OUT_COOKIE}=; Max-Age=0; Path=/`)
        return next()
      }
      response.writeHead(302, { location: ACCESS_LOGIN, "cache-control": "no-store" })
      response.end()
    })
  },
})
