import type { Dose, Feed, RecentEntry, Sleep, Today } from "@bt/contracts"
import { contains, type Instant, last24hPeriod, localDateOf } from "@bt/domain"
import type { Action } from "./actions.ts"
import {
  isPending,
  pendingDiaper,
  pendingDose,
  pendingFeed,
  pendingId,
  pendingSleep,
  startedFeed,
  startedSleep,
  withBottle,
} from "./pending.ts"
import type { Saved } from "./send.ts"
import { isSwapping } from "./swap.ts"
import { idOf, later, NOTHING, type Pending, shifted, timeOf, without, withEntry, withFeed } from "./today-change.ts"
import { doseTextOf, withoutTodaysDose, withTodaysDose } from "./today-doses.ts"

const withSleep = (today: Today, sleep: Sleep): Today => ({
  ...today,
  activeSleep: sleep.endedAt === null ? sleep : today.activeSleep,
  lastSleep: later(today.lastSleep, sleep),
  recent: withEntry(today.recent, { kind: "sleep", sleep }),
})

export const pendingToday = (today: Today, action: Action, pending: Pending): Today => {
  switch (action.kind) {
    case "logSleep":
      return withSleep(today, pendingSleep(action.payload, pending))
    case "startSleep":
      return withSleep(today, startedSleep(action.payload, pending))
    case "logDiaper": {
      const diaper = pendingDiaper(action.payload, pending)
      const recent = withEntry(today.recent, { kind: "diaper", diaper })
      return { ...today, totals: shifted(today, pending, NOTHING, { feeds: [], diapers: [diaper] }), recent }
    }
    case "logDose": {
      const { occurredAt, supplementId } = action.payload
      const dose = pendingDose(action.payload, pending, {
        localDate: localDateOf(occurredAt, pending.zone),
        dose: doseTextOf(pending.supplements, supplementId),
      })
      return withTodaysDose({ ...today, recent: withEntry(today.recent, { kind: "dose", dose }) }, dose)
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

const settledSleep = (sleep: Sleep | null) => (sleep === null || isPending(sleep.id) ? null : sleep)

const latestSleep = (recent: ReadonlyArray<RecentEntry>, before: Sleep | null) =>
  recent.reduce((latest, entry) => (entry.kind === "sleep" ? later(latest, entry.sleep) : latest), settledSleep(before))

const withoutSleep = (today: Today, id: string, before: Today): Today => {
  const entry = entryOf(today, id)
  if (entry?.kind !== "sleep") return today
  const recent = without(today.recent, id)
  return {
    ...today,
    activeSleep: today.activeSleep?.id === id ? before.activeSleep : today.activeSleep,
    lastSleep: today.lastSleep?.id === id ? latestSleep(recent, before.lastSleep) : today.lastSleep,
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
    case "logDose": {
      const id = pendingId(action.payload.actionId)
      return withoutTodaysDose({ ...today, recent: without(today.recent, id) }, id)
    }
    case "logFeed":
    case "startFeed":
      return withoutFeed(today, pending, pendingId(action.payload.actionId), before)
    case "logSleep":
    case "startSleep":
      return withoutSleep(today, pendingId(action.payload.actionId), before)
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

const savedFeed = (today: Today, feed: Feed, recent: ReadonlyArray<RecentEntry>, shown: boolean): Today => {
  const live = feed.deletedAt === null
  return {
    ...today,
    activeFeed: activeAfter(today.activeFeed, feed),
    lastFeed: live ? later(today.lastFeed, feed) : today.lastFeed,
    recent: live && shown ? withEntry(recent, { kind: "feed", feed }) : without(recent, feed.id),
  }
}

const sleepActiveAfter = (active: Sleep | null, sleep: Sleep): Sleep | null => {
  if (sleep.deletedAt === null && sleep.endedAt === null) return sleep
  return active !== null && active.id === sleep.id ? null : active
}

const savedSleep = (today: Today, sleep: Sleep, recent: ReadonlyArray<RecentEntry>, shown: boolean): Today => {
  const live = sleep.deletedAt === null
  return {
    ...today,
    activeSleep: sleepActiveAfter(today.activeSleep, sleep),
    lastSleep: live ? later(today.lastSleep, sleep) : today.lastSleep,
    recent: live && shown ? withEntry(recent, { kind: "sleep", sleep }) : without(recent, sleep.id),
  }
}

const isShown = (today: Today, action: Action, entry: RecentEntry, now: Instant) =>
  today.recent.some((listed) => idOf(listed) === idOf(entry)) ||
  (!isSwapping(action) && contains(last24hPeriod(now), timeOf(entry)))

const savedDose = (today: Today, dose: Dose, recent: ReadonlyArray<RecentEntry>, shown: boolean, pending: string) => {
  const live = dose.deletedAt === null
  const listed = {
    ...today,
    recent: live && shown ? withEntry(recent, { kind: "dose", dose }) : without(recent, dose.id),
  }
  return withTodaysDose(withoutTodaysDose(listed, pending), dose)
}

export const savedToday = (today: Today, saved: Saved, action: Action, now: Instant): Today => {
  if ("measurement" in saved) return today
  const pending = pendingId(action.payload.actionId)
  const recent = without(today.recent, pending)
  if ("dose" in saved) {
    const { dose } = saved
    return savedDose(today, dose, recent, isShown(today, action, { kind: "dose", dose }, now), pending)
  }
  if ("sleep" in saved) {
    const { sleep } = saved
    return savedSleep(today, sleep, recent, isShown(today, action, { kind: "sleep", sleep }, now))
  }
  if ("feed" in saved) {
    const { feed } = saved
    return savedFeed(today, feed, recent, isShown(today, action, { kind: "feed", feed }, now))
  }
  const { diaper } = saved
  const live = diaper.deletedAt === null && isShown(today, action, { kind: "diaper", diaper }, now)
  return { ...today, recent: live ? withEntry(recent, { kind: "diaper", diaper }) : without(recent, diaper.id) }
}
