import { type Changed, type FieldError, MAX_SLEEP_MS, NotFound, type Sleep, SleepConflict } from "@bt/contracts"
import {
  FUTURE_TOLERANCE_MS,
  type Instant,
  type Interval,
  type Span,
  type ValidationIssue,
  validateEndAfterStart,
  validateNotInFuture,
} from "@bt/domain"
import { type Calendar, changedKeys, timeIssue } from "../calendar.ts"
import { errorAt } from "../fields.ts"
import type { CoreResult } from "../receipts.ts"
import { loadSleep, sleepsWhere } from "./store.ts"

type SleepState = "live" | "running" | "finished" | "deleted"

type Found =
  | { readonly ok: true; readonly sleep: Sleep }
  | { readonly ok: false; readonly error: NotFound | SleepConflict }

const isIn = (sleep: Sleep, wanted: SleepState): boolean => {
  if (wanted === "deleted") return sleep.deletedAt !== null
  if (sleep.deletedAt !== null) return false
  if (wanted === "live") return true
  return (sleep.endedAt === null) === (wanted === "running")
}

export const sleepFor = (sql: SqlStorage, id: string, version: number, wanted: SleepState): Found => {
  const sleep = loadSleep(sql, id)
  if (sleep === undefined) return { ok: false, error: new NotFound() }
  if (sleep.version !== version) {
    return { ok: false, error: new SleepConflict({ code: "STALE_VERSION", current: sleep }) }
  }
  return isIn(sleep, wanted) ? { ok: true, sleep } : { ok: false, error: new NotFound() }
}

export const activeSleep = (sql: SqlStorage): Sleep | undefined =>
  sleepsWhere(sql, "WHERE ended_at IS NULL AND deleted_at IS NULL")[0]

export const alreadyActive = (sleep: Sleep) => new SleepConflict({ code: "SLEEP_ALREADY_ACTIVE", current: sleep })

export const overlappedSleep = (
  sql: SqlStorage,
  span: Span,
  now: Instant,
  exceptId: string | null,
): Sleep | undefined => {
  const runningUntil = now + FUTURE_TOLERANCE_MS
  return sleepsWhere(
    sql,
    `WHERE deleted_at IS NULL AND id IS NOT ? AND started_at < ? AND COALESCE(ended_at, ?) > ?
     ORDER BY started_at LIMIT 1`,
    exceptId,
    span.endedAt ?? runningUntil,
    runningUntil,
    span.startedAt,
  )[0]
}

const endIssue = (startedAt: Instant, endedAt: Instant, now: Instant): ValidationIssue | null =>
  validateEndAfterStart(startedAt, endedAt) ??
  validateNotInFuture(endedAt, now) ??
  (endedAt - startedAt > MAX_SLEEP_MS ? "out_of_range" : null)

const sameTimes = (a: Span, b: Span) => a.startedAt === b.startedAt && a.endedAt === b.endedAt

export const timesErrors = (calendar: Calendar, times: Span, now: Instant, before: Span | null): FieldError[] => {
  if (before !== null && sameTimes(times, before)) return []
  const keptStart = before !== null && times.startedAt === before.startedAt
  return [
    ...errorAt("startedAt", keptStart ? null : timeIssue(calendar, times.startedAt, now)),
    ...errorAt("endedAt", times.endedAt === null ? null : endIssue(times.startedAt, times.endedAt, now)),
  ]
}

export const overlapConflict = (sleep: Sleep) => new SleepConflict({ code: "SLEEP_OVERLAP", current: sleep })

const spanOf = (sleep: Sleep, now: Instant): Interval => ({
  start: sleep.startedAt,
  end: Math.max(sleep.endedAt ?? now, sleep.startedAt + 1),
})

export const sleepChanges = (calendar: Calendar, before: Sleep | null, after: Sleep | null, now: Instant): Changed =>
  changedKeys(calendar, before === null ? null : spanOf(before, now), after === null ? null : spanOf(after, now))

export const savedSleep = (
  calendar: Calendar,
  before: Sleep | null,
  after: Sleep,
  now: Instant,
): CoreResult<Sleep, never> => ({ ok: true, response: after, changed: sleepChanges(calendar, before, after, now) })
