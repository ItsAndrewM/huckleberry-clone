import type { Feed, RecentEntry, Today, Totals } from "@bt/contracts"
import { type DiaperChange, roundTo, type StartedFeed, totalsIn, zonedDayBounds } from "@bt/domain"
import type { Action } from "./actions.ts"
import { type Author, isPending, pendingDiaper, pendingFeed, pendingId, startedFeed, withBottle } from "./pending.ts"
import type { Saved } from "./send.ts"

export interface Pending extends Author {
  readonly zone: string
}

const idOf = (entry: RecentEntry) => (entry.kind === "feed" ? entry.feed.id : entry.diaper.id)

const timeOf = (entry: RecentEntry) => (entry.kind === "feed" ? entry.feed.startedAt : entry.diaper.occurredAt)

const without = (recent: ReadonlyArray<RecentEntry>, id: string) => recent.filter((entry) => idOf(entry) !== id)

const withEntry = (recent: ReadonlyArray<RecentEntry>, entry: RecentEntry) =>
  [...without(recent, idOf(entry)), entry].toSorted((a, b) => timeOf(b) - timeOf(a))

const later = (current: Feed | null, feed: Feed) =>
  current === null || current.id === feed.id || feed.startedAt >= current.startedAt ? feed : current

const shifted = (today: Today, pending: Pending, before: Change, after: Change): Totals => {
  const day = zonedDayBounds(today.date, pending.zone)
  const added = totalsIn(day, after.feeds, after.diapers, pending.now)
  const removed = totalsIn(day, before.feeds, before.diapers, pending.now)
  const sum = (key: keyof Totals) => roundTo(today.totals[key] + added[key] - removed[key], 1)
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

interface Change {
  readonly feeds: ReadonlyArray<StartedFeed>
  readonly diapers: ReadonlyArray<DiaperChange>
}

const NOTHING: Change = { feeds: [], diapers: [] }

const withFeed = (today: Today, pending: Pending, feed: Feed, before: Feed | null): Today => ({
  ...today,
  totals: shifted(today, pending, before === null ? NOTHING : { feeds: [before], diapers: [] }, {
    feeds: [feed],
    diapers: [],
  }),
  activeFeed: feed.status === "active" ? feed : today.activeFeed,
  lastFeed: later(today.lastFeed, feed),
  recent: withEntry(today.recent, { kind: "feed", feed }),
})

export const pendingToday = (today: Today, action: Action, pending: Pending): Today => {
  switch (action.kind) {
    case "logDiaper": {
      const diaper = pendingDiaper(action.payload, pending)
      const recent = withEntry(today.recent, { kind: "diaper", diaper })
      return { ...today, totals: shifted(today, pending, NOTHING, { feeds: [], diapers: [diaper] }), recent }
    }
    case "logFeed":
      return withFeed(today, pending, pendingFeed(action.payload, pending), null)
    case "startFeed":
      return withFeed(today, pending, startedFeed(action.payload, pending), null)
    case "addBottle": {
      const active = today.activeFeed
      if (active?.id !== action.id) return today
      return withFeed(today, pending, withBottle(active, action.payload), active)
    }
    default:
      return today
  }
}

const activeAfter = (active: Feed | null, feed: Feed): Feed | null => {
  if (feed.deletedAt === null && feed.status === "active") return feed
  return active !== null && (active.id === feed.id || isPending(active.id)) ? null : active
}

const savedFeed = (today: Today, feed: Feed, recent: ReadonlyArray<RecentEntry>): Today => {
  const live = feed.deletedAt === null
  return {
    ...today,
    activeFeed: activeAfter(today.activeFeed, feed),
    lastFeed: live ? later(today.lastFeed, feed) : today.lastFeed,
    recent: live ? withEntry(recent, { kind: "feed", feed }) : without(recent, feed.id),
  }
}

export const savedToday = (today: Today, saved: Saved, action: Action): Today => {
  const recent = without(today.recent, pendingId(action.payload.actionId))
  if ("feed" in saved) return savedFeed(today, saved.feed, recent)
  const { diaper } = saved
  const live = diaper.deletedAt === null
  return { ...today, recent: live ? withEntry(recent, { kind: "diaper", diaper }) : without(recent, diaper.id) }
}
