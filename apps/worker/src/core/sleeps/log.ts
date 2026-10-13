import type { InvalidInput, NewSleep, Sleep, SleepConflict } from "@bt/contracts"
import { calendarOf } from "../calendar.ts"
import { invalidUnless } from "../fields.ts"
import type { CoreResult, Stamp } from "../receipts.ts"
import { overlapConflict, overlappedSleep, savedSleep, timesErrors } from "./rules.ts"
import { createSleep } from "./store.ts"

export const logSleep =
  (stamp: Stamp, entry: NewSleep) =>
  (sql: SqlStorage): CoreResult<Sleep, InvalidInput | SleepConflict> => {
    const calendar = calendarOf(sql)
    const invalid = invalidUnless(timesErrors(calendar, entry, stamp.now, null))
    if (invalid !== null) return { ok: false, error: invalid }
    const overlapped = overlappedSleep(sql, entry, stamp.now, null)
    if (overlapped !== undefined) return { ok: false, error: overlapConflict(overlapped) }
    const times = { kind: entry.kind, startedAt: entry.startedAt, endedAt: entry.endedAt }
    return savedSleep(calendar, null, createSleep(sql, stamp, times), stamp.now)
  }
