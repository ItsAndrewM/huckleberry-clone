import type { DayPeriod, MonthPeriod, WeekPeriod } from "@bt/contracts"
import {
  type Instant,
  type Interval,
  type IsoWeek,
  isoWeekBounds,
  isoWeekDates,
  type LocalDate,
  monthBounds,
  monthDates,
  sumTotals,
  type TimeZone,
  totalsByDay,
  type YearMonth,
  zonedDayBounds,
} from "@bt/domain"
import { calendarOf } from "./calendar.ts"
import { liveDiapersIn } from "./diapers.ts"
import { liveFeedsTouching } from "./feeds/reads.ts"
import { liveMeasurementsIn } from "./growth.ts"

const read = (sql: SqlStorage, zone: TimeZone, bounds: Interval, dates: ReadonlyArray<LocalDate>, now: Instant) => {
  const feeds = liveFeedsTouching(sql, bounds, now)
  const diapers = liveDiapersIn(sql, bounds)
  const days = totalsByDay(dates, zone, { feeds, diapers, sleeps: [] }, now)
  const totals = sumTotals(days.map((day) => day.totals))
  return { days, period: { bounds, asOf: now, totals, feeds, diapers, measurements: liveMeasurementsIn(sql, bounds) } }
}

export const dayOf = (sql: SqlStorage, date: LocalDate, now: Instant): DayPeriod => {
  const { zone } = calendarOf(sql)
  return { date, ...read(sql, zone, zonedDayBounds(date, zone), [date], now).period }
}

export const weekOf = (sql: SqlStorage, week: IsoWeek, now: Instant): WeekPeriod => {
  const { zone } = calendarOf(sql)
  const { days, period } = read(sql, zone, isoWeekBounds(week, zone), isoWeekDates(week), now)
  return { week, ...period, days }
}

export const monthOf = (sql: SqlStorage, month: YearMonth, now: Instant): MonthPeriod => {
  const { zone } = calendarOf(sql)
  const { days, period } = read(sql, zone, monthBounds(month, zone), monthDates(month), now)
  return { month, ...period, days }
}
