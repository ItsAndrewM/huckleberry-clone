import type { IsoWeek, LocalDate, YearMonth } from "@bt/contracts"
import { addDaysToDate, isoWeekMonday, isoWeekOfDate, monthOfDate, nextMonth } from "@bt/domain"

export type TrendsView = "day" | "week" | "month"

export type TrendsPeriod =
  | { readonly view: "day"; readonly date: LocalDate }
  | { readonly view: "week"; readonly week: IsoWeek }
  | { readonly view: "month"; readonly month: YearMonth }

export const periodOf = (view: TrendsView, date: LocalDate): TrendsPeriod => {
  if (view === "day") return { view, date }
  return view === "week" ? { view, week: isoWeekOfDate(date) } : { view, month: monthOfDate(date) }
}

export const firstDateOf = (period: TrendsPeriod): LocalDate => {
  if (period.view === "day") return period.date
  return period.view === "week" ? isoWeekMonday(period.week) : `${period.month}-01`
}

export const lastDateOf = (period: TrendsPeriod): LocalDate => {
  if (period.view === "day") return period.date
  return period.view === "week"
    ? addDaysToDate(isoWeekMonday(period.week), 6)
    : addDaysToDate(`${nextMonth(period.month)}-01`, -1)
}

export const holds = (period: TrendsPeriod, date: LocalDate) =>
  firstDateOf(period) <= date && date <= lastDateOf(period)

export const periodBefore = (period: TrendsPeriod): TrendsPeriod =>
  periodOf(period.view, addDaysToDate(firstDateOf(period), -1))

export const periodAfter = (period: TrendsPeriod): TrendsPeriod =>
  periodOf(period.view, addDaysToDate(lastDateOf(period), 1))

export const periodId = (period: TrendsPeriod) => `${period.view}:${firstDateOf(period)}`
