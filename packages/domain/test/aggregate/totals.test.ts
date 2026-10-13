import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  contains,
  type DiaperChange,
  durationMs,
  type Entries,
  last24hPeriod,
  type SleepKind,
  type SleepSession,
  splitByDays,
  type StartedFeed,
  totalsIn,
  zonedDayBounds,
} from "../../src/index.ts"
import { AC12_MIDNIGHT_SLEEP, AC23_DAY_LENGTHS, AC4_MIDNIGHT_FEED } from "../fixtures/scenarios.ts"
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
  sleepsStarted: 0,
  sleepSeconds: 0,
  napSeconds: 0,
  nightSeconds: 0,
  longestSleepSeconds: 0,
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

const asleep = (startedAt: number, endedAt: number | null, kind: SleepKind = "nap"): SleepSession => ({
  startedAt,
  endedAt,
  kind,
})

const AC12_SLEEP = asleep(AC12_MIDNIGHT_SLEEP.start, AC12_MIDNIGHT_SLEEP.end, "night")

const feedsOnly = (feeds: ReadonlyArray<StartedFeed>): Entries => ({ feeds, diapers: [], sleeps: [] })

const diapersOnly = (diapers: ReadonlyArray<DiaperChange>): Entries => ({ feeds: [], diapers, sleeps: [] })

const sleepsOnly = (sleeps: ReadonlyArray<SleepSession>): Entries => ({ feeds: [], diapers: [], sleeps })

describe("totalsIn", () => {
  it("is all zeros when nothing was logged", () => {
    expect(totalsIn(OCT_8, feedsOnly([]), NOW)).toEqual(NOTHING)
  })

  it("counts the AC 4 feed on the day it started, with the 10 minutes it nursed before midnight", () => {
    expect(totalsIn(zonedDayBounds("2026-10-06", VANCOUVER), feedsOnly([AC4_FEED]), NOW)).toEqual({
      ...NOTHING,
      feedsStarted: 1,
      leftSeconds: 600,
      nursingSeconds: 600,
    })
  })

  it("gives the AC 4 feed's next day its last 20 minutes and both bottles, but not the feed", () => {
    expect(totalsIn(zonedDayBounds("2026-10-07", VANCOUVER), feedsOnly([AC4_FEED]), NOW)).toEqual({
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
    expect(totalsIn(OCT_8, feedsOnly([leftFrom(NOW - 10 * MINUTE, null)]), NOW)).toEqual({
      ...NOTHING,
      feedsStarted: 1,
      leftSeconds: 600,
      nursingSeconds: 600,
    })
  })

  it("counts a feed whose side was started ahead of the clock, but no time on it yet (AC 21)", () => {
    expect(totalsIn(OCT_8, feedsOnly([leftFrom(NOW + 2 * MINUTE, null)]), NOW)).toEqual({
      ...NOTHING,
      feedsStarted: 1,
    })
  })

  it("counts diapers by their time, a wet and dirty one once among the diapers and once as each", () => {
    const diapers = [
      { occurredAt: NOW - HOUR, wet: true, dirty: false },
      { occurredAt: NOW - 2 * HOUR, wet: true, dirty: true },
      { occurredAt: NOW - 3 * HOUR, wet: false, dirty: true },
    ]
    expect(totalsIn(OCT_8, diapersOnly(diapers), NOW)).toEqual({
      ...NOTHING,
      diapers: 3,
      wetDiapers: 2,
      dirtyDiapers: 2,
    })
  })

  it("counts what happens at the period's start, but not at its end", () => {
    const edges = [OCT_8.start, OCT_8.end]
    const diapers = edges.map((occurredAt) => ({ occurredAt, wet: true, dirty: false }))
    const sleeps = edges.map((startedAt) => asleep(startedAt, startedAt + HOUR))
    expect(totalsIn(OCT_8, { feeds: edges.map(bottleAt), diapers, sleeps }, NOW)).toEqual({
      ...NOTHING,
      feedsStarted: 1,
      breastMilkMl: 30,
      bottleMl: 30,
      diapers: 1,
      wetDiapers: 1,
      sleepsStarted: 1,
      sleepSeconds: 3600,
      napSeconds: 3600,
      longestSleepSeconds: 3600,
    })
  })

  it("adds up nursing across feeds before rounding down to whole seconds", () => {
    const feeds = [leftFrom(NOW - HOUR, NOW - HOUR + 1600), leftFrom(NOW - 2 * HOUR, NOW - 2 * HOUR + 1600)]
    expect(totalsIn(OCT_8, feedsOnly(feeds), NOW)).toMatchObject({ leftSeconds: 3, nursingSeconds: 3 })
  })

  it.each(AC23_DAY_LENGTHS)("covers all $hours hours of $date in $zone (AC 23)", ({ zone, date, hours }) => {
    const day = zonedDayBounds(date, zone)
    const allDay = leftFrom(day.start - HOUR, day.end + HOUR)
    expect(totalsIn(day, feedsOnly([allDay]), day.end + HOUR)).toEqual({
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
          const totals = totalsIn(zonedDayBounds(piece.date, zone), feedsOnly([leftFrom(start, end)]), end)
          expect(totals.leftSeconds).toBe(durationMs(piece.interval) / 1000)
        }
      }),
    )
  })
})

describe("totalsIn, for sleep", () => {
  it("gives the AC 12 sleep's day its 30 minutes before midnight, and counts it there whole as the longest", () => {
    expect(totalsIn(zonedDayBounds("2026-10-06", VANCOUVER), sleepsOnly([AC12_SLEEP]), NOW)).toEqual({
      ...NOTHING,
      sleepsStarted: 1,
      sleepSeconds: 1800,
      nightSeconds: 1800,
      longestSleepSeconds: 5400,
    })
  })

  it("gives the AC 12 sleep's next day its 60 minutes after midnight, but not the sleep or its length", () => {
    expect(totalsIn(zonedDayBounds("2026-10-07", VANCOUVER), sleepsOnly([AC12_SLEEP]), NOW)).toEqual({
      ...NOTHING,
      sleepSeconds: 3600,
      nightSeconds: 3600,
    })
  })

  it("splits sleep into nap time and night time by each sleep's own label, whatever its hour", () => {
    const sleeps = [
      asleep(OCT_8.start + 2 * HOUR, OCT_8.start + 4 * HOUR, "night"),
      asleep(OCT_8.start + 10 * HOUR, OCT_8.start + 11 * HOUR, "nap"),
      asleep(OCT_8.start + 11 * HOUR + 15 * MINUTE, OCT_8.start + 11 * HOUR + 45 * MINUTE, "night"),
    ]
    expect(totalsIn(OCT_8, sleepsOnly(sleeps), NOW)).toEqual({
      ...NOTHING,
      sleepsStarted: 3,
      sleepSeconds: 3.5 * 3600,
      napSeconds: 3600,
      nightSeconds: 2.5 * 3600,
      longestSleepSeconds: 2 * 3600,
    })
  })

  it("counts a running sleep up to now, as the longest so far", () => {
    expect(totalsIn(OCT_8, sleepsOnly([asleep(NOW - 40 * MINUTE, null)]), NOW)).toEqual({
      ...NOTHING,
      sleepsStarted: 1,
      sleepSeconds: 2400,
      napSeconds: 2400,
      longestSleepSeconds: 2400,
    })
  })

  it("counts a sleep a phone started ahead of the clock as started, with no time yet (AC 21)", () => {
    expect(totalsIn(OCT_8, sleepsOnly([asleep(NOW + 2 * MINUTE, null)]), NOW)).toEqual({
      ...NOTHING,
      sleepsStarted: 1,
    })
  })

  it("leaves a sleep that started the day before out of the longest, though its time after midnight counts", () => {
    const fromYesterday = asleep(OCT_8.start - 6 * HOUR, OCT_8.start + HOUR, "night")
    const nap = asleep(OCT_8.start + 9 * HOUR, OCT_8.start + 10 * HOUR)
    expect(totalsIn(OCT_8, sleepsOnly([fromYesterday, nap]), NOW)).toEqual({
      ...NOTHING,
      sleepsStarted: 1,
      sleepSeconds: 7200,
      napSeconds: 3600,
      nightSeconds: 3600,
      longestSleepSeconds: 3600,
    })
  })

  it("adds up sleep across sleeps before rounding down to whole seconds", () => {
    const sleeps = [asleep(NOW - HOUR, NOW - HOUR + 1600), asleep(NOW - 2 * HOUR, NOW - 2 * HOUR + 1600)]
    expect(totalsIn(OCT_8, sleepsOnly(sleeps), NOW)).toMatchObject({ sleepSeconds: 3, napSeconds: 3 })
  })

  it("rounds nap time and night time down to whole seconds each, so a nap and a night of 1.6 seconds are 2 seconds asleep, not 3", () => {
    const sleeps = [asleep(NOW - HOUR, NOW - HOUR + 1600), asleep(NOW - 2 * HOUR, NOW - 2 * HOUR + 1600, "night")]
    expect(totalsIn(OCT_8, sleepsOnly(sleeps), NOW)).toMatchObject({ sleepSeconds: 2, napSeconds: 1, nightSeconds: 1 })
  })

  it("gives each day the sleep splitByDays gives it", () => {
    fc.assert(
      fc.property(zonedInstants, fc.integer({ min: 1, max: 3 * 24 * 60 }), ([instant, zone], minutes) => {
        const start = Math.floor(instant / MINUTE) * MINUTE
        const end = start + minutes * MINUTE
        for (const piece of splitByDays({ start, end }, zone)) {
          const totals = totalsIn(zonedDayBounds(piece.date, zone), sleepsOnly([asleep(start, end, "night")]), end)
          expect(totals.nightSeconds).toBe(durationMs(piece.interval) / 1000)
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
