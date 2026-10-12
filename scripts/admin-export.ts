import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { parseArgs } from "node:util"
import { type HouseholdExport, householdExportFrom } from "../packages/contracts/src/export.ts"
import { type AdminEnv, adminRequest } from "./admin-seed.ts"

export const exportFileFromArgs = (args: ReadonlyArray<string>): string => {
  const { positionals } = parseArgs({ args: [...args], allowPositionals: true, strict: true })
  const [file, ...rest] = positionals
  if (file === undefined || file.trim() === "" || rest.length > 0) {
    throw new Error("Give one file to save the export to, like: pnpm admin export ~/baby-tracker.json")
  }
  return file
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

export const releaseExportPath = (at: Date, commit: string): string => {
  const iso = at.toISOString()
  return `exports/${iso.slice(0, 13)}${iso.slice(14, 16)}Z-${commit.slice(0, 7)}.json`
}

export const saveExport = async (env: AdminEnv, file: string): Promise<string> => {
  const response = await fetch(adminRequest(env, "/api/admin/export"))
  const body = await response.text()
  const exported = exportFrom(response.status, body)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, body, { flag: "wx", mode: 0o600 })
  return `Saved the household's export to ${file}: ${exportSummary(exported)}.`
}
