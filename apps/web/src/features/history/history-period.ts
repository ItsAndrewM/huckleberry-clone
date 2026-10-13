import type { IsoWeek, LocalDate } from "@bt/contracts"
import { addDaysToDate, isoWeekMonday, isoWeekOfDate } from "@bt/domain"

export type HistoryView = "day" | "week" | "list"

export type HistoryUnit = "day" | "week"

export type HistoryPeriod =
  | { readonly view: "day" | "list"; readonly date: LocalDate }
  | { readonly view: "week"; readonly week: IsoWeek }

export const unitOf = (view: HistoryView): HistoryUnit => (view === "week" ? "week" : "day")

export const periodOf = (view: HistoryView, date: LocalDate): HistoryPeriod =>
  view === "week" ? { view, week: isoWeekOfDate(date) } : { view, date }

export const firstDateOf = (period: HistoryPeriod): LocalDate =>
  period.view === "week" ? isoWeekMonday(period.week) : period.date

export const lastDateOf = (period: HistoryPeriod): LocalDate =>
  period.view === "week" ? addDaysToDate(isoWeekMonday(period.week), 6) : period.date

export const holds = (period: HistoryPeriod, date: LocalDate) =>
  firstDateOf(period) <= date && date <= lastDateOf(period)

export const periodBefore = (period: HistoryPeriod): HistoryPeriod =>
  periodOf(period.view, addDaysToDate(firstDateOf(period), -1))

export const periodAfter = (period: HistoryPeriod): HistoryPeriod =>
  periodOf(period.view, addDaysToDate(lastDateOf(period), 1))

export const periodKey = (period: HistoryPeriod) => `${period.view}:${firstDateOf(period)}`
