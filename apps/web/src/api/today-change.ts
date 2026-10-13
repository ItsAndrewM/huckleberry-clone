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

export const recordOf = (entry: RecentEntry) => {
  switch (entry.kind) {
    case "feed":
      return entry.feed
    case "diaper":
      return entry.diaper
    case "sleep":
      return entry.sleep
  }
}

export const idOf = (entry: RecentEntry) => recordOf(entry).id

export const timeOf = (entry: RecentEntry) => {
  switch (entry.kind) {
    case "feed":
      return entry.feed.startedAt
    case "diaper":
      return entry.diaper.occurredAt
    case "sleep":
      return entry.sleep.startedAt
  }
}

export const versionOf = (entry: RecentEntry) => recordOf(entry).version

export const changeOf = (entry: RecentEntry | null): Change => {
  if (entry === null || entry.kind === "sleep") return NOTHING
  return entry.kind === "feed" ? { feeds: [entry.feed], diapers: [] } : { feeds: [], diapers: [entry.diaper] }
}

export const without = (recent: ReadonlyArray<RecentEntry>, id: string) => recent.filter((entry) => idOf(entry) !== id)

export const withEntry = (recent: ReadonlyArray<RecentEntry>, entry: RecentEntry) =>
  [...without(recent, idOf(entry)), entry].toSorted((a, b) => timeOf(b) - timeOf(a))

export const later = (current: Feed | null, feed: Feed) =>
  current === null || current.id === feed.id || feed.startedAt >= current.startedAt ? feed : current

const shiftedTotals = (totals: Totals, period: Interval, now: Instant, before: Change, after: Change): Totals => {
  const added = totalsIn(period, { ...after, sleeps: [] }, now)
  const removed = totalsIn(period, { ...before, sleeps: [] }, now)
  const sum = (key: keyof Totals) => Math.max(0, roundTo(totals[key] + added[key] - removed[key], 1))
  return {
    ...totals,
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
