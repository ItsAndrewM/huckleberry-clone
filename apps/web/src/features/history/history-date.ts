import { LocalDate } from "@bt/contracts"
import { addDaysToDate } from "@bt/domain"
import { flow, Option, Schema } from "effect"

export interface HistorySearch {
  readonly date?: LocalDate | undefined
}

export interface DayNavigation {
  readonly date: LocalDate
  readonly isToday: boolean
  readonly previous: HistorySearch | null
  readonly next: HistorySearch | null
}

const decodeDate = Schema.decodeUnknownOption(LocalDate)

export const dateInSearch = flow(decodeDate, Option.getOrUndefined)

export const shownDate = (asked: LocalDate | undefined, today: LocalDate): LocalDate =>
  asked !== undefined && asked < today ? asked : today

const searchFor = (date: LocalDate, today: LocalDate): HistorySearch => (date === today ? {} : { date })

export const navigationOf = (date: LocalDate, today: LocalDate, birthDate: LocalDate): DayNavigation => ({
  date,
  isToday: date === today,
  previous: date > birthDate ? searchFor(addDaysToDate(date, -1), today) : null,
  next: date < today ? searchFor(addDaysToDate(date, 1), today) : null,
})

export const dayTitle = (date: LocalDate, locale?: string) =>
  new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    Date.parse(`${date}T12:00:00Z`),
  )
