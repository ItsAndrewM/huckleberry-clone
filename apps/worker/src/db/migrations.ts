import type { Migration } from "./migrate.ts"
import household from "./migrations/0001-household.sql"
import receiptRoutes from "./migrations/0002-receipt-routes.sql"

export const MIGRATIONS: ReadonlyArray<Migration> = [
  { name: "0001-household", sql: household },
  { name: "0002-receipt-routes", sql: receiptRoutes },
]
