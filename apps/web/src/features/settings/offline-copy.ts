export type OfflineCopy = "saved" | "older" | "newer" | "none"

export const BUILD_META_NAME = "bt-build"
export const SHELL_CACHE_PREFIX = "bt-shell-"
export const SHELL_PATH = "/"

type ShellStorage = Pick<CacheStorage, "keys" | "match">

interface StampedPage {
  readonly querySelector: (selector: string) => Pick<Element, "getAttribute"> | null
}

export const pageBuild = (page: StampedPage) =>
  page.querySelector(`meta[name="${BUILD_META_NAME}"]`)?.getAttribute("content") ?? null

export const offlineCopyOf = (cacheNames: readonly string[], build: string, workerChanged: boolean): OfflineCopy => {
  const copies = cacheNames.filter((name) => name.startsWith(SHELL_CACHE_PREFIX))
  const thisBuild = `${SHELL_CACHE_PREFIX}${build}`
  if (copies.length === 0) return "none"
  if (workerChanged) return copies.at(-1) === thisBuild ? "saved" : "newer"
  return copies.includes(thisBuild) ? "saved" : "older"
}

const holdsShell = async (storage: ShellStorage, cacheName: string) =>
  (await storage.match(SHELL_PATH, { cacheName, ignoreVary: true })) !== undefined

export const checkOfflineCopy = async (storage: ShellStorage, build: string, workerChanged: boolean) => {
  const copies = (await storage.keys()).filter((name) => name.startsWith(SHELL_CACHE_PREFIX))
  const held = await Promise.all(copies.map((name) => holdsShell(storage, name)))
  return offlineCopyOf(
    copies.filter((_, index) => held[index]),
    build,
    workerChanged,
  )
}
