import { describe, expect, it } from "vitest"
import { type BuiltFiles, markedPage, shellOf, workerImportProblem } from "../service-worker-build.ts"

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

describe("workerImportProblem", () => {
  const ROOT = "/repo/apps/web"
  const chunk = (moduleIds: string[], imports: string[] = [], dynamicImports: string[] = []): BuiltFiles[string] => ({
    type: "chunk",
    imports,
    dynamicImports,
    moduleIds,
  })
  const SHARED = "assets/shell-cache-qMaYirJM.js"

  it("passes a worker that imports nothing, as every build does today", () => {
    const bundle: BuiltFiles = { "sw.js": chunk([`${ROOT}/src/service-worker/sw.ts`]), "index.html": { type: "asset" } }
    expect(workerImportProblem(bundle, ROOT)).toBeUndefined()
  })

  it("names the chunk sw.js imports and the modules in it, since a service worker can't load one", () => {
    const bundle: BuiltFiles = {
      "sw.js": chunk([`${ROOT}/src/service-worker/sw.ts`], [SHARED]),
      [SHARED]: chunk([`${ROOT}/src/service-worker/shell-cache.ts`, `${ROOT}/src/service-worker/build-files.ts`]),
    }
    expect(workerImportProblem(bundle, ROOT)).toBe(
      "sw.js imports assets/shell-cache-qMaYirJM.js (src/service-worker/shell-cache.ts, src/service-worker/build-files.ts), which a service worker can't load, so sw.ts needs its own copy of what it shares with the page",
    )
  })

  it("names a chunk sw.js loads with import() too, after the ones it imports, since a service worker can't run import()", () => {
    const bundle: BuiltFiles = {
      "sw.js": chunk([`${ROOT}/src/service-worker/sw.ts`], [SHARED], ["assets/routes-Dq3vLm0x.js"]),
      [SHARED]: chunk([`${ROOT}/src/service-worker/shell-cache.ts`]),
      "assets/routes-Dq3vLm0x.js": chunk([`${ROOT}/src/service-worker/routes.ts`]),
    }
    expect(workerImportProblem(bundle, ROOT)).toBe(
      "sw.js imports assets/shell-cache-qMaYirJM.js (src/service-worker/shell-cache.ts) and assets/routes-Dq3vLm0x.js (src/service-worker/routes.ts), which a service worker can't load, so sw.ts needs its own copy of what it shares with the page",
    )
  })

  it("names a module that isn't a file, such as Rolldown's runtime, by its id", () => {
    const bundle: BuiltFiles = {
      "sw.js": chunk([`${ROOT}/src/service-worker/sw.ts`], ["assets/rolldown-runtime-C4fV2b8s.js"]),
      "assets/rolldown-runtime-C4fV2b8s.js": chunk(["\0rolldown/runtime.js"]),
    }
    expect(workerImportProblem(bundle, ROOT)).toBe(
      "sw.js imports assets/rolldown-runtime-C4fV2b8s.js (rolldown/runtime.js), which a service worker can't load, so sw.ts needs its own copy of what it shares with the page",
    )
  })
})
