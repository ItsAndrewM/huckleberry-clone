import type { DayPeriod, Diaper, Feed } from "@bt/contracts"
import type { Interval } from "@bt/domain"
import { clockTime, dayClockTime, formatterFor } from "../../clock-time.ts"
import type { Display } from "../today/display.ts"
import { type RecentRow, recentRow } from "../today/recent-rows.ts"
import { type Entry, shownSlice } from "./day-model.ts"
import type { Hidden } from "./history-kinds.ts"

interface Kept {
  readonly feeds: ReadonlyArray<Feed>
  readonly diapers: ReadonlyArray<Diaper>
}

type Listed = Exclude<Entry, { readonly kind: "sleep" }>

const startOf = (entry: Listed) => (entry.kind === "feed" ? entry.feed.startedAt : entry.diaper.occurredAt)

const entriesOf = ({ feeds, diapers }: Kept): ReadonlyArray<Listed> =>
  [
    ...feeds.map((feed) => ({ kind: "feed", feed }) as const),
    ...diapers.map((diaper) => ({ kind: "diaper", diaper }) as const),
  ].toSorted((a, b) => startOf(a) - startOf(b))

const nursedSpan = (entry: Listed): Interval | null => {
  if (entry.kind === "diaper") return null
  const { feed } = entry
  if (feed.status !== "completed" || feed.segments.length === 0 || feed.endedAt === null) return null
  return { start: feed.startedAt, end: feed.endedAt }
}

const within = ({ start, end }: Interval, at: number) => start <= at && at < end

const timeOf = (entry: Listed, day: Interval, { timeZone, locale }: Display) => {
  const at = (instant: number) =>
    within(day, instant) ? clockTime(instant, timeZone, locale) : dayClockTime(instant, timeZone, locale)
  const span = nursedSpan(entry)
  if (span === null) return at(startOf(entry))
  if (within(day, span.start) && within(day, span.end)) {
    return formatterFor("time", timeZone, locale).formatRange(span.start, span.end)
  }
  return `${at(span.start)} – ${at(span.end)}`
}

export const listRows = (day: DayPeriod, display: Display, now: number, hidden: Hidden): ReadonlyArray<RecentRow> =>
  entriesOf(shownSlice(day, hidden)).map((entry) => ({
    ...recentRow(entry, display, now),
    time: timeOf(entry, day.bounds, display),
  }))

export const listNote = (day: DayPeriod, rows: ReadonlyArray<RecentRow>) => {
  if (rows.length > 0) return null
  if (day.feeds.length > 0 || day.diapers.length > 0) return "Nothing shown."
  return day.measurements.length > 0 ? "No feeds or diapers." : null
}
