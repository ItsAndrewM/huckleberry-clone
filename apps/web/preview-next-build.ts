import { readFile } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import { resolve } from "node:path"
import type { Plugin } from "vite"
import { hasCookie } from "./preview-sign-out.ts"
import { pageMark } from "./src/service-worker/build-files.ts"

export const NEXT_BUILD_COOKIE = "bt-preview-next-build"

const CLIENT_BUILD = "dist/client"
const WORKER_PATH = "/sw.js"
const SHELL_VERSION = /^(const SHELL = \{"version":")([^"]+)"/u
const PAGE_BUILD = /<meta name="bt-build" content="([^"]+)">/u

export const nextVersionOf = (version: string) => `${version}-next`

export const nextWorker = (worker: string) => {
  if (!SHELL_VERSION.test(worker)) throw new Error(`${WORKER_PATH} doesn't start with its SHELL`)
  return worker.replace(SHELL_VERSION, (_line, start: string, version: string) => `${start}${nextVersionOf(version)}"`)
}

export const nextPage = (page: string) => {
  const version = PAGE_BUILD.exec(page)?.[1]
  if (version === undefined) throw new Error("the page isn't stamped with its build")
  return page.replace(pageMark(version), pageMark(nextVersionOf(version)))
}

const pathOf = (request: IncomingMessage) => new URL(request.url ?? "/", "http://preview.test").pathname

const isPage = (request: IncomingMessage) => {
  const path = pathOf(request)
  if (path.startsWith("/api/")) return false
  return path === "/" || (request.headers.accept?.includes("text/html") ?? false)
}

const serve = async (response: ServerResponse, file: string, type: string, stamp: (text: string) => string) => {
  try {
    const text = stamp(await readFile(file, "utf8"))
    response.writeHead(200, { "content-type": type, "cache-control": "no-cache" })
    response.end(text)
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
    response.end(`The preview couldn't serve the next build: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const previewNextBuild = (): Plugin => ({
  name: "bt:preview-next-build",
  configurePreviewServer(server) {
    const client = resolve(server.config.root, CLIENT_BUILD)
    server.middlewares.use((request, response, next) => {
      if (!hasCookie(request.headers.cookie, NEXT_BUILD_COOKIE)) return next()
      if (pathOf(request) === WORKER_PATH)
        return void serve(response, resolve(client, "sw.js"), "text/javascript", nextWorker)
      if (isPage(request))
        return void serve(response, resolve(client, "index.html"), "text/html; charset=utf-8", nextPage)
      next()
    })
  },
})
