import {
  addDaysToDate,
  type IsoWeek,
  isoWeekMonday,
  type LocalDate,
  nextMonth,
  utcDateOf,
  type YearMonth,
} from "./calendar.ts"
import type { Instant, Interval } from "./instant.ts"
import { startOfDate } from "./wall-clock.ts"
import { offsetMsAt, type TimeZone } from "./zone.ts"

export const localDateOf = (instant: Instant, zone: TimeZone): LocalDate =>
  utcDateOf(instant + offsetMsAt(zone, instant))

export const zonedDayBounds = (date: LocalDate, zone: TimeZone): Interval => ({
  start: startOfDate(date, zone),
  end: startOfDate(addDaysToDate(date, 1), zone),
})

export const isoWeekBounds = (week: IsoWeek, zone: TimeZone): Interval => {
  const monday = isoWeekMonday(week)
  return { start: startOfDate(monday, zone), end: startOfDate(addDaysToDate(monday, 7), zone) }
}

export const monthBounds = (month: YearMonth, zone: TimeZone): Interval => ({
  start: startOfDate(`${month}-01`, zone),
  end: startOfDate(`${nextMonth(month)}-01`, zone),
})
