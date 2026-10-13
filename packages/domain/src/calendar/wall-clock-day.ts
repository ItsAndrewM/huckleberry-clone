import { utcMidnightOf } from "../time/calendar.ts"
import { DAY_MS, type Instant } from "../time/instant.ts"
import { offsetMsAt } from "../time/zone.ts"
import type { Span } from "../timer/timer.ts"
import type { CalendarBlock } from "./blocks.ts"
import type { DayInput } from "./layout.ts"

const WALL_ZONE = "UTC"

export const onWallClock = <Kind extends string>(day: DayInput<Kind>): DayInput<Kind> => {
  const wall = (at: Instant) => at + offsetMsAt(day.zone, at)
  const onWall = <Item extends Span>(item: Item): Item => {
    const startedAt = wall(item.startedAt)
    const endedAt = item.endedAt === null ? null : Math.max(startedAt, wall(item.endedAt))
    return { ...item, startedAt, endedAt }
  }
  const blockOnWall = (block: CalendarBlock<Kind>): CalendarBlock<Kind> => {
    const own = onWall(block)
    const bands = block.bands.map(onWall)
    const startedAt = Math.min(own.startedAt, ...bands.map((band) => band.startedAt))
    const ends = bands.map((band) => band.endedAt).filter((end): end is number => end !== null)
    const endedAt = own.endedAt === null ? null : Math.max(own.endedAt, ...ends)
    return { ...own, startedAt, endedAt, bands }
  }
  const start = utcMidnightOf(day.date)
  return {
    date: day.date,
    zone: WALL_ZONE,
    bounds: { start, end: start + DAY_MS },
    now: wall(day.now),
    blocks: day.blocks.map(blockOnWall),
    points: day.points.map((point) => ({ ...point, at: wall(point.at) })),
  }
}
