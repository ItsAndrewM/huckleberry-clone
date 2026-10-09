import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  contains,
  durationMs,
  last24hPeriod,
  splitByDays,
  type StartedFeed,
  totalsIn,
  zonedDayBounds,
} from "../../src/index.ts"
import { AC23_DAY_LENGTHS, AC4_MIDNIGHT_FEED } from "../fixtures/scenarios.ts"
import { VANCOUVER, zonedInstants } from "../fixtures/zones.ts"

const at = (iso: string) => Date.parse(iso)
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const NOW = at("2026-10-08T19:00:00Z")
const OCT_8 = zonedDayBounds("2026-10-08", VANCOUVER)

const NOTHING = {
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
}

const AC4_FEED: StartedFeed = { startedAt: at("2026-10-07T06:50:00Z"), ...AC4_MIDNIGHT_FEED }

const leftFrom = (startedAt: number, endedAt: number | null): StartedFeed => ({
  startedAt,
  segments: [{ side: "left", startedAt, endedAt }],
  portions: [],
})

const bottleAt = (occurredAt: number): StartedFeed => ({
  startedAt: occurredAt,
  segments: [],
  portions: [{ occurredAt, breastMilkMl: 30, formulaMl: 0 }],
})

describe("totalsIn", () => {
  it("is all zeros when nothing was logged", () => {
    expect(totalsIn(OCT_8, [], [], NOW)).toEqual(NOTHING)
  })

  it("counts the AC 4 feed on the day it started, with the 10 minutes it nursed before midnight", () => {
    expect(totalsIn(zonedDayBounds("2026-10-06", VANCOUVER), [AC4_FEED], [], NOW)).toEqual({
      ...NOTHING,
      feedsStarted: 1,
      leftSeconds: 600,
      nursingSeconds: 600,
    })
  })

  it("gives the AC 4 feed's next day its last 20 minutes and both bottles, but not the feed", () => {
    expect(totalsIn(zonedDayBounds("2026-10-07", VANCOUVER), [AC4_FEED], [], NOW)).toEqual({
      ...NOTHING,
      leftSeconds: 300,
      rightSeconds: 900,
      nursingSeconds: 1200,
      breastMilkMl: 50,
      formulaMl: 50,
      bottleMl: 100,
    })
  })

  it("counts a running side up to now", () => {
    expect(totalsIn(OCT_8, [leftFrom(NOW - 10 * MINUTE, null)], [], NOW)).toEqual({
      ...NOTHING,
      feedsStarted: 1,
      leftSeconds: 600,
      nursingSeconds: 600,
    })
  })

  it("counts a feed whose side was started ahead of the clock, but no time on it yet (AC 21)", () => {
    expect(totalsIn(OCT_8, [leftFrom(NOW + 2 * MINUTE, null)], [], NOW)).toEqual({ ...NOTHING, feedsStarted: 1 })
  })

  it("counts diapers by their time, a wet and dirty one once among the diapers and once as each", () => {
    const diapers = [
      { occurredAt: NOW - HOUR, wet: true, dirty: false },
      { occurredAt: NOW - 2 * HOUR, wet: true, dirty: true },
      { occurredAt: NOW - 3 * HOUR, wet: false, dirty: true },
    ]
    expect(totalsIn(OCT_8, [], diapers, NOW)).toEqual({ ...NOTHING, diapers: 3, wetDiapers: 2, dirtyDiapers: 2 })
  })

  it("counts what happens at the period's start, but not at its end", () => {
    const edges = [OCT_8.start, OCT_8.end]
    const diapers = edges.map((occurredAt) => ({ occurredAt, wet: true, dirty: false }))
    expect(totalsIn(OCT_8, edges.map(bottleAt), diapers, NOW)).toEqual({
      ...NOTHING,
      feedsStarted: 1,
      breastMilkMl: 30,
      bottleMl: 30,
      diapers: 1,
      wetDiapers: 1,
    })
  })

  it("adds up nursing across feeds before rounding down to whole seconds", () => {
    const feeds = [leftFrom(NOW - HOUR, NOW - HOUR + 1600), leftFrom(NOW - 2 * HOUR, NOW - 2 * HOUR + 1600)]
    expect(totalsIn(OCT_8, feeds, [], NOW)).toMatchObject({ leftSeconds: 3, nursingSeconds: 3 })
  })

  it.each(AC23_DAY_LENGTHS)("covers all $hours hours of $date in $zone (AC 23)", ({ zone, date, hours }) => {
    const day = zonedDayBounds(date, zone)
    const allDay = leftFrom(day.start - HOUR, day.end + HOUR)
    expect(totalsIn(day, [allDay], [], day.end + HOUR)).toEqual({
      ...NOTHING,
      leftSeconds: hours * 3600,
      nursingSeconds: hours * 3600,
    })
  })

  it("gives each day the nursing splitByDays gives it", () => {
    fc.assert(
      fc.property(zonedInstants, fc.integer({ min: 1, max: 3 * 24 * 60 }), ([instant, zone], minutes) => {
        const start = Math.floor(instant / MINUTE) * MINUTE
        const end = start + minutes * MINUTE
        for (const piece of splitByDays({ start, end }, zone)) {
          const totals = totalsIn(zonedDayBounds(piece.date, zone), [leftFrom(start, end)], [], end)
          expect(totals.leftSeconds).toBe(durationMs(piece.interval) / 1000)
        }
      }),
    )
  })
})

describe("last24hPeriod", () => {
  it("starts 24 hours before now", () => {
    expect(last24hPeriod(NOW).start).toBe(NOW - 24 * HOUR)
  })

  it("has no end, so a time a phone logged ahead of the clock counts at once (AC 21)", () => {
    const period = last24hPeriod(NOW)
    expect(contains(period, NOW + 5 * MINUTE)).toBe(true)
    expect(contains(period, NOW - 24 * HOUR - 1)).toBe(false)
  })
})
