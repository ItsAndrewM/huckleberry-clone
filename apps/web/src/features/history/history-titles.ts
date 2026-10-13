import { dayTitle, weekTitle } from "./history-date.ts"
import { firstDateOf, type HistoryPeriod, type HistoryView, lastDateOf } from "./history-period.ts"

const CURRENT = { day: "Today", week: "This week" } as const satisfies Record<HistoryView, string>

export const periodTitle = (period: HistoryPeriod, locale?: string) =>
  period.view === "day" ? dayTitle(period.date, locale) : weekTitle(firstDateOf(period), lastDateOf(period), locale)

export const currentLabel = (view: HistoryView) => CURRENT[view]

export const backLabel = (view: HistoryView) => `Back to ${CURRENT[view].toLowerCase()}`
