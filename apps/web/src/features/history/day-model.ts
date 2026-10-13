import type { DayPeriod, Diaper, Dose, Feed, LocalDate } from "@bt/contracts"
import {
  type CalendarBlock,
  type CalendarPoint,
  type DayGrid,
  type GridScale,
  type Interval,
  layoutDay,
  sessionBounds,
  type Side,
} from "@bt/domain"
import type { Hidden } from "./history-kinds.ts"

export const SCALE: GridScale = { stepMs: 5 * 60_000, minBlockSteps: 4, pointSteps: 5 }

export interface DaySlice {
  readonly date: LocalDate
  readonly bounds: Interval
  readonly feeds: ReadonlyArray<Feed>
  readonly diapers: ReadonlyArray<Diaper>
}

export interface DayPieces {
  readonly blocks: ReadonlyArray<CalendarBlock<Side>>
  readonly bottles: ReadonlyArray<CalendarPoint>
  readonly diapers: ReadonlyArray<CalendarPoint>
}

export type Entry =
  | { readonly kind: "feed"; readonly feed: Feed }
  | { readonly kind: "diaper"; readonly diaper: Diaper }
  | { readonly kind: "dose"; readonly dose: Dose }

export interface DayModel {
  readonly grid: DayGrid<Side>
  readonly entries: ReadonlyMap<string, Entry>
}

const isNursing = (feed: Feed) => feed.segments.length > 0

const endsAsDayBegins = (feed: Feed, { start }: Interval) => sessionBounds(feed)?.endedAt === start

const isBlock = (feed: Feed, bounds: Interval) => isNursing(feed) && !endsAsDayBegins(feed, bounds)

const blockOf = (feed: Feed): ReadonlyArray<CalendarBlock<Side>> => {
  const span = sessionBounds(feed)
  if (span === null) return []
  const bands = feed.segments.map(({ side, startedAt, endedAt }) => ({ kind: side, startedAt, endedAt }))
  return [{ id: feed.id, ...span, bands }]
}

const pointAt = (feed: Feed, bounds: Interval) => (isNursing(feed) ? bounds.start : feed.startedAt)

export const shownSlice = <Slice extends DaySlice>(slice: Slice, hidden: Hidden): Slice => ({
  ...slice,
  feeds: hidden.has("feeds") ? [] : slice.feeds,
  diapers: hidden.has("diapers") ? [] : slice.diapers,
})

export const piecesOf = ({ feeds, diapers, bounds }: DaySlice): DayPieces => ({
  blocks: feeds.filter((feed) => isBlock(feed, bounds)).flatMap(blockOf),
  bottles: feeds.filter((feed) => !isBlock(feed, bounds)).map((feed) => ({ id: feed.id, at: pointAt(feed, bounds) })),
  diapers: diapers.map(({ id, occurredAt }) => ({ id, at: occurredAt })),
})

const entriesOf = (day: DayPeriod): ReadonlyMap<string, Entry> =>
  new Map<string, Entry>([
    ...day.feeds.map((feed) => [feed.id, { kind: "feed", feed }] as const),
    ...day.diapers.map((diaper) => [diaper.id, { kind: "diaper", diaper }] as const),
  ])

export const dayModel = (day: DayPeriod, zone: string, now: number, hidden: Hidden = new Set()): DayModel => {
  const { blocks, bottles, diapers } = piecesOf(shownSlice(day, hidden))
  return {
    grid: layoutDay({ date: day.date, zone, bounds: day.bounds, now, blocks, points: [...bottles, ...diapers] }, SCALE),
    entries: entriesOf(day),
  }
}

export const entriesIn = (model: DayModel, ids: ReadonlyArray<string>): ReadonlyArray<Entry> =>
  ids.flatMap((id) => {
    const entry = model.entries.get(id)
    return entry === undefined ? [] : [entry]
  })

export const isLiveFeed = (entries: ReadonlyArray<Entry>) => {
  const [only] = entries
  return entries.length === 1 && only?.kind === "feed" && only.feed.status === "active"
}

export const editSheetOf = (entry: Entry): "editDiaper" | "editFeed" | "nursing" | "editDose" => {
  if (entry.kind === "diaper") return "editDiaper"
  if (entry.kind === "dose") return "editDose"
  return entry.feed.status === "active" ? "nursing" : "editFeed"
}

export const anchorOf = (model: DayModel): number => {
  if (model.grid.now !== null) return model.grid.now
  const tops = [...model.grid.blocks, ...model.grid.clusters].map(({ top }) => top)
  return tops.length === 0 ? 0 : Math.min(...tops)
}
