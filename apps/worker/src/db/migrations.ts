import type { Migration } from "./migrate.ts"
import household from "./migrations/0001-household.sql"
import receiptRoutes from "./migrations/0002-receipt-routes.sql"
import diapers from "./migrations/0003-diapers.sql"
import feeds from "./migrations/0004-feeds.sql"

export const MIGRATIONS: ReadonlyArray<Migration> = [
  { name: "0001-household", sql: household },
  { name: "0002-receipt-routes", sql: receiptRoutes },
  { name: "0003-diapers", sql: diapers },
  { name: "0004-feeds", sql: feeds },
]
