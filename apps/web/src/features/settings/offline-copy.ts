export type OfflineCopy = "saved" | "older" | "none"

export const BUILD_META_NAME = "bt-build"
export const SHELL_CACHE_PREFIX = "bt-shell-"

interface StampedPage {
  readonly querySelector: (selector: string) => Pick<Element, "getAttribute"> | null
}

export const pageBuild = (page: StampedPage) =>
  page.querySelector(`meta[name="${BUILD_META_NAME}"]`)?.getAttribute("content") ?? null

export const offlineCopyOf = (cacheNames: readonly string[], build: string): OfflineCopy => {
  if (cacheNames.includes(`${SHELL_CACHE_PREFIX}${build}`)) return "saved"
  return cacheNames.some((name) => name.startsWith(SHELL_CACHE_PREFIX)) ? "older" : "none"
}
