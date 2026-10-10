import { describe, expect, it } from "vitest"
import { markedPage, shellOf } from "../service-worker-build.ts"

const BUILD = ["assets/index-CSxg7yjE.js", "sw.js", "assets/index-DDaxv4bF.css", ".assetsignore", "index.html"]
const HTML = '<script type="module" src="/assets/index-CSxg7yjE.js"></script>'

describe("shellOf", () => {
  it("saves the app at / and every built asset, but not the worker or the deploy's own files", () => {
    expect(shellOf(BUILD, HTML).urls).toEqual(["/", "/assets/index-CSxg7yjE.js", "/assets/index-DDaxv4bF.css"])
  })

  it("gives the same build the same version, so an unchanged deploy keeps its saved copy", () => {
    expect(shellOf(BUILD, HTML).version).toBe(shellOf([...BUILD].reverse(), HTML).version)
    expect(shellOf(BUILD, HTML).version).toMatch(/^[0-9a-f]{16}$/)
  })

  it("gives a new version when an asset or the page changes, so phones replace their saved copy", () => {
    const renamed = BUILD.map((name) => name.replace("CSxg7yjE", "Zz9yXw8v"))
    expect(shellOf(renamed, HTML).version).not.toBe(shellOf(BUILD, HTML).version)
    expect(shellOf(BUILD, `${HTML}<meta name="theme-color">`).version).not.toBe(shellOf(BUILD, HTML).version)
  })
})

describe("markedPage", () => {
  it("stamps the page with its build, so a worker can tell it from another deploy's page", () => {
    expect(markedPage("<html><head><title>Baby tracker</title></head><body></body></html>", "1a2b3c")).toBe(
      '<html><head><title>Baby tracker</title><meta name="bt-build" content="1a2b3c"></head><body></body></html>',
    )
  })

  it("fails the build when the page has no head to stamp", () => {
    expect(() => markedPage("<p>no head</p>", "1a2b3c")).toThrow("index.html has no </head> to stamp with its build")
  })
})
