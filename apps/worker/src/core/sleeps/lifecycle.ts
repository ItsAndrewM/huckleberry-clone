import type { InvalidInput, NotFound, Sleep, SleepConflict, SleepStart, TimedAction } from "@bt/contracts"
import { type Instant, type ValidationIssue, validateEndAfterStart, validateNotInFuture } from "@bt/domain"
import { calendarOf, timeIssue } from "../calendar.ts"
import { errorAt, invalidUnless } from "../fields.ts"
import type { CoreResult, Stamp } from "../receipts.ts"
import { activeSleep, alreadyActive, overlapConflict, overlappedSleep, savedSleep, sleepFor } from "./rules.ts"
import { createSleep, saveSleep } from "./store.ts"

const wakeIssue = (sleep: Sleep, at: Instant, now: Instant): ValidationIssue | null =>
  validateEndAfterStart(sleep.startedAt, at) ?? validateNotInFuture(at, now)

export const startSleep =
  (stamp: Stamp, start: SleepStart) =>
  (sql: SqlStorage): CoreResult<Sleep, InvalidInput | SleepConflict> => {
    const calendar = calendarOf(sql)
    const invalid = invalidUnless(errorAt("startedAt", timeIssue(calendar, start.startedAt, stamp.now)))
    if (invalid !== null) return { ok: false, error: invalid }
    const active = activeSleep(sql)
    if (active !== undefined) return { ok: false, error: alreadyActive(active) }
    const opened = { kind: start.kind, startedAt: start.startedAt, endedAt: null }
    const overlapped = overlappedSleep(sql, opened, stamp.now, null)
    if (overlapped !== undefined) return { ok: false, error: overlapConflict(overlapped) }
    return savedSleep(calendar, null, createSleep(sql, stamp, opened), stamp.now)
  }

export const wakeSleep =
  (stamp: Stamp, id: string, action: TimedAction) =>
  (sql: SqlStorage): CoreResult<Sleep, InvalidInput | NotFound | SleepConflict> => {
    const found = sleepFor(sql, id, action.version, "running")
    if (!found.ok) return found
    const invalid = invalidUnless(errorAt("occurredAt", wakeIssue(found.sleep, action.occurredAt, stamp.now)))
    if (invalid !== null) return { ok: false, error: invalid }
    const woken = saveSleep(sql, stamp, { ...found.sleep, endedAt: action.occurredAt })
    return savedSleep(calendarOf(sql), found.sleep, woken, stamp.now)
  }
