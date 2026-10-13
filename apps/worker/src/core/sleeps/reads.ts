import type { Sleep } from "@bt/contracts"
import { type Instant, type Interval, sleepTouches } from "@bt/domain"
import { sleepsWhere } from "./store.ts"

export const liveSleepsSince = (sql: SqlStorage, from: Instant): Sleep[] =>
  sleepsWhere(sql, "WHERE deleted_at IS NULL AND (ended_at IS NULL OR ended_at > ?) ORDER BY started_at, rowid", from)

export const liveSleepsTouching = (sql: SqlStorage, period: Interval, now: Instant): Sleep[] =>
  sleepsWhere(
    sql,
    "WHERE deleted_at IS NULL AND started_at < ? AND (ended_at IS NULL OR ended_at > ?) ORDER BY started_at, rowid",
    period.end,
    period.start,
  ).filter((sleep) => sleepTouches(period, sleep, now))

export const deletedSleepsSince = (sql: SqlStorage, since: Instant): Sleep[] =>
  sleepsWhere(sql, "WHERE deleted_at >= ? ORDER BY deleted_at DESC, rowid DESC", since)

export const lastSleep = (sql: SqlStorage): Sleep | null =>
  sleepsWhere(
    sql,
    "INDEXED BY sleeps_by_time WHERE deleted_at IS NULL ORDER BY started_at DESC, rowid DESC LIMIT 1",
  )[0] ?? null
