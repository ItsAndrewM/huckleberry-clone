import type { DiaperChange, StartedFeed } from "../aggregate/totals.ts"
import type { Side } from "../feed/feed.ts"
import { clipTo, contains } from "../interval/interval.ts"
import { type Instant, type Interval, SECOND_MS } from "../time/instant.ts"

export interface RunningPoint {
  readonly at: Instant
  readonly value: number
}

export interface RunningTotals {
  readonly feedsStarted: ReadonlyArray<RunningPoint>
  readonly nursingSeconds: ReadonlyArray<RunningPoint>
  readonly bottleMl: ReadonlyArray<RunningPoint>
  readonly diapers: ReadonlyArray<RunningPoint>
}

interface Step {
  readonly at: Instant
  readonly amount: number
}

interface Nursed extends Interval {
  readonly side: Side
}

const endOf = (period: Interval, now: Instant, lastAt: Instant) => Math.max(Math.min(now, period.end), lastAt)

const tenths = (ml: number) => Math.round(ml * 10) / 10

const climb = (period: Interval, now: Instant, steps: ReadonlyArray<Step>, read: (sum: number) => number) => {
  const inPeriod = steps.filter(({ at }) => contains(period, at)).toSorted((a, b) => a.at - b.at)
  const points: RunningPoint[] = [{ at: period.start, value: 0 }]
  let sum = 0
  for (const { at, amount } of inPeriod) {
    points.push({ at, value: read(sum) })
    sum += amount
    points.push({ at, value: read(sum) })
  }
  points.push({ at: endOf(period, now, inPeriod.at(-1)?.at ?? period.start), value: read(sum) })
  return points
}

const nursedIn = (period: Interval, feeds: ReadonlyArray<StartedFeed>, now: Instant): Nursed[] =>
  feeds
    .flatMap((feed) =>
      feed.segments.flatMap(({ side, startedAt, endedAt }) => {
        const piece = clipTo({ start: startedAt, end: endedAt ?? now }, period)
        return piece === null ? [] : [{ side, ...piece }]
      }),
    )
    .toSorted((a, b) => a.start - b.start)

const nursing = (period: Interval, feeds: ReadonlyArray<StartedFeed>, now: Instant) => {
  const pieces = nursedIn(period, feeds, now)
  const elapsedMs = { left: 0, right: 0 }
  const seconds = () => Math.floor(elapsedMs.left / SECOND_MS) + Math.floor(elapsedMs.right / SECOND_MS)
  const points: RunningPoint[] = [{ at: period.start, value: 0 }]
  for (const { side, start, end } of pieces) {
    points.push({ at: start, value: seconds() })
    elapsedMs[side] += end - start
    points.push({ at: end, value: seconds() })
  }
  points.push({ at: endOf(period, now, pieces.at(-1)?.end ?? period.start), value: seconds() })
  return points
}

const counted = (sum: number) => sum

export const runningTotals = (
  period: Interval,
  feeds: ReadonlyArray<StartedFeed>,
  diapers: ReadonlyArray<DiaperChange>,
  now: Instant,
): RunningTotals => ({
  feedsStarted: climb(
    period,
    now,
    feeds.map(({ startedAt }) => ({ at: startedAt, amount: 1 })),
    counted,
  ),
  nursingSeconds: nursing(period, feeds, now),
  bottleMl: climb(
    period,
    now,
    feeds.flatMap(({ portions }) =>
      portions.map(({ occurredAt, breastMilkMl, formulaMl }) => ({ at: occurredAt, amount: breastMilkMl + formulaMl })),
    ),
    tenths,
  ),
  diapers: climb(
    period,
    now,
    diapers.map(({ occurredAt }) => ({ at: occurredAt, amount: 1 })),
    counted,
  ),
})
