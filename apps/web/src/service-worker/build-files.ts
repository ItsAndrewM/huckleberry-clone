import { SHELL_URL } from "./shell-cache.ts"

type Answer = Pick<Response, "ok" | "redirected" | "headers">
type FetchFile = (url: string) => Promise<Response>

const ASSET_REFERENCE = /(?:src|href)="(\/assets\/[^"]+)"/g

export const isThisBuildsFile = (url: string, answer: Answer) => {
  const isPage = answer.headers.get("content-type")?.startsWith("text/html") ?? false
  return answer.ok && !answer.redirected && isPage === (url === SHELL_URL)
}

export const loadsOnlySavedFiles = (page: string, urls: readonly string[]) =>
  [...page.matchAll(ASSET_REFERENCE)].every((reference) => urls.includes(reference[1] ?? ""))

const fetchBuildFile = (urls: readonly string[], fetchFile: FetchFile) => async (url: string) => {
  const answer = await fetchFile(url)
  if (!isThisBuildsFile(url, answer)) {
    const type = answer.headers.get("content-type") ?? "with no type"
    throw new Error(`${url} answered ${answer.status} ${type}, not this build's file`)
  }
  if (url === SHELL_URL && !loadsOnlySavedFiles(await answer.clone().text(), urls)) {
    throw new Error(`${url} loads files this build didn't save`)
  }
  return [url, answer] as const
}

export const fetchBuild = (urls: readonly string[], fetchFile: FetchFile) =>
  Promise.all(urls.map(fetchBuildFile(urls, fetchFile)))
