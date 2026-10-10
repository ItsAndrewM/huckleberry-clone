export const SHELL_URL = "/"
const CACHE_PREFIX = "bt-shell-"
const SAME_FILE_FOR_EVERY_ORIGIN = { ignoreVary: true }

type SavedCopy = Pick<Cache, "match">
type Network = (request: Request) => Promise<Response>

export const cacheName = (version: string) => `${CACHE_PREFIX}${version}`

export const staleCaches = (names: readonly string[], current: string) =>
  names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== current)

export const pageResponse = async (request: Request, network: Network, saved: SavedCopy) => {
  try {
    return await network(request)
  } catch (failure) {
    const shell = await saved.match(SHELL_URL, SAME_FILE_FOR_EVERY_ORIGIN)
    if (shell === undefined) throw failure
    return shell
  }
}

export const assetResponse = async (request: Request, network: Network, saved: SavedCopy) =>
  (await saved.match(request, SAME_FILE_FOR_EVERY_ORIGIN)) ?? network(request)
