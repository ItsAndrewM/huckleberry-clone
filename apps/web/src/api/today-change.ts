import type { Feed, Me, RecentEntry, Supplement, Today, Totals } from "@bt/contracts"
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
  readonly supplements: ReadonlyArray<Supplement>
}

export const pendingOf = (me: Me, now: Instant): Pending => ({
  by: me.caregiver.id,
  now,
  zone: me.household.timeZone,
  supplements: me.household.supplements,
})

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
    case "dose":
      return entry.dose
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
    case "dose":
      return entry.dose.occurredAt
  }
}

export const versionOf = (entry: RecentEntry) => recordOf(entry).version

export const changeOf = (entry: RecentEntry | null): Change => {
  if (entry === null) return NOTHING
  switch (entry.kind) {
    case "feed":
      return { feeds: [entry.feed], diapers: [] }
    case "diaper":
      return { feeds: [], diapers: [entry.diaper] }
    case "sleep":
    case "dose":
      return NOTHING
  }
}

export const without = (recent: ReadonlyArray<RecentEntry>, id: string) => recent.filter((entry) => idOf(entry) !== id)

export const withEntry = (recent: ReadonlyArray<RecentEntry>, entry: RecentEntry) =>
  [...without(recent, idOf(entry)), entry].toSorted((a, b) => timeOf(b) - timeOf(a))

interface Started {
  readonly id: string
  readonly startedAt: number
}

export const later = <Logged extends Started>(current: Logged | null, record: Logged) =>
  current === null || current.id === record.id || record.startedAt >= current.startedAt ? record : current

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
