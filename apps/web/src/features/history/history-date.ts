import { LocalDate } from "@bt/contracts"
import { addDaysToDate } from "@bt/domain"
import { flow, Option, Schema } from "effect"

export interface HistorySearch {
  readonly view?: "week" | undefined
  readonly date?: LocalDate | undefined
  readonly hide?: string | undefined
}

export interface DayNavigation {
  readonly date: LocalDate
  readonly isToday: boolean
  readonly previous: HistorySearch | null
  readonly next: HistorySearch | null
}

const decodeDate = Schema.decodeUnknownOption(LocalDate)

export const dateInSearch = flow(decodeDate, Option.getOrUndefined)

export const viewInSearch = flow(Schema.decodeUnknownOption(Schema.Literals(["week"])), Option.getOrUndefined)

export const shownDate = (asked: LocalDate | undefined, today: LocalDate): LocalDate =>
  asked !== undefined && asked < today ? asked : today

const searchFor = (date: LocalDate, today: LocalDate): HistorySearch => (date === today ? {} : { date })

export const navigationOf = (date: LocalDate, today: LocalDate, birthDate: LocalDate): DayNavigation => ({
  date,
  isToday: date === today,
  previous: date > birthDate ? searchFor(addDaysToDate(date, -1), today) : null,
  next: date < today ? searchFor(addDaysToDate(date, 1), today) : null,
})

const noonOf = (date: LocalDate) => Date.parse(`${date}T12:00:00Z`)

const formatIn = (locale: string | undefined, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" })

export const dayTitle = (date: LocalDate, locale?: string) =>
  formatIn(locale, { weekday: "short", month: "short", day: "numeric" }).format(noonOf(date))

export const weekTitle = (monday: LocalDate, sunday: LocalDate, locale?: string) =>
  formatIn(locale, { month: "short", day: "numeric" }).formatRange(noonOf(monday), noonOf(sunday))

export const weekdayOf = (date: LocalDate, locale?: string) =>
  formatIn(locale, { weekday: "short" }).format(noonOf(date))

export const dayOfMonth = (date: LocalDate) => Number(date.slice(8, 10))
