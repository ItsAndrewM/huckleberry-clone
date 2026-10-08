import type { Instant } from "../time/instant.ts"
import { nursingElapsed, type Span } from "../timer/timer.ts"

export type Side = "left" | "right"

export interface NursingSegment extends Span {
  readonly side: Side
}

export interface BottlePortion {
  readonly occurredAt: Instant
  readonly breastMilkMl: number
  readonly formulaMl: number
}

export interface FeedComponents {
  readonly segments: ReadonlyArray<NursingSegment>
  readonly portions: ReadonlyArray<BottlePortion>
}

export interface FeedSummary {
  readonly leftSeconds: number
  readonly rightSeconds: number
  readonly nursingSeconds: number
  readonly breastMilkMl: number
  readonly formulaMl: number
  readonly bottleMl: number
}

const tenths = (ml: number) => Math.round(ml * 10)

const sumMl = (portions: ReadonlyArray<BottlePortion>, pick: (portion: BottlePortion) => number) =>
  portions.reduce((total, portion) => total + tenths(pick(portion)), 0) / 10

const sideSeconds = (feed: FeedComponents, side: Side, now: Instant) =>
  nursingElapsed(
    feed.segments.filter((segment) => segment.side === side),
    now,
  )

export const feedSummary = (feed: FeedComponents, now: Instant): FeedSummary => {
  const leftSeconds = sideSeconds(feed, "left", now)
  const rightSeconds = sideSeconds(feed, "right", now)
  const breastMilkMl = sumMl(feed.portions, (portion) => portion.breastMilkMl)
  const formulaMl = sumMl(feed.portions, (portion) => portion.formulaMl)
  return {
    leftSeconds,
    rightSeconds,
    nursingSeconds: leftSeconds + rightSeconds,
    breastMilkMl,
    formulaMl,
    bottleMl: (tenths(breastMilkMl) + tenths(formulaMl)) / 10,
  }
}

export const sessionBounds = (feed: FeedComponents): Span | null => {
  const portionTimes = feed.portions.map((portion) => portion.occurredAt)
  const starts = [...feed.segments.map((segment) => segment.startedAt), ...portionTimes]
  if (starts.length === 0) return null
  const ends = [...feed.segments.map((segment) => segment.endedAt), ...portionTimes]
  const closedEnds = ends.filter((end) => end !== null)
  return { startedAt: Math.min(...starts), endedAt: closedEnds.length === ends.length ? Math.max(...closedEnds) : null }
}
