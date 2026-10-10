import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"

const WORKER_ENTRY = "sw"
const WORKER_FILE = "sw.js"
const HTML_FILE = "index.html"

export interface Shell {
  readonly version: string
  readonly urls: readonly string[]
}

export const shellOf = (fileNames: readonly string[], html: string | Uint8Array): Shell => {
  const assets = fileNames.filter((name) => name.startsWith("assets/")).map((name) => `/${name}`)
  const urls = ["/", ...assets.toSorted()]
  const version = createHash("sha256").update(JSON.stringify(urls)).update(html).digest("hex").slice(0, 16)
  return { version, urls }
}

const sourcePath = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export const serviceWorker = (): Plugin => ({
  name: "bt:service-worker",
  applyToEnvironment: (environment) => environment.name === "client",
  config: () => ({
    environments: {
      client: {
        build: {
          rolldownOptions: {
            input: { index: sourcePath(HTML_FILE), [WORKER_ENTRY]: sourcePath("src/service-worker/sw.ts") },
            output: {
              entryFileNames: (chunk) => (chunk.name === WORKER_ENTRY ? WORKER_FILE : "assets/[name]-[hash].js"),
            },
          },
        },
      },
    },
  }),
  generateBundle: {
    order: "post",
    handler(_options, bundle) {
      const worker = bundle[WORKER_FILE]
      const html = bundle[HTML_FILE]
      if (worker?.type !== "chunk" || html?.type !== "asset")
        this.error(`the build has no ${WORKER_FILE} or ${HTML_FILE}`)
      const shell = shellOf(Object.keys(bundle), html.source)
      worker.code = `const SHELL = ${JSON.stringify(shell)}\n${worker.code}`
    },
  },
})
