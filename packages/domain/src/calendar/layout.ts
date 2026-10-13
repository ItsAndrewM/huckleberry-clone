import { contains } from "../interval/interval.ts"
import type { LocalDate } from "../time/calendar.ts"
import type { Instant, Interval } from "../time/instant.ts"
import type { TimeZone } from "../time/zone.ts"
import { type CalendarBlock, type PlacedBlock, placeBlocks } from "./blocks.ts"
import { type CalendarPoint, clusterPoints, type PlacedCluster } from "./clusters.ts"
import { type HourRow, hourRows } from "./hours.ts"
import { type GridScale, stepAt, stepsIn } from "./steps.ts"

export interface DayInput<Kind extends string> {
  readonly date: LocalDate
  readonly zone: TimeZone
  readonly bounds: Interval
  readonly now: Instant
  readonly blocks: ReadonlyArray<CalendarBlock<Kind>>
  readonly points: ReadonlyArray<CalendarPoint>
}

export interface DayGrid<Kind extends string> {
  readonly steps: number
  readonly hours: ReadonlyArray<HourRow>
  readonly blocks: ReadonlyArray<PlacedBlock<Kind>>
  readonly clusters: ReadonlyArray<PlacedCluster>
  readonly now: number | null
}

export const layoutDay = <Kind extends string>(input: DayInput<Kind>, scale: GridScale): DayGrid<Kind> => {
  const { bounds, now } = input
  const placing = { bounds, now, scale, steps: stepsIn(bounds, scale.stepMs) }
  return {
    steps: placing.steps,
    hours: hourRows(input.date, input.zone, placing),
    blocks: placeBlocks(input.blocks, placing),
    clusters: clusterPoints(input.points, placing),
    now: contains(bounds, now) ? stepAt(bounds, scale.stepMs, now) : null,
  }
}
