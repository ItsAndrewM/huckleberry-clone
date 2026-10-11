import { describe, expect, it } from "vitest"
import {
  BUILD_META_NAME,
  checkOfflineCopy,
  offlineCopyOf,
  pageBuild,
  SHELL_CACHE_PREFIX,
  SHELL_PATH,
} from "../src/features/settings/offline-copy.ts"
import { pageMark } from "../src/service-worker/build-files.ts"
import { cacheName, SHELL_URL } from "../src/service-worker/shell-cache.ts"

const BUILD = "0123456789abcdef"
const OLDER = "fedcba9876543210"

const storage = (held: Record<string, ReadonlyArray<string>>) => {
  const asked: Array<[string, MultiCacheQueryOptions | undefined]> = []
  return {
    asked,
    keys: async () => Object.keys(held),
    match: async (request: RequestInfo | URL, options?: MultiCacheQueryOptions) => {
      asked.push([String(request), options])
      const paths = options?.cacheName === undefined ? undefined : held[options.cacheName]
      return paths?.includes(String(request)) === true ? new Response("the shell") : undefined
    },
  }
}

describe("checkOfflineCopy", () => {
  it("counts a copy only when its cache holds the shell, so an empty cache isn't a saved copy", async () => {
    expect(await checkOfflineCopy(storage({ [cacheName(BUILD)]: [] }), BUILD)).toBe("none")
    expect(await checkOfflineCopy(storage({ [cacheName(BUILD)]: ["/"] }), BUILD)).toBe("saved")
    expect(await checkOfflineCopy(storage({ [cacheName(BUILD)]: [], [cacheName(OLDER)]: ["/"] }), BUILD)).toBe("older")
    expect(await checkOfflineCopy(storage({ "another-cache": ["/"] }), BUILD)).toBe("none")
  })

  it("looks for the shell as the service worker does: in each copy's own cache, whatever its Vary", async () => {
    const shells = storage({ [cacheName(BUILD)]: ["/"], "another-cache": ["/"] })
    await checkOfflineCopy(shells, BUILD)
    expect(shells.asked).toEqual([["/", { cacheName: cacheName(BUILD), ignoreVary: true }]])
  })
})

describe("offlineCopyOf", () => {
  it.each([
    [[cacheName(BUILD)], "saved"],
    [[cacheName("fedcba9876543210"), cacheName(BUILD)], "saved"],
    [[cacheName("fedcba9876543210")], "older"],
    [[], "none"],
    [["another-cache"], "none"],
  ])("with the caches %j, the offline copy is %s", (names, copy) => {
    expect(offlineCopyOf(names, BUILD)).toBe(copy)
  })
})

describe("pageBuild", () => {
  it("reads the build the page was stamped with", () => {
    const asked: string[] = []
    const page = {
      querySelector: (selector: string) => {
        asked.push(selector)
        return { getAttribute: (name: string) => (name === "content" ? BUILD : null) }
      },
    }
    expect(pageBuild(page)).toBe(BUILD)
    expect(asked).toEqual([`meta[name="${BUILD_META_NAME}"]`])
  })
})

describe("the names the page and the service worker share", () => {
  it("reads the stamp the build writes into the page", () => {
    expect(pageMark(BUILD)).toBe(`<meta name="${BUILD_META_NAME}" content="${BUILD}">`)
  })

  it("looks for the cache the service worker saves the build in", () => {
    expect(cacheName(BUILD)).toBe(`${SHELL_CACHE_PREFIX}${BUILD}`)
  })

  it("looks in that cache for the shell the service worker opens", () => {
    expect(SHELL_PATH).toBe(SHELL_URL)
  })
})
