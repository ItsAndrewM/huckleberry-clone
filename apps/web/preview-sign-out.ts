import type { ServerResponse } from "node:http"
import type { Plugin } from "vite"

export const SIGNED_OUT_COOKIE = "bt-preview-signed-out"
export const ACCESS_EXPIRED_COOKIE = "bt-preview-access-expired"
const ACCESS_LOGIN = "https://access.example.test/cdn-cgi/access/login"

export const hasCookie = (cookies: string | undefined, name: string) => cookies?.includes(`${name}=1`) ?? false

const sendToAccess = (response: ServerResponse) => {
  response.writeHead(302, { location: ACCESS_LOGIN, "cache-control": "no-store" })
  response.end()
}

export const previewSignOut = (): Plugin => ({
  name: "bt:preview-sign-out",
  configurePreviewServer(server) {
    server.middlewares.use((request, response, next) => {
      if (hasCookie(request.headers.cookie, ACCESS_EXPIRED_COOKIE)) return sendToAccess(response)
      const signedOut = hasCookie(request.headers.cookie, SIGNED_OUT_COOKIE)
      if (!signedOut || request.url?.startsWith("/api/") !== true) return next()
      if (request.url.startsWith("/api/login")) {
        response.setHeader("set-cookie", `${SIGNED_OUT_COOKIE}=; Max-Age=0; Path=/`)
        return next()
      }
      sendToAccess(response)
    })
  },
})
