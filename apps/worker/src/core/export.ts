import type { ExportCell, ExportRow, HouseholdExport } from "@bt/contracts"
import type { Instant } from "@bt/domain"
import { appliedNames } from "../db/migrate.ts"

const LEFT_OUT = new Set(["_migrations", "receipts"])
const RESERVED_PREFIXES = ["sqlite_", "_cf_"]

const isExported = (table: string) =>
  !LEFT_OUT.has(table) && !RESERVED_PREFIXES.some((prefix) => table.startsWith(prefix))

export const exportedTables = (sql: SqlStorage): string[] =>
  sql
    .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .toArray()
    .map(({ name }) => name)
    .filter(isExported)

const cellOf = (value: SqlStorageValue): ExportCell => {
  if (value instanceof ArrayBuffer) throw new Error("A BLOB column has no export rule")
  return value
}

const rowOf = (row: Record<string, SqlStorageValue>): ExportRow =>
  Object.fromEntries(Object.entries(row).map(([column, value]) => [column, cellOf(value)]))

const rowsOf = (sql: SqlStorage, table: string): ExportRow[] =>
  sql
    .exec(`SELECT * FROM "${table.replaceAll('"', '""')}" ORDER BY rowid`)
    .toArray()
    .map(rowOf)

export const householdExportOf = (sql: SqlStorage, now: Instant): HouseholdExport => ({
  format: "baby-tracker-export",
  version: 1,
  exportedAt: now,
  migrations: appliedNames(sql),
  tables: Object.fromEntries(exportedTables(sql).map((table) => [table, rowsOf(sql, table)])),
})
