import { LocalDate } from "@bt/contracts"
import { flow, Option, Schema } from "effect"
import {
  firstDateOf,
  holds,
  periodAfter,
  periodBefore,
  periodOf,
  type TrendsPeriod,
  type TrendsView,
} from "./trends-period.ts"

export interface TrendsSearch {
  readonly view?: "day" | "month" | undefined
  readonly date?: LocalDate | undefined
}

export interface TrendsNavigation {
  readonly period: TrendsPeriod
  readonly isCurrent: boolean
  readonly previous: TrendsSearch | null
  readonly next: TrendsSearch | null
  readonly current: TrendsSearch
}

export const viewInTrends = flow(Schema.decodeUnknownOption(Schema.Literals(["day", "month"])), Option.getOrUndefined)

export const dateInTrends = flow(Schema.decodeUnknownOption(LocalDate), Option.getOrUndefined)

const clamp = (date: LocalDate, earliest: LocalDate, latest: LocalDate) => {
  if (date > latest) return latest
  return date < earliest ? earliest : date
}

export const shownPeriod = (search: TrendsSearch, today: LocalDate, birthDate: LocalDate): TrendsPeriod =>
  periodOf(search.view ?? "week", clamp(search.date ?? today, birthDate, today))

export const searchFor = (period: TrendsPeriod, today: LocalDate): TrendsSearch => {
  const view = period.view === "week" ? {} : { view: period.view }
  return holds(period, today) ? view : { ...view, date: firstDateOf(period) }
}

export const navigationOf = (period: TrendsPeriod, today: LocalDate, birthDate: LocalDate): TrendsNavigation => ({
  period,
  isCurrent: holds(period, today),
  previous: firstDateOf(period) <= birthDate ? null : searchFor(periodBefore(period), today),
  next: holds(period, today) ? null : searchFor(periodAfter(period), today),
  current: searchFor(periodOf(period.view, today), today),
})

export const viewSearch = (
  view: TrendsView,
  from: TrendsPeriod,
  today: LocalDate,
  birthDate: LocalDate,
  picked: LocalDate | null,
) => {
  const anchor = picked ?? (holds(from, today) ? today : firstDateOf(from))
  return searchFor(periodOf(view, clamp(anchor, birthDate, today)), today)
}
