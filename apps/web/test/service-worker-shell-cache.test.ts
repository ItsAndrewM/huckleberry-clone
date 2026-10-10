import { describe, expect, it } from "vitest"
import { assetResponse, cacheName, pageResponse, SHELL_URL, staleCaches } from "../src/service-worker/shell-cache.ts"

const ORIGIN = "https://baby.example.test"
const offline = () => Promise.reject(new TypeError("Failed to fetch"))

const savedCopy = (files: ReadonlyMap<string, Response>) => {
  const lookups: Array<{ path: string; options: CacheQueryOptions | undefined }> = []
  const match = (request: RequestInfo | URL, options?: CacheQueryOptions) => {
    const path = new URL(request instanceof Request ? request.url : request, ORIGIN).pathname
    lookups.push({ path, options })
    return Promise.resolve(files.get(path))
  }
  return { match, lookups }
}

const answering = (response: Response) => () => Promise.resolve(response)

describe("cacheName and staleCaches", () => {
  it("names a build's cache by its version", () => {
    expect(cacheName("1a2b3c")).toBe("bt-shell-1a2b3c")
  })

  it("drops only the shell caches of other builds, and leaves caches it didn't make", () => {
    const names = [cacheName("old"), cacheName("new"), "another-cache"]
    expect(staleCaches(names, cacheName("new"))).toEqual([cacheName("old")])
  })
})

describe("pageResponse", () => {
  const page = new Request(`${ORIGIN}/history`)

  it.each([
    ["the page", new Response("<html>", { status: 200 })],
    ["Access's redirect to sign in", Response.redirect(`${ORIGIN}/elsewhere`, 302)],
    ["a server error", new Response("busy", { status: 503 })],
  ])("passes on %s from the network, untouched", async (_, answer) => {
    const saved = savedCopy(new Map())
    expect(await pageResponse(page, answering(answer), saved)).toBe(answer)
    expect(saved.lookups).toEqual([])
  })

  it("opens the saved shell when the network can't be reached", async () => {
    const shell = new Response("<saved shell>")
    const saved = savedCopy(new Map([[SHELL_URL, shell]]))
    expect(await pageResponse(page, offline, saved)).toBe(shell)
    expect(saved.lookups).toEqual([{ path: "/", options: { ignoreVary: true } }])
  })

  it("fails as the network did when nothing is saved yet", async () => {
    await expect(pageResponse(page, offline, savedCopy(new Map()))).rejects.toThrow("Failed to fetch")
  })
})

describe("assetResponse", () => {
  const script = new Request(`${ORIGIN}/assets/index-CSxg7yjE.js`, { headers: { origin: ORIGIN } })

  it("answers from the saved copy without the network, whatever Origin the request carries", async () => {
    const saved = new Response("saved script")
    const copy = savedCopy(new Map([["/assets/index-CSxg7yjE.js", saved]]))
    expect(await assetResponse(script, offline, copy)).toBe(saved)
    expect(copy.lookups).toEqual([{ path: "/assets/index-CSxg7yjE.js", options: { ignoreVary: true } }])
  })

  it("fetches what isn't saved from the network", async () => {
    const fetched = new Response("fetched")
    expect(await assetResponse(script, answering(fetched), savedCopy(new Map()))).toBe(fetched)
  })
})
