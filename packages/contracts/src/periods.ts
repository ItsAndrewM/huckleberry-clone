import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Diaper } from "./diapers.ts"
import { Feed } from "./feeds.ts"
import { Measurement } from "./growth.ts"
import { Instant, IsoWeek, LocalDate, YearMonth } from "./time.ts"
import { Totals } from "./today.ts"

export const PeriodBounds = Schema.Struct({ start: Schema.Int, end: Schema.Int })
export type PeriodBounds = typeof PeriodBounds.Type

export const DayTotals = Schema.Struct({ date: LocalDate, bounds: PeriodBounds, totals: Totals })
export type DayTotals = typeof DayTotals.Type

const records = {
  feeds: Schema.Array(Feed),
  diapers: Schema.Array(Diaper),
  measurements: Schema.Array(Measurement),
}

export const DayPeriod = Schema.Struct({
  date: LocalDate,
  bounds: PeriodBounds,
  asOf: Instant,
  totals: Totals,
  ...records,
})
export type DayPeriod = typeof DayPeriod.Type

export const WeekPeriod = Schema.Struct({
  week: IsoWeek,
  bounds: PeriodBounds,
  asOf: Instant,
  totals: Totals,
  days: Schema.Array(DayTotals),
  ...records,
})
export type WeekPeriod = typeof WeekPeriod.Type

export const MonthPeriod = Schema.Struct({
  month: YearMonth,
  bounds: PeriodBounds,
  asOf: Instant,
  totals: Totals,
  days: Schema.Array(DayTotals),
  ...records,
})
export type MonthPeriod = typeof MonthPeriod.Type

export class PeriodsGroup extends HttpApiGroup.make("periods")
  .add(HttpApiEndpoint.get("day", "/days/:date", { params: { date: LocalDate }, success: DayPeriod }))
  .add(HttpApiEndpoint.get("week", "/weeks/:week", { params: { week: IsoWeek }, success: WeekPeriod }))
  .add(HttpApiEndpoint.get("month", "/months/:month", { params: { month: YearMonth }, success: MonthPeriod })) {}
