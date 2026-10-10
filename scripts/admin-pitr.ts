import { parseArgs } from "node:util"

export type RestoreJson = { readonly bookmark: string } | { readonly at: number }

const EXPLICIT_ZONE = /(?:Z|[+-]\d{2}:\d{2})$/

const instantOf = (text: string): number => {
  const at = Date.parse(text)
  if (!EXPLICIT_ZONE.test(text) || Number.isNaN(at)) {
    throw new Error(`--at takes an ISO time with its zone, like 2026-10-10T18:00:00Z, not "${text}"`)
  }
  return at
}

export const restoreFromArgs = (args: ReadonlyArray<string>): RestoreJson => {
  const { values, positionals } = parseArgs({
    args: [...args],
    options: { at: { type: "string" } },
    allowPositionals: true,
    strict: true,
  })
  const [bookmark, ...rest] = positionals
  if (values.at !== undefined && positionals.length === 0) return { at: instantOf(values.at) }
  if (values.at === undefined && bookmark !== undefined && rest.length === 0) return { bookmark: bookmark.trim() }
  throw new Error("Give one bookmark, or --at <ISO time>")
}
