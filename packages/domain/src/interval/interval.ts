import { addDaysToDate, type LocalDate } from "../time/calendar.ts"
import type { Instant, Interval } from "../time/instant.ts"
import type { TimeZone } from "../time/zone.ts"
import { localDateOf, zonedDayBounds } from "../time/zoned.ts"

export interface DayPiece {
  readonly date: LocalDate
  readonly interval: Interval
}

export const durationMs = (interval: Interval): number => interval.end - interval.start

export const overlaps = (a: Interval, b: Interval): boolean => Math.max(a.start, b.start) < Math.min(a.end, b.end)

export const clipTo = (interval: Interval, period: Interval): Interval | null => {
  const start = Math.max(interval.start, period.start)
  const end = Math.min(interval.end, period.end)
  return start < end ? { start, end } : null
}

export const splitByDays = (interval: Interval, zone: TimeZone): DayPiece[] => {
  if (!Number.isFinite(interval.end))
    throw new RangeError(`Expected a finite end; close a running session at now first, got ${interval.end}`)
  const pieces: DayPiece[] = []
  let date = localDateOf(interval.start, zone)
  let cursor: Instant = interval.start
  while (cursor < interval.end) {
    const end = Math.min(zonedDayBounds(date, zone).end, interval.end)
    pieces.push({ date, interval: { start: cursor, end } })
    cursor = end
    date = addDaysToDate(date, 1)
  }
  return pieces
}
