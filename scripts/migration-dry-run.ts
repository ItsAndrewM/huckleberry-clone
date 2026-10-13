import { readdirSync, readFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import type { ExportRow, HouseholdExport } from "../packages/contracts/src/export.ts"

export interface Migration {
  readonly name: string
  readonly sql: string
}

export interface DryRun {
  readonly applied: ReadonlyArray<string>
  readonly rows: number
  readonly tables: number
}

const MIGRATIONS_FOLDER = new URL("../apps/worker/src/db/migrations/", import.meta.url)

export const migrationsOnDisk = (): Migration[] =>
  readdirSync(MIGRATIONS_FOLDER)
    .filter((file) => file.endsWith(".sql"))
    .toSorted()
    .map((file) => ({ name: file.replace(/\.sql$/u, ""), sql: readFileSync(new URL(file, MIGRATIONS_FOLDER), "utf8") }))

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

const checkLedger = (applied: ReadonlyArray<string>, migrations: ReadonlyArray<Migration>) => {
  applied.forEach((name, index) => {
    const known = migrations[index]?.name ?? "none"
    if (known !== name) {
      throw new Error(`The export's migration ${index + 1} is "${name}", but the code's is "${known}"`)
    }
  })
}

const insertRows = (db: DatabaseSync, table: string, rows: ReadonlyArray<ExportRow>) => {
  for (const row of rows) {
    const columns = Object.keys(row)
    const placeholders = columns.map(() => "?").join(", ")
    db.prepare(`INSERT INTO ${quoted(table)} (${columns.map(quoted).join(", ")}) VALUES (${placeholders})`).run(
      ...columns.map((column) => row[column] ?? null),
    )
  }
}

const countOf = (db: DatabaseSync, table: string) =>
  Number(db.prepare(`SELECT count(*) AS n FROM ${quoted(table)}`).get()?.n)

const checkRowsKept = (db: DatabaseSync, tables: HouseholdExport["tables"]) => {
  for (const [table, rows] of Object.entries(tables)) {
    const left = countOf(db, table)
    if (left !== rows.length) throw new Error(`${table} had ${rows.length} rows, but ${left} are left`)
  }
}

const checkReferences = (db: DatabaseSync) => {
  const broken = db.prepare("PRAGMA foreign_key_check").all()
  if (broken.length > 0) throw new Error(`${broken.length} references point at rows that aren't there`)
}

export const dryRun = (exported: HouseholdExport, migrations: ReadonlyArray<Migration>): DryRun => {
  checkLedger(exported.migrations, migrations)
  const db = new DatabaseSync(":memory:", { enableForeignKeyConstraints: false })
  for (const { sql } of migrations.slice(0, exported.migrations.length)) db.exec(sql)
  for (const [table, rows] of Object.entries(exported.tables)) insertRows(db, table, rows)
  const pending = migrations.slice(exported.migrations.length)
  for (const { sql } of pending) db.exec(sql)
  checkRowsKept(db, exported.tables)
  checkReferences(db)
  const rows = Object.values(exported.tables).reduce((total, table) => total + table.length, 0)
  return { applied: pending.map(({ name }) => name), rows, tables: Object.keys(exported.tables).length }
}

export const dryRunSummary = ({ applied, rows, tables }: DryRun): string =>
  applied.length === 0
    ? "The export already has every migration, so there was nothing to apply."
    : `Applied ${applied.join(", ")} on top of the export: all ${rows} rows of its ${tables} tables are still there, and every reference still holds.`
