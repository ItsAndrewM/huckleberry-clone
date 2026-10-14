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

type Tables = HouseholdExport["tables"]

const MIGRATIONS_FOLDER = new URL("../apps/worker/src/db/migrations/", import.meta.url)
const LEFT_OUT = new Set(["_migrations", "receipts"])
const RESERVED_PREFIXES = ["sqlite_", "_cf_"]
const NOTHING_TO_APPLY = "The export already has every migration, so there was nothing to apply."
const NO_ROWS = "The export holds no rows, so there's nothing to test a migration against"
const BROKEN_BY_EXPORT = "The export already has references that point at rows that aren't there"
const BROKEN_BY_MIGRATIONS = "The migrations left references that point at rows that aren't there"

export const migrationsOnDisk = (): Migration[] =>
  readdirSync(MIGRATIONS_FOLDER)
    .filter((file) => file.endsWith(".sql"))
    .toSorted()
    .map((file) => ({ name: file.replace(/\.sql$/u, ""), sql: readFileSync(new URL(file, MIGRATIONS_FOLDER), "utf8") }))

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

const messageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

const listed = (problem: string, names: ReadonlyArray<string>) =>
  names.length === 0 ? [] : [`${problem}: ${names.join(", ")}`]

const failIfAny = (problems: ReadonlyArray<string>) => {
  if (problems.length > 0) throw new Error(problems.join(". "))
}

const checkLedger = (applied: ReadonlyArray<string>, migrations: ReadonlyArray<Migration>) => {
  applied.forEach((name, index) => {
    const known = migrations[index]?.name ?? "none"
    if (known !== name) {
      throw new Error(`The export's migration ${index + 1} is "${name}", but the code's is "${known}"`)
    }
  })
}

const isExported = (table: string) =>
  !LEFT_OUT.has(table) && !RESERVED_PREFIXES.some((prefix) => table.startsWith(prefix))

const tablesOf = (db: DatabaseSync): string[] =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map(({ name }) => String(name))
    .filter(isExported)

const columnsOf = (db: DatabaseSync, table: string): string[] =>
  db
    .prepare(`PRAGMA table_info(${quoted(table)})`)
    .all()
    .map(({ name }) => String(name))

const checkTables = (db: DatabaseSync, tables: Tables) => {
  const built = tablesOf(db)
  const exported = Object.keys(tables)
  failIfAny([
    ...listed(
      "Tables its migrations create are missing from the export",
      built.filter((table) => !exported.includes(table)),
    ),
    ...listed(
      "The export holds tables its migrations don't create",
      exported.filter((table) => !built.includes(table)),
    ),
  ])
}

const checkColumns = (db: DatabaseSync, table: string, rows: ReadonlyArray<ExportRow>) => {
  const built = columnsOf(db, table)
  const exported = new Set(rows.flatMap((row) => Object.keys(row)))
  failIfAny([
    ...listed(
      `The export's ${table} rows lack columns its migrations create`,
      built.filter((column) => rows.some((row) => !Object.hasOwn(row, column))),
    ),
    ...listed(
      `The export's ${table} rows have columns its migrations don't create`,
      [...exported].filter((column) => !built.includes(column)),
    ),
  ])
}

const checkSchema = (db: DatabaseSync, tables: Tables) => {
  checkTables(db, tables)
  for (const [table, rows] of Object.entries(tables)) checkColumns(db, table, rows)
}

const loadRows = (db: DatabaseSync, table: string, rows: ReadonlyArray<ExportRow>) => {
  const columns = columnsOf(db, table)
  const insert = db.prepare(
    `INSERT INTO ${quoted(table)} (${columns.map(quoted).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
  )
  try {
    for (const row of rows) insert.run(...columns.map((column) => row[column] ?? null))
  } catch (cause) {
    throw new Error(`Loading the export's ${table} rows failed: ${messageOf(cause)}`, { cause })
  }
}

const countOf = (db: DatabaseSync, table: string) =>
  Number(db.prepare(`SELECT count(*) AS n FROM ${quoted(table)}`).get()?.n)

const checkRowsKept = (db: DatabaseSync, tables: Tables) => {
  for (const [table, rows] of Object.entries(tables)) {
    const left = countOf(db, table)
    if (left !== rows.length) throw new Error(`${table} had ${rows.length} rows, but ${left} are left`)
  }
}

const checkReferences = (db: DatabaseSync, problem: string) => {
  const broken = db
    .prepare("PRAGMA foreign_key_check")
    .all()
    .map(({ table, parent }) => `${table} -> ${parent}`)
  failIfAny(listed(problem, [...new Set(broken)]))
}

const applyMigration = (db: DatabaseSync, { name, sql }: Migration) => {
  try {
    db.exec("BEGIN")
    db.exec(sql)
    db.exec("COMMIT")
  } catch (cause) {
    throw new Error(`The migration ${name} failed: ${messageOf(cause)}`, { cause })
  }
}

const loadExport = (db: DatabaseSync, seen: ReadonlyArray<Migration>, tables: Tables) => {
  for (const migration of seen) applyMigration(db, migration)
  checkSchema(db, tables)
  for (const [table, rows] of Object.entries(tables)) loadRows(db, table, rows)
  checkReferences(db, BROKEN_BY_EXPORT)
}

const migrateExport = (db: DatabaseSync, pending: ReadonlyArray<Migration>, tables: Tables) => {
  db.exec("PRAGMA foreign_keys = ON")
  for (const migration of pending) applyMigration(db, migration)
  checkRowsKept(db, tables)
  checkReferences(db, BROKEN_BY_MIGRATIONS)
}

export const dryRun = (exported: HouseholdExport, migrations: ReadonlyArray<Migration>): DryRun => {
  checkLedger(exported.migrations, migrations)
  const pending = migrations.slice(exported.migrations.length)
  if (pending.length === 0) throw new Error(NOTHING_TO_APPLY)
  const rows = Object.values(exported.tables).reduce((total, table) => total + table.length, 0)
  if (rows === 0) throw new Error(NO_ROWS)
  const db = new DatabaseSync(":memory:", { enableForeignKeyConstraints: false })
  try {
    loadExport(db, migrations.slice(0, exported.migrations.length), exported.tables)
    migrateExport(db, pending, exported.tables)
  } finally {
    db.close()
  }
  return { applied: pending.map(({ name }) => name), rows, tables: Object.keys(exported.tables).length }
}

export const dryRunSummary = ({ applied, rows, tables }: DryRun): string =>
  `Applied ${applied.join(", ")} on top of the export: all ${rows} rows of its ${tables} tables are still there, and every reference still holds.`
