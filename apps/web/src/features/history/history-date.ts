import { LocalDate } from "@bt/contracts"
import { flow, Option, Schema } from "effect"

export interface HistorySearch {
  readonly view?: "week" | undefined
  readonly date?: LocalDate | undefined
  readonly hide?: string | undefined
}

const decodeDate = Schema.decodeUnknownOption(LocalDate)

export const dateInSearch = flow(decodeDate, Option.getOrUndefined)

export const viewInSearch = flow(Schema.decodeUnknownOption(Schema.Literals(["week"])), Option.getOrUndefined)

const DATE_EDIT_KEY = /^(\d|ArrowUp|ArrowDown|Backspace|Delete)$/u

export const editsDateText = (key: string) => DATE_EDIT_KEY.test(key)

export const pickedDate = (value: string, earliest: LocalDate, latest: LocalDate): LocalDate | undefined => {
  const date = dateInSearch(value)
  return date !== undefined && earliest <= date && date <= latest ? date : undefined
}

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
