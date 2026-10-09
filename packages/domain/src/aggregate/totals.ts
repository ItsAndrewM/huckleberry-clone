import { type FeedComponents, type FeedSummary, feedSummary, type NursingSegment } from "../feed/feed.ts"
import { clipTo, contains } from "../interval/interval.ts"
import { DAY_MS, type Instant, type Interval } from "../time/instant.ts"

export interface StartedFeed extends FeedComponents {
  readonly startedAt: Instant
}

export interface DiaperChange {
  readonly occurredAt: Instant
  readonly wet: boolean
  readonly dirty: boolean
}

export interface Totals extends FeedSummary {
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

export const totalsIn = (
  period: Interval,
  feeds: ReadonlyArray<StartedFeed>,
  diapers: ReadonlyArray<DiaperChange>,
  now: Instant,
): Totals => {
  const changes = diapers.filter((diaper) => contains(period, diaper.occurredAt))
  return {
    feedsStarted: feeds.filter((feed) => contains(period, feed.startedAt)).length,
    ...feedSummary(partsIn(period, feeds, now), now),
    diapers: changes.length,
    wetDiapers: changes.filter((diaper) => diaper.wet).length,
    dirtyDiapers: changes.filter((diaper) => diaper.dirty).length,
  }
}
