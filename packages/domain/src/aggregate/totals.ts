import { type FeedComponents, type FeedSummary, feedSummary, type NursingSegment } from "../feed/feed.ts"
import { clipTo, contains, durationMs } from "../interval/interval.ts"
import type { SleepKind, SleepSession } from "../sleep/sleep.ts"
import { DAY_MS, type Instant, type Interval, SECOND_MS } from "../time/instant.ts"
import { sleepElapsed } from "../timer/timer.ts"

export interface StartedFeed extends FeedComponents {
  readonly startedAt: Instant
}

export interface DiaperChange {
  readonly occurredAt: Instant
  readonly wet: boolean
  readonly dirty: boolean
}

export interface Entries {
  readonly feeds: ReadonlyArray<StartedFeed>
  readonly diapers: ReadonlyArray<DiaperChange>
  readonly sleeps: ReadonlyArray<SleepSession>
}

export interface SleepTotals {
  readonly sleepsStarted: number
  readonly sleepSeconds: number
  readonly napSeconds: number
  readonly nightSeconds: number
  readonly longestSleepSeconds: number
}

export interface Totals extends FeedSummary, SleepTotals {
  readonly feedsStarted: number
  readonly diapers: number
  readonly wetDiapers: number
  readonly dirtyDiapers: number
}

export const last24hPeriod = (now: Instant): Interval => ({ start: now - DAY_MS, end: Number.POSITIVE_INFINITY })

const nursedIn = (period: Interval, segment: NursingSegment, now: Instant): NursingSegment[] => {
  const piece = clipTo({ start: segment.startedAt, end: segment.endedAt ?? now }, period)
  return piece === null ? [] : [{ side: segment.side, startedAt: piece.start, endedAt: piece.end }]
}

const partsIn = (period: Interval, feeds: ReadonlyArray<StartedFeed>, now: Instant): FeedComponents => ({
  segments: feeds.flatMap((feed) => feed.segments.flatMap((segment) => nursedIn(period, segment, now))),
  portions: feeds.flatMap((feed) => feed.portions.filter((portion) => contains(period, portion.occurredAt))),
})

const asleepMsIn = (period: Interval, sleep: SleepSession, now: Instant): number => {
  const piece = clipTo({ start: sleep.startedAt, end: sleep.endedAt ?? now }, period)
  return piece === null ? 0 : durationMs(piece)
}

const asleepSecondsIn = (period: Interval, sleeps: ReadonlyArray<SleepSession>, kind: SleepKind, now: Instant) =>
  Math.floor(
    sleeps.filter((sleep) => sleep.kind === kind).reduce((total, sleep) => total + asleepMsIn(period, sleep, now), 0) /
      SECOND_MS,
  )

const sleepTotalsIn = (period: Interval, sleeps: ReadonlyArray<SleepSession>, now: Instant): SleepTotals => {
  const started = sleeps.filter((sleep) => contains(period, sleep.startedAt))
  const napSeconds = asleepSecondsIn(period, sleeps, "nap", now)
  const nightSeconds = asleepSecondsIn(period, sleeps, "night", now)
  return {
    sleepsStarted: started.length,
    sleepSeconds: napSeconds + nightSeconds,
    napSeconds,
    nightSeconds,
    longestSleepSeconds: Math.max(0, ...started.map((sleep) => sleepElapsed(sleep, now))),
  }
}

export const totalsIn = (period: Interval, entries: Entries, now: Instant): Totals => {
  const changes = entries.diapers.filter((diaper) => contains(period, diaper.occurredAt))
  return {
    feedsStarted: entries.feeds.filter((feed) => contains(period, feed.startedAt)).length,
    ...feedSummary(partsIn(period, entries.feeds, now), now),
    diapers: changes.length,
    wetDiapers: changes.filter((diaper) => diaper.wet).length,
    dirtyDiapers: changes.filter((diaper) => diaper.dirty).length,
    ...sleepTotalsIn(period, entries.sleeps, now),
  }
}
