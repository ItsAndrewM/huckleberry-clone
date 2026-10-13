import { dayTitle, weekTitle } from "./history-date.ts"
import {
  firstDateOf,
  type HistoryPeriod,
  type HistoryUnit,
  type HistoryView,
  lastDateOf,
  unitOf,
} from "./history-period.ts"

const CURRENT = { day: "Today", week: "This week" } as const satisfies Record<HistoryUnit, string>

export const periodTitle = (period: HistoryPeriod, locale?: string) =>
  period.view === "week" ? weekTitle(firstDateOf(period), lastDateOf(period), locale) : dayTitle(period.date, locale)

export const currentLabel = (view: HistoryView) => CURRENT[unitOf(view)]

export const backLabel = (view: HistoryView) => `Back to ${CURRENT[unitOf(view)].toLowerCase()}`
