import type { Diaper, Dose, Feed, Sleep, Today, Totals } from "@bt/contracts"
import { localDateOf } from "@bt/domain"

export const ZONE = "America/Vancouver"
export const MINUTE = 60_000
export const NOW = Date.UTC(2026, 9, 9, 16, 30)
export const ANDREW = "caregiver-andrew"
export const EMILY = "caregiver-emily"
export const VITAMIN_D = "supplement-vitamin-d"

export const NO_TOTALS: Totals = {
  feedsStarted: 0,
  leftSeconds: 0,
  rightSeconds: 0,
  nursingSeconds: 0,
  breastMilkMl: 0,
  formulaMl: 0,
  bottleMl: 0,
  diapers: 0,
  wetDiapers: 0,
  dirtyDiapers: 0,
  sleepsStarted: 0,
  sleepSeconds: 0,
  napSeconds: 0,
  nightSeconds: 0,
  longestSleepSeconds: 0,
}

const audit = (at: number, by: string) => ({
  version: 1,
  createdBy: by,
  createdAt: at,
  updatedBy: by,
  updatedAt: at,
  deletedAt: null,
})

export const diaperAt = (occurredAt: number, change: Partial<Diaper> = {}): Diaper => ({
  id: `diaper-${occurredAt}`,
  occurredAt,
  wet: true,
  dirty: false,
  ...audit(occurredAt, EMILY),
  ...change,
})

export const sleptAt = (startedAt: number, change: Partial<Sleep> = {}): Sleep => ({
  id: `sleep-${startedAt}`,
  kind: "nap",
  startedAt,
  endedAt: startedAt + 60 * MINUTE,
  ...audit(startedAt, ANDREW),
  ...change,
})

export const dosedAt = (occurredAt: number, change: Partial<Dose> = {}): Dose => ({
  id: `dose-${occurredAt}`,
  supplementId: VITAMIN_D,
  occurredAt,
  localDate: localDateOf(occurredAt, ZONE),
  dose: "400 IU",
  ...audit(occurredAt, EMILY),
  ...change,
})

export const feedAt = (startedAt: number, change: Partial<Feed> = {}): Feed => ({
  id: `feed-${startedAt}`,
  status: "completed",
  startedAt,
  endedAt: startedAt,
  segments: [],
  portions: [],
  ...audit(startedAt, ANDREW),
  ...change,
})

export const nursedFor = (feed: Feed, side: "left" | "right", minutes: number): Feed => {
  const startedAt = feed.segments.at(-1)?.endedAt ?? feed.startedAt
  const endedAt = startedAt + minutes * MINUTE
  const segment = { id: `${feed.id}-${feed.segments.length}`, side, startedAt, endedAt }
  return { ...feed, endedAt, segments: [...feed.segments, segment] }
}

export const todayWith = (change: Partial<Today> = {}): Today => ({
  date: "2026-10-09",
  totals: NO_TOTALS,
  activeFeed: null,
  lastFeed: null,
  activeSleep: null,
  lastSleep: null,
  prefill: { lastBottle: null, lastSide: null },
  recent: [],
  doses: [],
  ...change,
})
