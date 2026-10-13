import {
  type FieldError,
  type InvalidInput,
  type NotFound,
  queryKeys,
  type Sleep,
  type SleepConflict,
  type SleepEdit,
  type VersionedAction,
} from "@bt/contracts"
import { calendarOf, timeIssue } from "../calendar.ts"
import { errorAt, invalidUnless } from "../fields.ts"
import type { CoreResult, Stamp } from "../receipts.ts"
import {
  activeSleep,
  alreadyActive,
  overlapConflict,
  overlappedSleep,
  savedSleep,
  sleepChanges,
  sleepFor,
  timesErrors,
} from "./rules.ts"
import { saveSleep } from "./store.ts"

type Failure = InvalidInput | NotFound | SleepConflict

const runningChanged = (sleep: Sleep, edit: SleepEdit): FieldError[] =>
  (sleep.endedAt === null) === (edit.endedAt === null) ? [] : [{ path: "endedAt", issue: "invalid" }]

export const editSleep =
  (stamp: Stamp, id: string, edit: SleepEdit) =>
  (sql: SqlStorage): CoreResult<Sleep, Failure> => {
    const found = sleepFor(sql, id, edit.version, "live")
    if (!found.ok) return found
    const { sleep } = found
    const calendar = calendarOf(sql)
    const invalid = invalidUnless([...runningChanged(sleep, edit), ...timesErrors(calendar, edit, stamp.now, sleep)])
    if (invalid !== null) return { ok: false, error: invalid }
    const overlapped = overlappedSleep(sql, edit, stamp.now, sleep.id)
    if (overlapped !== undefined) return { ok: false, error: overlapConflict(overlapped) }
    const { kind, startedAt, endedAt } = edit
    return savedSleep(calendar, sleep, saveSleep(sql, stamp, { ...sleep, kind, startedAt, endedAt }), stamp.now)
  }

export const deleteSleep =
  (stamp: Stamp, id: string, action: VersionedAction) =>
  (sql: SqlStorage): CoreResult<Sleep, NotFound | SleepConflict> => {
    const found = sleepFor(sql, id, action.version, "live")
    if (!found.ok) return found
    const deleted = saveSleep(sql, stamp, { ...found.sleep, deletedAt: stamp.now })
    const changed = [...sleepChanges(calendarOf(sql), found.sleep, null, stamp.now), queryKeys.deleted]
    return { ok: true, response: deleted, changed }
  }

export const restoreSleep =
  (stamp: Stamp, id: string, action: VersionedAction) =>
  (sql: SqlStorage): CoreResult<Sleep, Failure> => {
    const found = sleepFor(sql, id, action.version, "deleted")
    if (!found.ok) return found
    const { sleep } = found
    const calendar = calendarOf(sql)
    const invalid = invalidUnless(errorAt("startedAt", timeIssue(calendar, sleep.startedAt, stamp.now)))
    if (invalid !== null) return { ok: false, error: invalid }
    const active = sleep.endedAt === null ? activeSleep(sql) : undefined
    if (active !== undefined) return { ok: false, error: alreadyActive(active) }
    const overlapped = overlappedSleep(sql, sleep, stamp.now, null)
    if (overlapped !== undefined) return { ok: false, error: overlapConflict(overlapped) }
    const restored = saveSleep(sql, stamp, { ...sleep, deletedAt: null })
    return {
      ok: true,
      response: restored,
      changed: [...sleepChanges(calendar, null, restored, stamp.now), queryKeys.deleted],
    }
  }
