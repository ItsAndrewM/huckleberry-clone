import type { Sleep } from "@bt/contracts"
import type { Instant } from "@bt/domain"
import { sleepsWhere } from "./store.ts"

export const liveSleepsSince = (sql: SqlStorage, from: Instant): Sleep[] =>
  sleepsWhere(sql, "WHERE deleted_at IS NULL AND (ended_at IS NULL OR ended_at > ?) ORDER BY started_at, rowid", from)
