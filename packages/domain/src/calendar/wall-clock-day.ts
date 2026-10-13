import { utcMidnightOf } from "../time/calendar.ts"
import { DAY_MS, type Instant } from "../time/instant.ts"
import { offsetMsAt } from "../time/zone.ts"
import type { Span } from "../timer/timer.ts"
import type { DayInput } from "./layout.ts"

const WALL_ZONE = "UTC"

export const onWallClock = <Kind extends string>(day: DayInput<Kind>): DayInput<Kind> => {
  const wall = (at: Instant) => at + offsetMsAt(day.zone, at)
  const onWall = <Item extends Span>(item: Item): Item => {
    const startedAt = wall(item.startedAt)
    const endedAt = item.endedAt === null ? null : Math.max(startedAt, wall(item.endedAt))
    return { ...item, startedAt, endedAt }
  }
  const start = utcMidnightOf(day.date)
  return {
    date: day.date,
    zone: WALL_ZONE,
    bounds: { start, end: start + DAY_MS },
    now: wall(day.now),
    blocks: day.blocks.map((block) => ({ ...onWall(block), bands: block.bands.map(onWall) })),
    points: day.points.map((point) => ({ ...point, at: wall(point.at) })),
  }
}
