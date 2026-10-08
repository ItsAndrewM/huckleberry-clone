import {
  datesBetween,
  type IsoWeek,
  isoWeekOfDate,
  type LocalDate,
  monthOfDate,
  type YearMonth,
} from "../time/calendar.ts"
import type { Interval } from "../time/instant.ts"
import type { TimeZone } from "../time/zone.ts"
import { localDateOf } from "../time/zoned.ts"

export type PeriodKey = readonly ["day", LocalDate] | readonly ["week", IsoWeek] | readonly ["month", YearMonth]

const datesTouched = (interval: Interval, zone: TimeZone): LocalDate[] =>
  datesBetween(localDateOf(interval.start, zone), localDateOf(Math.max(interval.start, interval.end - 1), zone))

export const affectedPeriods = (before: Interval | null, after: Interval | null, zone: TimeZone): PeriodKey[] => {
  const intervals = [before, after].filter((interval) => interval !== null)
  const dates = [...new Set(intervals.flatMap((interval) => datesTouched(interval, zone)))].sort()
  const weeks = [...new Set(dates.map(isoWeekOfDate))]
  const months = [...new Set(dates.map(monthOfDate))]
  return [
    ...dates.map((date) => ["day", date] as const),
    ...weeks.map((week) => ["week", week] as const),
    ...months.map((month) => ["month", month] as const),
  ]
}
