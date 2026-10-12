import { contains, overlaps } from "../interval/interval.ts"
import type { LocalDate } from "../time/calendar.ts"
import type { Instant, Interval } from "../time/instant.ts"
import type { TimeZone } from "../time/zone.ts"
import { zonedDayBounds } from "../time/zoned.ts"
import { type DiaperChange, type StartedFeed, type Totals, totalsIn } from "./totals.ts"

export interface DayTotals {
  readonly date: LocalDate
  readonly bounds: Interval
  readonly totals: Totals
}

export const feedTouches = (period: Interval, feed: StartedFeed, now: Instant): boolean =>
  feed.segments.some(
    (segment) =>
      contains(period, segment.startedAt) ||
      overlaps({ start: segment.startedAt, end: segment.endedAt ?? now }, period),
  ) || feed.portions.some((portion) => contains(period, portion.occurredAt))

const tenths = (ml: number) => Math.round(ml * 10)

export const sumTotals = (days: ReadonlyArray<Totals>): Totals => {
  const sum = (pick: (totals: Totals) => number) => days.reduce((total, totals) => total + pick(totals), 0)
  const sumMl = (pick: (totals: Totals) => number) => sum((totals) => tenths(pick(totals))) / 10
  return {
    feedsStarted: sum((totals) => totals.feedsStarted),
    leftSeconds: sum((totals) => totals.leftSeconds),
    rightSeconds: sum((totals) => totals.rightSeconds),
    nursingSeconds: sum((totals) => totals.nursingSeconds),
    breastMilkMl: sumMl((totals) => totals.breastMilkMl),
    formulaMl: sumMl((totals) => totals.formulaMl),
    bottleMl: sumMl((totals) => totals.bottleMl),
    diapers: sum((totals) => totals.diapers),
    wetDiapers: sum((totals) => totals.wetDiapers),
    dirtyDiapers: sum((totals) => totals.dirtyDiapers),
  }
}

export const totalsByDay = (
  dates: ReadonlyArray<LocalDate>,
  zone: TimeZone,
  feeds: ReadonlyArray<StartedFeed>,
  diapers: ReadonlyArray<DiaperChange>,
  now: Instant,
): DayTotals[] =>
  dates.map((date) => {
    const bounds = zonedDayBounds(date, zone)
    return { date, bounds, totals: totalsIn(bounds, feeds, diapers, now) }
  })
