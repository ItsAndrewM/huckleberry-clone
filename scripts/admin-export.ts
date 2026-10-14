import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { parseArgs } from "node:util"
import { type HouseholdExport, householdExportFrom } from "../packages/contracts/src/export.ts"
import { type AdminEnv, adminRequest } from "./admin-seed.ts"

export interface Places {
  readonly cwd: string
  readonly home: string
  readonly checkout: string
}

const HOME_FOLDER = /^~(?=\/|$)/

export const expandHome = (file: string, home: string): string => file.replace(HOME_FOLDER, home)

const isWithin = (folder: string, path: string) => {
  const route = relative(folder, path)
  return route === "" || (route !== ".." && !route.startsWith(`..${sep}`) && !isAbsolute(route))
}

const realPathOf = (path: string): string => {
  if (existsSync(path)) return realpathSync(path)
  const parent = dirname(path)
  return parent === path ? path : join(realPathOf(parent), basename(path))
}

const gitSees = (path: string, checkout: string) =>
  isWithin(checkout, path) && !isWithin(join(checkout, "exports"), path)

export const exportFileFromArgs = (args: ReadonlyArray<string>, places: Places): string => {
  const { positionals } = parseArgs({ args: [...args], allowPositionals: true, strict: true })
  const [file, ...rest] = positionals
  if (file === undefined || file.trim() === "" || rest.length > 0) {
    throw new Error("Give one file to save the export to, like: pnpm admin export ~/baby-tracker.json")
  }
  const path = realPathOf(resolve(places.cwd, expandHome(file, places.home)))
  if (gitSees(path, realPathOf(places.checkout))) {
    throw new Error(
      `Save the export outside this checkout, or under its exports/ folder, which git ignores, not ${path}`,
    )
  }
  return path
}

export const exportFrom = (status: number, body: string): HouseholdExport => {
  if (status !== 200) throw new Error(`Couldn't export the household: ${status} ${body}`)
  const exported = householdExportFrom(body)
  if (exported === null) throw new Error("Couldn't export the household: its answer wasn't an export")
  return exported
}

export const exportSummary = ({ tables, exportedAt }: HouseholdExport): string => {
  const rows = Object.values(tables).reduce((total, table) => total + table.length, 0)
  return `${Object.keys(tables).length} tables and ${rows} rows, as of ${new Date(exportedAt).toISOString()}`
}

export const saveExport = async (env: AdminEnv, file: string): Promise<string> => {
  const response = await fetch(adminRequest(env, "/api/admin/export"))
  const body = await response.text()
  const exported = exportFrom(response.status, body)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, body, { flag: "wx", mode: 0o600 })
  return `Saved the household's export to ${file}: ${exportSummary(exported)}.`
}
