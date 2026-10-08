import { canonicalTimeZone, isIsoWeek, isLocalDate, isYearMonth } from "@bt/domain"
import { Schema } from "effect"

const FIRST_INSTANT = Date.UTC(2000, 0, 1)
const INSTANT_LIMIT = Date.UTC(2100, 0, 1)
const FIRST_CALENDAR_YEAR = 1999
const LAST_CALENDAR_YEAR = 2100

const inCalendarYears = (value: string) => {
  const year = Number(value.slice(0, 4))
  return year >= FIRST_CALENDAR_YEAR && year <= LAST_CALENDAR_YEAR
}

const calendarString = (isReal: (value: string) => boolean, example: string) =>
  Schema.String.check(
    Schema.makeFilter((value: string) => isReal(value) && inCalendarYears(value), {
      expected: `${example} from ${FIRST_CALENDAR_YEAR} to ${LAST_CALENDAR_YEAR}`,
    }),
  )

export const Instant = Schema.Int.check(Schema.isGreaterThanOrEqualTo(FIRST_INSTANT), Schema.isLessThan(INSTANT_LIMIT))
export type Instant = typeof Instant.Type

export const LocalDate = calendarString(isLocalDate, "a date like 2026-10-06")
export type LocalDate = typeof LocalDate.Type

export const IsoWeek = calendarString(isIsoWeek, "an ISO week like 2026-W41")
export type IsoWeek = typeof IsoWeek.Type

export const YearMonth = calendarString(isYearMonth, "a month like 2026-10")
export type YearMonth = typeof YearMonth.Type

export const TimeZone = Schema.String.check(
  Schema.makeFilter((name: string) => canonicalTimeZone(name) !== null, {
    expected: "an IANA time zone like America/Vancouver",
  }),
)
export type TimeZone = typeof TimeZone.Type
