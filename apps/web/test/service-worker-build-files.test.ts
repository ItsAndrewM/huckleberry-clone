import { describe, expect, it } from "vitest"
import { fetchBuild, isThisBuildsFile, loadsOnlySavedFiles, pageMark } from "../src/service-worker/build-files.ts"

const SCRIPT = "/assets/index-CSxg7yjE.js"
const STYLES = "/assets/index-DDaxv4bF.css"
const URLS = ["/", SCRIPT, STYLES]
const VERSION = "ccaa3a9ccd3bbdfb"
const SHELL = { version: VERSION, urls: URLS }
const PAGE = `<script type="module" crossorigin src="${SCRIPT}"></script>
<link rel="stylesheet" crossorigin href="${STYLES}">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
${pageMark(VERSION)}`

const file = (body: string, type: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": type } })

const answer = (type: string, ok = true, redirected = false) => ({
  ok,
  redirected,
  headers: new Headers({ "content-type": type }),
})

const serving = (files: ReadonlyMap<string, () => Response>) => (url: string) =>
  Promise.resolve(files.get(url)?.() ?? file("missing", "text/plain", 404))

const thisBuild = () =>
  new Map([
    ["/", () => file(PAGE, "text/html; charset=utf-8")],
    [SCRIPT, () => file("export {}", "text/javascript; charset=utf-8")],
    [STYLES, () => file("body{}", "text/css; charset=utf-8")],
  ])

describe("isThisBuildsFile", () => {
  it.each([
    { what: "the page at /", url: "/", answered: answer("text/html; charset=utf-8"), saved: true },
    { what: "a script", url: SCRIPT, answered: answer("text/javascript; charset=utf-8"), saved: true },
    {
      what: "the app's fallback page where a script should be, as a deploy mid-install answers",
      url: SCRIPT,
      answered: answer("text/html; charset=utf-8"),
      saved: false,
    },
    { what: "something other than a page at /", url: "/", answered: answer("text/javascript"), saved: false },
    {
      what: "a redirect, as an expired session answers",
      url: "/",
      answered: answer("text/html", true, true),
      saved: false,
    },
    { what: "a missing file", url: STYLES, answered: answer("text/plain", false), saved: false },
  ])("$what → saved: $saved", ({ url, answered, saved }) => {
    expect(isThisBuildsFile(url, answered)).toBe(saved)
  })
})

describe("loadsOnlySavedFiles", () => {
  it("takes a page that loads only the files this build saves, whatever else it links", () => {
    expect(loadsOnlySavedFiles(PAGE, URLS)).toBe(true)
  })

  it("refuses a page from a newer deploy, which loads a script this build didn't save", () => {
    expect(loadsOnlySavedFiles(PAGE.replace("CSxg7yjE", "Zz9yXw8v"), URLS)).toBe(false)
  })
})

describe("fetchBuild", () => {
  it("fetches every file of the build when each answers as itself", async () => {
    const files = await fetchBuild(SHELL, serving(thisBuild()))
    expect(files.map(([url]) => url)).toEqual(URLS)
  })

  it("fails, so the previous copy stays, when a deploy mid-install answers a script with the app's page", async () => {
    const files = thisBuild().set(SCRIPT, () => file(PAGE, "text/html; charset=utf-8"))
    await expect(fetchBuild(SHELL, serving(files))).rejects.toThrow(
      `${SCRIPT} answered 200 text/html; charset=utf-8, not this build's file`,
    )
  })

  it("fails, so the previous copy stays, when / is still the previous deploy's page, though it loads the same files", async () => {
    const previous = PAGE.replace(pageMark(VERSION), pageMark("0123456789abcdef"))
    const files = thisBuild().set("/", () => file(previous, "text/html; charset=utf-8"))
    await expect(fetchBuild(SHELL, serving(files))).rejects.toThrow(`/ is another build's page, not ${VERSION}`)
  })

  it("fails, so the previous copy stays, when / loads files this build didn't save", async () => {
    const elsewhere = PAGE.replace("CSxg7yjE", "Zz9yXw8v")
    const files = thisBuild().set("/", () => file(elsewhere, "text/html; charset=utf-8"))
    await expect(fetchBuild(SHELL, serving(files))).rejects.toThrow("/ loads files this build didn't save")
  })
})
