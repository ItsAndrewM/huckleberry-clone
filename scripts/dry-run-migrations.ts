import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { householdExportFrom } from "../packages/contracts/src/export.ts"
import { dryRun, dryRunSummary, migrationsOnDisk } from "./migration-dry-run.ts"

const { positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, strict: true })
const [file, ...rest] = positionals
if (file === undefined || rest.length > 0) {
  throw new Error("Give one export, like: pnpm migrations:dry-run ~/baby-tracker.json")
}
const exported = householdExportFrom(readFileSync(file, "utf8"))
if (exported === null) throw new Error(`${file} isn't a household export`)
console.log(dryRunSummary(dryRun(exported, migrationsOnDisk())))
