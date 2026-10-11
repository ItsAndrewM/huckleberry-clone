import { describe, expect, it } from "vitest"
import { BUILD_META_NAME, offlineCopyOf, pageBuild, SHELL_CACHE_PREFIX } from "../src/features/settings/offline-copy.ts"
import { pageMark } from "../src/service-worker/build-files.ts"
import { cacheName } from "../src/service-worker/shell-cache.ts"

const BUILD = "0123456789abcdef"

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
})
