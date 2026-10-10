import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"
import { pageMark, type Shell } from "./src/service-worker/build-files.ts"

const WORKER_ENTRY = "sw"
const WORKER_FILE = "sw.js"
const HTML_FILE = "index.html"
const HEAD_END = "</head>"

export const shellOf = (fileNames: readonly string[], html: string | Uint8Array): Shell => {
  const assets = fileNames.filter((name) => name.startsWith("assets/")).map((name) => `/${name}`)
  const urls = ["/", ...assets.toSorted()]
  const version = createHash("sha256").update(JSON.stringify(urls)).update(html).digest("hex").slice(0, 16)
  return { version, urls }
}

export const markedPage = (page: string, version: string) => {
  if (!page.includes(HEAD_END)) throw new Error(`${HTML_FILE} has no ${HEAD_END} to stamp with its build`)
  return page.replace(HEAD_END, `${pageMark(version)}${HEAD_END}`)
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
      html.source = markedPage(Buffer.from(html.source).toString("utf8"), shell.version)
      worker.code = `const SHELL = ${JSON.stringify(shell)}\n${worker.code}`
    },
  },
})
