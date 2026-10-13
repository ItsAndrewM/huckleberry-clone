import type { Entries, StartedFeed } from "../aggregate/totals.ts"
import { clipTo, contains } from "../interval/interval.ts"
import { type Instant, type Interval, SECOND_MS } from "../time/instant.ts"
import type { Span } from "../timer/timer.ts"

export interface RunningPoint {
  readonly at: Instant
  readonly value: number
}

export interface RunningTotals {
  readonly feedsStarted: ReadonlyArray<RunningPoint>
  readonly nursingSeconds: ReadonlyArray<RunningPoint>
  readonly bottleMl: ReadonlyArray<RunningPoint>
  readonly diapers: ReadonlyArray<RunningPoint>
  readonly sleepSeconds: ReadonlyArray<RunningPoint>
}

interface Step {
  readonly at: Instant
  readonly amount: number
}

interface Kinded extends Span {
  readonly kind: string
}

interface Piece extends Interval {
  readonly kind: string
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

const piecesIn = (period: Interval, spans: ReadonlyArray<Kinded>, now: Instant): Piece[] =>
  spans
    .flatMap(({ kind, startedAt, endedAt }) => {
      const piece = clipTo({ start: startedAt, end: endedAt ?? now }, period)
      return piece === null ? [] : [{ kind, ...piece }]
    })
    .toSorted((a, b) => a.start - b.start)

const climbThrough = (period: Interval, now: Instant, spans: ReadonlyArray<Kinded>) => {
  const pieces = piecesIn(period, spans, now)
  const elapsedMs = new Map<string, number>()
  const seconds = () => [...elapsedMs.values()].reduce((sum, ms) => sum + Math.floor(ms / SECOND_MS), 0)
  const points: RunningPoint[] = [{ at: period.start, value: 0 }]
  for (const { kind, start, end } of pieces) {
    points.push({ at: start, value: seconds() })
    elapsedMs.set(kind, (elapsedMs.get(kind) ?? 0) + end - start)
    points.push({ at: end, value: seconds() })
  }
  points.push({ at: endOf(period, now, pieces.at(-1)?.end ?? period.start), value: seconds() })
  return points
}

const sidesOf = (feeds: ReadonlyArray<StartedFeed>): Kinded[] =>
  feeds.flatMap(({ segments }) => segments.map(({ side, startedAt, endedAt }) => ({ kind: side, startedAt, endedAt })))

const counted = (sum: number) => sum

export const runningTotals = (period: Interval, { feeds, diapers, sleeps }: Entries, now: Instant): RunningTotals => ({
  feedsStarted: climb(
    period,
    now,
    feeds.map(({ startedAt }) => ({ at: startedAt, amount: 1 })),
    counted,
  ),
  nursingSeconds: climbThrough(period, now, sidesOf(feeds)),
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
  sleepSeconds: climbThrough(period, now, sleeps),
})
