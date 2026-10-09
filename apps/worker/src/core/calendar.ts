import { type Changed, queryKeys } from "@bt/contracts"
import {
  affectedPeriods,
  type Instant,
  type Interval,
  type LocalDate,
  type TimeZone,
  type ValidationIssue,
  validateNotBeforeBirth,
  validateNotInFuture,
} from "@bt/domain"

export interface Calendar {
  readonly zone: TimeZone
  readonly birthDate: LocalDate
}

export const calendarOf = (sql: SqlStorage): Calendar => {
  const { time_zone, birth_date } = sql
    .exec<{ time_zone: string; birth_date: string }>("SELECT time_zone, birth_date FROM household, child")
    .one()
  return { zone: time_zone, birthDate: birth_date }
}

export const timeIssue = (calendar: Calendar, at: Instant, now: Instant): ValidationIssue | null =>
  validateNotInFuture(at, now) ?? validateNotBeforeBirth(at, calendar.birthDate, calendar.zone)

export const changedKeys = (calendar: Calendar, before: Interval | null, after: Interval | null): Changed => [
  queryKeys.today,
  queryKeys.last24h,
  ...affectedPeriods(before, after, calendar.zone),
]
