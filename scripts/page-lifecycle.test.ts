import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const PAGE_LIFECYCLE = /\b(?:on)?(?:pagehide|beforeunload|visibilitychange)\b/u

interface Source {
  readonly path: string
  readonly text: string
}

const withHandlers = (sources: ReadonlyArray<Source>) =>
  sources.filter(({ text }) => PAGE_LIFECYCLE.test(text)).map(({ path }) => path)

const webSources = (): Source[] => {
  const run = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "apps/web/src"], {
    cwd: ROOT,
    encoding: "utf8",
  })
  if (run.status !== 0) throw new Error(`git ls-files failed: ${run.error?.message ?? run.stderr}`)
  return run.stdout
    .split("\n")
    .filter((path) => /\.tsx?$/u.test(path))
    .map((path) => ({ path, text: readFileSync(join(ROOT, path), "utf8") }))
}

describe("no page-lifecycle handlers in the web app (plan §3.5)", () => {
  it("spots a handler however it's attached", () => {
    const sources = [
      { path: "a.ts", text: 'window.addEventListener("pagehide", save)' },
      { path: "b.ts", text: "window.onbeforeunload = save" },
      { path: "c.ts", text: 'document.addEventListener("visibilitychange", send)' },
      { path: "d.ts", text: "const pageHidden = true" },
    ]
    expect(withHandlers(sources)).toEqual(["a.ts", "b.ts", "c.ts"])
  })

  it("finds none, so no save can be sent while a page is hidden or unloading", () => {
    const sources = webSources()
    expect(sources.length).toBeGreaterThan(0)
    expect(withHandlers(sources)).toEqual([])
  })
})
