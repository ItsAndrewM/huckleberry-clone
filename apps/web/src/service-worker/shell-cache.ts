export const SHELL_URL = "/"
export const NETWORK_GRACE_MS = 3_000
const CACHE_PREFIX = "bt-shell-"
const SAME_FILE_FOR_EVERY_ORIGIN = { ignoreVary: true }

export type SavedCopy = Pick<Cache, "match">
export type Network = (request: Request) => Promise<Response>
export type Wait = (ms: number) => Promise<void>
export type Report = (failure: Error) => void

export const cacheName = (version: string) => `${CACHE_PREFIX}${version}`

export const staleCaches = (names: readonly string[], current: string) =>
  names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== current)

const savedShell = (saved: SavedCopy) => saved.match(SHELL_URL, SAME_FILE_FOR_EVERY_ORIGIN)

export const pageResponse = (request: Request, network: Network, saved: SavedCopy, wait: Wait) => {
  const answer = network(request)
  const whenUnreachable = answer.catch(async (failure: Error) => {
    const shell = await savedShell(saved)
    if (shell === undefined) throw failure
    return shell
  })
  const whenSlow = wait(NETWORK_GRACE_MS)
    .then(() => savedShell(saved))
    .then(
      (shell) => shell ?? answer,
      () => answer,
    )
  return Promise.race([whenUnreachable, whenSlow])
}

export const assetResponse = async (request: Request, network: Network, saved: SavedCopy, report: Report) => {
  const copy = await saved.match(request, SAME_FILE_FOR_EVERY_ORIGIN).catch((failure: Error) => {
    report(failure)
    return undefined
  })
  return copy ?? network(request)
}
