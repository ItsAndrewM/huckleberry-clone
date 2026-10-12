import type { DayPeriod, Diaper, Feed } from "@bt/contracts"
import {
  type CalendarBlock,
  type CalendarPoint,
  type DayGrid,
  type GridScale,
  layoutDay,
  sessionBounds,
  type Side,
} from "@bt/domain"

export const SCALE: GridScale = { stepMs: 5 * 60_000, minBlockSteps: 4, pointSteps: 5 }

export type Entry =
  | { readonly kind: "feed"; readonly feed: Feed }
  | { readonly kind: "diaper"; readonly diaper: Diaper }

export interface DayModel {
  readonly grid: DayGrid<Side>
  readonly entries: ReadonlyMap<string, Entry>
}

const isNursing = (feed: Feed) => feed.segments.length > 0

const blockOf = (feed: Feed): ReadonlyArray<CalendarBlock<Side>> => {
  const span = sessionBounds(feed)
  if (span === null) return []
  const bands = feed.segments.map(({ side, startedAt, endedAt }) => ({ kind: side, startedAt, endedAt }))
  return [{ id: feed.id, ...span, bands }]
}

const pointsOf = (day: DayPeriod): ReadonlyArray<CalendarPoint> => [
  ...day.feeds.filter((feed) => !isNursing(feed)).map(({ id, startedAt }) => ({ id, at: startedAt })),
  ...day.diapers.map(({ id, occurredAt }) => ({ id, at: occurredAt })),
]

const entriesOf = (day: DayPeriod): ReadonlyMap<string, Entry> =>
  new Map<string, Entry>([
    ...day.feeds.map((feed) => [feed.id, { kind: "feed", feed }] as const),
    ...day.diapers.map((diaper) => [diaper.id, { kind: "diaper", diaper }] as const),
  ])

export const dayModel = (day: DayPeriod, zone: string, now: number): DayModel => ({
  grid: layoutDay(
    {
      date: day.date,
      zone,
      bounds: day.bounds,
      now,
      blocks: day.feeds.filter(isNursing).flatMap(blockOf),
      points: pointsOf(day),
    },
    SCALE,
  ),
  entries: entriesOf(day),
})

export const entriesIn = (model: DayModel, ids: ReadonlyArray<string>): ReadonlyArray<Entry> =>
  ids.flatMap((id) => {
    const entry = model.entries.get(id)
    return entry === undefined ? [] : [entry]
  })

export const isLiveFeed = (entries: ReadonlyArray<Entry>) => {
  const [only] = entries
  return entries.length === 1 && only?.kind === "feed" && only.feed.status === "active"
}

export const anchorOf = (model: DayModel): number => {
  if (model.grid.now !== null) return model.grid.now
  const tops = [...model.grid.blocks, ...model.grid.clusters].map(({ top }) => top)
  return tops.length === 0 ? 0 : Math.min(...tops)
}
