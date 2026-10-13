import type { Feed, RecentEntry, Today, Totals } from "@bt/contracts"
import {
  type DiaperChange,
  type Instant,
  type Interval,
  roundTo,
  type StartedFeed,
  totalsIn,
  zonedDayBounds,
} from "@bt/domain"
import type { Author } from "./pending.ts"

export interface Pending extends Author {
  readonly zone: string
}

export interface Change {
  readonly feeds: ReadonlyArray<StartedFeed>
  readonly diapers: ReadonlyArray<DiaperChange>
}

export const NOTHING: Change = { feeds: [], diapers: [] }

export const idOf = (entry: RecentEntry) => (entry.kind === "feed" ? entry.feed.id : entry.diaper.id)

export const timeOf = (entry: RecentEntry) => (entry.kind === "feed" ? entry.feed.startedAt : entry.diaper.occurredAt)

export const versionOf = (entry: RecentEntry) => (entry.kind === "feed" ? entry.feed.version : entry.diaper.version)

export const changeOf = (entry: RecentEntry | null): Change => {
  if (entry === null) return NOTHING
  return entry.kind === "feed" ? { feeds: [entry.feed], diapers: [] } : { feeds: [], diapers: [entry.diaper] }
}

export const without = (recent: ReadonlyArray<RecentEntry>, id: string) => recent.filter((entry) => idOf(entry) !== id)

export const withEntry = (recent: ReadonlyArray<RecentEntry>, entry: RecentEntry) =>
  [...without(recent, idOf(entry)), entry].toSorted((a, b) => timeOf(b) - timeOf(a))

export const later = (current: Feed | null, feed: Feed) =>
  current === null || current.id === feed.id || feed.startedAt >= current.startedAt ? feed : current

const shiftedTotals = (totals: Totals, period: Interval, now: Instant, before: Change, after: Change): Totals => {
  const added = totalsIn(period, after.feeds, after.diapers, now)
  const removed = totalsIn(period, before.feeds, before.diapers, now)
  const sum = (key: keyof Totals) => Math.max(0, roundTo(totals[key] + added[key] - removed[key], 1))
  return {
    feedsStarted: sum("feedsStarted"),
    leftSeconds: sum("leftSeconds"),
    rightSeconds: sum("rightSeconds"),
    nursingSeconds: sum("nursingSeconds"),
    breastMilkMl: sum("breastMilkMl"),
    formulaMl: sum("formulaMl"),
    bottleMl: sum("bottleMl"),
    diapers: sum("diapers"),
    wetDiapers: sum("wetDiapers"),
    dirtyDiapers: sum("dirtyDiapers"),
  }
}

export const shifted = (today: Today, pending: Pending, before: Change, after: Change): Totals =>
  shiftedTotals(today.totals, zonedDayBounds(today.date, pending.zone), pending.now, before, after)

export const withFeed = (today: Today, pending: Pending, feed: Feed, before: Feed | null): Today => ({
  ...today,
  totals: shifted(today, pending, before === null ? NOTHING : { feeds: [before], diapers: [] }, {
    feeds: [feed],
    diapers: [],
  }),
  activeFeed: feed.status === "active" ? feed : today.activeFeed,
  lastFeed: later(today.lastFeed, feed),
  recent: withEntry(today.recent, { kind: "feed", feed }),
})
