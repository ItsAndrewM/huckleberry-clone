import type { LocalDate } from "@bt/contracts"
import type { HistorySearch } from "./history-date.ts"
import { type Hidden, hideOf } from "./history-kinds.ts"
import {
  firstDateOf,
  type HistoryPeriod,
  type HistoryView,
  holds,
  periodAfter,
  periodBefore,
  periodOf,
} from "./history-period.ts"

export interface HistoryNavigation {
  readonly period: HistoryPeriod
  readonly isCurrent: boolean
  readonly previous: HistorySearch | null
  readonly next: HistorySearch | null
  readonly current: HistorySearch
}

export const shownPeriod = (search: HistorySearch, today: LocalDate): HistoryPeriod => {
  const asked = search.date ?? today
  return periodOf(search.view ?? "day", asked < today ? asked : today)
}

export const searchFor = (period: HistoryPeriod, today: LocalDate, hidden: Hidden): HistorySearch => ({
  view: period.view === "week" ? "week" : undefined,
  date: holds(period, today) ? undefined : firstDateOf(period),
  hide: hideOf(hidden),
})

export const navigationOf = (
  period: HistoryPeriod,
  today: LocalDate,
  birthDate: LocalDate,
  hidden: Hidden,
): HistoryNavigation => ({
  period,
  isCurrent: holds(period, today),
  previous: firstDateOf(period) <= birthDate ? null : searchFor(periodBefore(period), today, hidden),
  next: holds(period, today) ? null : searchFor(periodAfter(period), today, hidden),
  current: searchFor(periodOf(period.view, today), today, hidden),
})

export const viewSearch = (view: HistoryView, from: HistoryPeriod, today: LocalDate, hidden: Hidden) =>
  searchFor(periodOf(view, holds(from, today) ? today : firstDateOf(from)), today, hidden)

export const daySearch = (date: LocalDate, today: LocalDate, hidden: Hidden) =>
  searchFor(periodOf("day", date), today, hidden)
