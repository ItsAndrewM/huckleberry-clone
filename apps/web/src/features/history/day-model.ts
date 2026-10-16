import type { DayPeriod, Diaper, Dose, Feed, LocalDate, RecentEntry, Sleep } from "@bt/contracts"
import {
  type CalendarBlock,
  type CalendarPoint,
  type DayGrid,
  type GridScale,
  type Interval,
  layoutDay,
  type PlacedBlock,
  sessionBounds,
  type Side,
} from "@bt/domain"
import type { Hidden } from "./history-kinds.ts"

export const SCALE: GridScale = { stepMs: 5 * 60_000, minBlockSteps: 5, pointSteps: 5 }

export interface DaySlice {
  readonly date: LocalDate
  readonly bounds: Interval
  readonly feeds: ReadonlyArray<Feed>
  readonly diapers: ReadonlyArray<Diaper>
  readonly sleeps: ReadonlyArray<Sleep>
  readonly doses: ReadonlyArray<Dose>
}

export interface DayPieces {
  readonly blocks: ReadonlyArray<CalendarBlock<Side>>
  readonly bottles: ReadonlyArray<CalendarPoint>
  readonly diapers: ReadonlyArray<CalendarPoint>
  readonly sleeps: ReadonlyArray<CalendarBlock<Side>>
  readonly doses: ReadonlyArray<CalendarPoint>
}

export type Entry = RecentEntry

export interface DayModel {
  readonly date: LocalDate
  readonly grid: DayGrid<Side>
  readonly sleeps: ReadonlyArray<PlacedBlock<Side>>
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
  sleeps: hidden.has("sleep") ? [] : slice.sleeps,
  doses: hidden.has("supplements") ? [] : slice.doses,
})

const sleepBlockOf = ({ id, startedAt, endedAt }: Sleep): CalendarBlock<Side> => ({ id, startedAt, endedAt, bands: [] })

export const piecesOf = ({ feeds, diapers, sleeps, doses, bounds }: DaySlice): DayPieces => ({
  blocks: feeds.filter((feed) => isBlock(feed, bounds)).flatMap(blockOf),
  bottles: feeds.filter((feed) => !isBlock(feed, bounds)).map((feed) => ({ id: feed.id, at: pointAt(feed, bounds) })),
  diapers: diapers.map(({ id, occurredAt }) => ({ id, at: occurredAt })),
  sleeps: sleeps.map(sleepBlockOf),
  doses: doses.map(({ id, occurredAt }) => ({ id, at: occurredAt })),
})

const entriesOf = (day: DayPeriod): ReadonlyMap<string, Entry> =>
  new Map<string, Entry>([
    ...day.feeds.map((feed) => [feed.id, { kind: "feed", feed }] as const),
    ...day.diapers.map((diaper) => [diaper.id, { kind: "diaper", diaper }] as const),
    ...day.sleeps.map((sleep) => [sleep.id, { kind: "sleep", sleep }] as const),
    ...day.doses.map((dose) => [dose.id, { kind: "dose", dose }] as const),
  ])

export const dayModel = (day: DayPeriod, zone: string, now: number, hidden: Hidden = new Set()): DayModel => {
  const { blocks, bottles, diapers, sleeps, doses } = piecesOf(shownSlice(day, hidden))
  const input = { date: day.date, zone, bounds: day.bounds, now }
  return {
    date: day.date,
    grid: layoutDay({ ...input, blocks, points: [...bottles, ...diapers, ...doses] }, SCALE),
    sleeps: layoutDay({ ...input, blocks: sleeps, points: [] }, SCALE).blocks,
    entries: entriesOf(day),
  }
}

export const entriesIn = (model: DayModel, ids: ReadonlyArray<string>): ReadonlyArray<Entry> =>
  ids.flatMap((id) => {
    const entry = model.entries.get(id)
    return entry === undefined ? [] : [entry]
  })

export type EntrySheet = "editDiaper" | "editFeed" | "nursing" | "editSleep" | "sleep" | "editDose"

export const editSheetOf = (entry: Entry): EntrySheet => {
  switch (entry.kind) {
    case "diaper":
      return "editDiaper"
    case "feed":
      return entry.feed.status === "active" ? "nursing" : "editFeed"
    case "sleep":
      return entry.sleep.endedAt === null ? "sleep" : "editSleep"
    case "dose":
      return "editDose"
  }
}

const RUNNING_SHEETS = new Set<EntrySheet>(["nursing", "sleep"])

export const runningSheetOf = (entries: ReadonlyArray<Entry>): EntrySheet | null => {
  const [only] = entries
  if (entries.length !== 1 || only === undefined) return null
  const sheet = editSheetOf(only)
  return RUNNING_SHEETS.has(sheet) ? sheet : null
}

export const anchorOf = (model: DayModel): number => {
  if (model.grid.now !== null) return model.grid.now
  const tops = [...model.grid.blocks, ...model.grid.clusters, ...model.sleeps].map(({ top }) => top)
  return tops.length === 0 ? 0 : Math.min(...tops)
}
