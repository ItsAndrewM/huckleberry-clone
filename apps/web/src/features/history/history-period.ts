import type { IsoWeek, LocalDate } from "@bt/contracts"
import { addDaysToDate, isoWeekMonday, isoWeekOfDate } from "@bt/domain"

export type HistoryView = "day" | "week"

export type HistoryPeriod =
  | { readonly view: "day"; readonly date: LocalDate }
  | { readonly view: "week"; readonly week: IsoWeek }

export const periodOf = (view: HistoryView, date: LocalDate): HistoryPeriod =>
  view === "day" ? { view, date } : { view, week: isoWeekOfDate(date) }

export const firstDateOf = (period: HistoryPeriod): LocalDate =>
  period.view === "day" ? period.date : isoWeekMonday(period.week)

export const lastDateOf = (period: HistoryPeriod): LocalDate =>
  period.view === "day" ? period.date : addDaysToDate(isoWeekMonday(period.week), 6)

export const holds = (period: HistoryPeriod, date: LocalDate) =>
  firstDateOf(period) <= date && date <= lastDateOf(period)

export const periodBefore = (period: HistoryPeriod): HistoryPeriod =>
  periodOf(period.view, addDaysToDate(firstDateOf(period), -1))

export const periodAfter = (period: HistoryPeriod): HistoryPeriod =>
  periodOf(period.view, addDaysToDate(lastDateOf(period), 1))

export const periodKey = (period: HistoryPeriod) => `${period.view}:${firstDateOf(period)}`
