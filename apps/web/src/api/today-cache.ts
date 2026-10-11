import type { Feed, RecentEntry, Today } from "@bt/contracts"
import type { Action } from "./actions.ts"
import { isPending, pendingDiaper, pendingFeed, pendingId, startedFeed, withBottle } from "./pending.ts"
import type { Saved } from "./send.ts"
import { idOf, later, NOTHING, type Pending, shifted, without, withEntry, withFeed } from "./today-change.ts"

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

const entryOf = (today: Today, id: string) => today.recent.find((entry) => idOf(entry) === id)

const settled = (feed: Feed | null) => (feed === null || isPending(feed.id) ? null : feed)

const latestFeed = (recent: ReadonlyArray<RecentEntry>, before: Feed | null) =>
  recent.reduce((latest, entry) => (entry.kind === "feed" ? later(latest, entry.feed) : latest), settled(before))

const withoutDiaper = (today: Today, pending: Pending, id: string): Today => {
  const entry = entryOf(today, id)
  if (entry?.kind !== "diaper") return today
  const totals = shifted(today, pending, { feeds: [], diapers: [entry.diaper] }, NOTHING)
  return { ...today, totals, recent: without(today.recent, id) }
}

const withoutFeed = (today: Today, pending: Pending, id: string, before: Today): Today => {
  const entry = entryOf(today, id)
  if (entry?.kind !== "feed") return today
  const recent = without(today.recent, id)
  return {
    ...today,
    totals: shifted(today, pending, { feeds: [entry.feed], diapers: [] }, NOTHING),
    activeFeed: today.activeFeed?.id === id ? before.activeFeed : today.activeFeed,
    lastFeed: today.lastFeed?.id === id ? latestFeed(recent, before.lastFeed) : today.lastFeed,
    recent,
  }
}

const withoutBottle = (today: Today, pending: Pending, feedId: string, portionId: string): Today => {
  const active = today.activeFeed
  if (active?.id !== feedId || !active.portions.some(({ id }) => id === portionId)) return today
  const portions = active.portions.filter(({ id }) => id !== portionId)
  return withFeed(today, pending, { ...active, portions }, active)
}

export const withdrawnToday = (today: Today, action: Action, pending: Pending, before: Today): Today => {
  switch (action.kind) {
    case "logDiaper":
      return withoutDiaper(today, pending, pendingId(action.payload.actionId))
    case "logFeed":
    case "startFeed":
      return withoutFeed(today, pending, pendingId(action.payload.actionId), before)
    case "addBottle":
      return withoutBottle(today, pending, action.id, pendingId(action.payload.actionId))
    default:
      return today
  }
}

const activeAfter = (active: Feed | null, feed: Feed): Feed | null => {
  if (feed.deletedAt === null && feed.status === "active") return feed
  return active !== null && active.id === feed.id ? null : active
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
