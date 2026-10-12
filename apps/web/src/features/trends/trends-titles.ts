import type { LocalDate } from "@bt/contracts"
import { firstDateOf, lastDateOf, type TrendsPeriod, type TrendsView } from "./trends-period.ts"

const CURRENT = { day: "Today", week: "This week", month: "This month" } as const satisfies Record<TrendsView, string>

const noonOf = (date: LocalDate) => Date.parse(`${date}T12:00:00Z`)

const formatIn = (locale: string | undefined, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" })

export const dayName = (date: LocalDate, locale?: string) =>
  formatIn(locale, { weekday: "short", month: "short", day: "numeric" }).format(noonOf(date))

export const weekdayOf = (date: LocalDate, locale?: string) =>
  formatIn(locale, { weekday: "short" }).format(noonOf(date))

export const periodTitle = (period: TrendsPeriod, locale?: string) => {
  if (period.view === "day") return dayName(period.date, locale)
  if (period.view === "month")
    return formatIn(locale, { month: "long", year: "numeric" }).format(noonOf(firstDateOf(period)))
  return formatIn(locale, { month: "short", day: "numeric" }).formatRange(
    noonOf(firstDateOf(period)),
    noonOf(lastDateOf(period)),
  )
}

export const currentLabel = (view: TrendsView) => `${CURRENT[view]}, so far`

export const backLabel = (view: TrendsView) => `Back to ${CURRENT[view].toLowerCase()}`
