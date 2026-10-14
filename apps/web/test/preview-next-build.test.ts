import { describe, expect, it } from "vitest"
import { nextPage, nextVersionOf, nextWorker } from "../preview-next-build.ts"
import { markedPage, shellOf } from "../service-worker-build.ts"
import { pageMark } from "../src/service-worker/build-files.ts"

const BUILD = ["assets/index-CSxg7yjE.js", "sw.js", "assets/index-DDaxv4bF.css", "index.html"]
const HTML = '<html><head><script type="module" src="/assets/index-CSxg7yjE.js"></script></head><body></body></html>'
const WORKER_CODE = 'self.addEventListener("install", () => {})'

const built = () => {
  const shell = shellOf(BUILD, HTML)
  return {
    shell,
    worker: `const SHELL = ${JSON.stringify(shell)}\n${WORKER_CODE}`,
    page: markedPage(HTML, shell.version),
  }
}

describe("the preview's next build", () => {
  it("stamps the worker the build writes with the next version, and leaves its files and code alone", () => {
    const { shell, worker } = built()
    const next = { ...shell, version: nextVersionOf(shell.version) }
    expect(nextWorker(worker)).toBe(`const SHELL = ${JSON.stringify(next)}\n${WORKER_CODE}`)
  })

  it("stamps the page with the same next version, so the next worker's install takes it as its own", () => {
    const { shell, page } = built()
    expect(nextPage(page)).toBe(markedPage(HTML, nextVersionOf(shell.version)))
    expect(nextPage(page)).toContain(pageMark(`${shell.version}-next`))
  })

  it("refuses a worker or a page without its stamp, rather than serving another build's files", () => {
    expect(() => nextWorker(WORKER_CODE)).toThrow("/sw.js doesn't start with its SHELL")
    expect(() => nextPage(HTML)).toThrow("the page isn't stamped with its build")
  })
})
