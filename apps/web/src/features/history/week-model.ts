import type { LocalDate, Measurement, Totals, WeekPeriod } from "@bt/contracts"
import {
  type DayGrid,
  feedTouches,
  type GridScale,
  hasEntries,
  type Interval,
  layoutDay,
  onWallClock,
  type PlacedBlock,
  type PlacedCluster,
  type Side,
  sleepTouches,
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
  readonly sleeps: ReadonlyArray<PlacedBlock<Side>>
  readonly measured: boolean
  readonly logged: boolean
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
    const feeds = week.feeds.filter((feed) => feedTouches(bounds, feed, context.now))
    const sleeps = week.sleeps.filter((sleep) => sleepTouches(bounds, sleep, context.now))
    const slice = shownSlice({ date, bounds, feeds, diapers: week.diapers, sleeps }, context.hidden)
    const { blocks, bottles, diapers, sleeps: slept } = piecesOf(slice)
    const day = { date, zone: context.zone, bounds, now: context.now, blocks, points: bottles }
    const weighed = measuredIn(week.measurements, bounds)
    return {
      date,
      opens: context.birthDate <= date && date <= context.today,
      isToday: date === context.today,
      grid: layoutDay(onWallClock(day), WEEK_SCALE),
      diapers: layoutDay(onWallClock({ ...day, blocks: [], points: diapers }), WEEK_SCALE).clusters,
      sleeps: layoutDay(onWallClock({ ...day, blocks: slept, points: [] }), WEEK_SCALE).blocks,
      measured: !context.hidden.has("growth") && weighed,
      logged: hasEntries(totals) || weighed,
      totals,
    }
  })
