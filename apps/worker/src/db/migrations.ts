import type { Migration } from "./migrate.ts"
import household from "./migrations/0001-household.sql"

export const MIGRATIONS: ReadonlyArray<Migration> = [{ name: "0001-household", sql: household }]
