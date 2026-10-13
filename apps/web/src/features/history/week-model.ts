import type { LocalDate, Measurement, Totals, WeekPeriod } from "@bt/contracts"
import {
  type DayGrid,
  type GridScale,
  type Interval,
  layoutDay,
  onWallClock,
  type PlacedCluster,
  type Side,
} from "@bt/domain"
import { piecesOf, shownSlice } from "./day-model.ts"
import type { Hidden } from "./history-kinds.ts"

export const WEEK_SCALE: GridScale = { stepMs: 10 * 60_000, minBlockSteps: 2, pointSteps: 2 }

export interface WeekColumn {
  readonly date: LocalDate
  readonly opens: boolean
  readonly isToday: boolean
  readonly grid: DayGrid<Side>
  readonly diapers: ReadonlyArray<PlacedCluster>
  readonly measured: boolean
  readonly totals: Totals
}

export interface WeekContext {
  readonly zone: string
  readonly now: number
  readonly today: LocalDate
  readonly birthDate: LocalDate
  readonly hidden: Hidden
}

const measuredIn = (measurements: ReadonlyArray<Measurement>, { start, end }: Interval) =>
  measurements.some(({ measuredAt }) => start <= measuredAt && measuredAt < end)

export const weekModel = (week: WeekPeriod, context: WeekContext): ReadonlyArray<WeekColumn> =>
  week.days.map(({ date, bounds, totals }) => {
    const slice = shownSlice({ date, bounds, feeds: week.feeds, diapers: week.diapers }, context.hidden)
    const { blocks, bottles, diapers } = piecesOf(slice)
    const day = { date, zone: context.zone, bounds, now: context.now, blocks, points: bottles }
    return {
      date,
      opens: context.birthDate <= date && date <= context.today,
      isToday: date === context.today,
      grid: layoutDay(onWallClock(day), WEEK_SCALE),
      diapers: layoutDay(onWallClock({ ...day, blocks: [], points: diapers }), WEEK_SCALE).clusters,
      measured: !context.hidden.has("growth") && measuredIn(week.measurements, bounds),
      totals,
    }
  })
