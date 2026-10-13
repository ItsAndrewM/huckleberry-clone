import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  type DiaperChange,
  type Entries,
  feedTouches,
  isoWeekBounds,
  isoWeekDates,
  isoWeekOfDate,
  localDateOf,
  monthBounds,
  monthDates,
  monthOfDate,
  type SleepKind,
  type SleepSession,
  sleepTouches,
  type StartedFeed,
  sumTotals,
  totalsByDay,
  totalsIn,
  zonedDayBounds,
} from "../../src/index.ts"
import { AC12_MIDNIGHT_SLEEP, AC23_DAY_LENGTHS, AC4_MIDNIGHT_FEED } from "../fixtures/scenarios.ts"
import { VANCOUVER, zonedInstants } from "../fixtures/zones.ts"

const at = (iso: string) => Date.parse(iso)
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
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

const nursing = (startedAt: number, endedAt: number | null): StartedFeed => ({
  startedAt,
  segments: [{ side: "left", startedAt, endedAt }],
  portions: [],
})

const bottleAt = (occurredAt: number, breastMilkMl = 30): StartedFeed => ({
  startedAt: occurredAt,
  segments: [],
  portions: [{ occurredAt, breastMilkMl, formulaMl: 0 }],
})

const withBottle = (feed: StartedFeed, occurredAt: number): StartedFeed => ({
  ...feed,
  portions: [...feed.portions, ...bottleAt(occurredAt).portions],
})

const asleep = (startedAt: number, endedAt: number | null, kind: SleepKind = "nap"): SleepSession => ({
  startedAt,
  endedAt,
  kind,
})

const feedsOnly = (feeds: ReadonlyArray<StartedFeed>): Entries => ({ feeds, diapers: [], sleeps: [] })

const SIDE_BEFORE_THE_DAY = nursing(OCT_8.start - 2 * HOUR, OCT_8.start - HOUR)

describe("feedTouches", () => {
  it.each([
    ["a side nursed during the day", true, nursing(OCT_8.start + HOUR, OCT_8.start + 2 * HOUR)],
    ["a side that ran on past the day's start", true, nursing(OCT_8.start - HOUR, OCT_8.start + MINUTE)],
    ["a side that ended as the day began", false, nursing(OCT_8.start - HOUR, OCT_8.start)],
    ["a side that began as the day ended", false, nursing(OCT_8.end, OCT_8.end + HOUR)],
    ["a paused feed whose side ended an hour before the day", false, SIDE_BEFORE_THE_DAY],
    ["a bottle as the day began", true, bottleAt(OCT_8.start)],
    ["a bottle as the day ended", false, bottleAt(OCT_8.end)],
    [
      "a feed whose side ended before the day and whose bottle came after it, though its span covers the day",
      false,
      withBottle(SIDE_BEFORE_THE_DAY, OCT_8.end + HOUR),
    ],
    [
      "a feed whose side ended before the day and whose bottle came during it",
      true,
      withBottle(SIDE_BEFORE_THE_DAY, OCT_8.start + HOUR),
    ],
  ])("answers %s with %s", (_label, touches, feed) => {
    expect(feedTouches(OCT_8, feed, NOW)).toBe(touches)
  })

  it("follows a running side up to now, so it reaches today but not tomorrow", () => {
    const running = nursing(OCT_8.start - HOUR, null)
    expect(feedTouches(OCT_8, running, NOW)).toBe(true)
    expect(feedTouches(zonedDayBounds("2026-10-09", VANCOUVER), running, NOW)).toBe(false)
  })

  it("keeps a side a phone started ahead of the clock in the day it started, before any time has run (AC 21)", () => {
    expect(feedTouches(OCT_8, nursing(NOW + 2 * MINUTE, null), NOW)).toBe(true)
  })
})

describe("sleepTouches", () => {
  it.each([
    ["a sleep during the day", true, asleep(OCT_8.start + HOUR, OCT_8.start + 2 * HOUR)],
    ["a sleep that ran on past the day's start", true, asleep(OCT_8.start - HOUR, OCT_8.start + MINUTE)],
    ["a sleep that ended as the day began", false, asleep(OCT_8.start - HOUR, OCT_8.start)],
    ["a sleep that began as the day ended", false, asleep(OCT_8.end, OCT_8.end + HOUR)],
    ["a sleep that covers the whole day", true, asleep(OCT_8.start - HOUR, OCT_8.end + HOUR)],
  ])("answers %s with %s", (_label, touches, sleep) => {
    expect(sleepTouches(OCT_8, sleep, NOW)).toBe(touches)
  })

  it("follows a running sleep up to now, so it reaches today but not tomorrow", () => {
    const running = asleep(OCT_8.start - HOUR, null)
    expect(sleepTouches(OCT_8, running, NOW)).toBe(true)
    expect(sleepTouches(zonedDayBounds("2026-10-09", VANCOUVER), running, NOW)).toBe(false)
  })

  it("keeps a sleep a phone started ahead of the clock in the day it started, before any time has run (AC 21)", () => {
    expect(sleepTouches(OCT_8, asleep(NOW + 2 * MINUTE, null), NOW)).toBe(true)
  })
})

describe("sumTotals", () => {
  it("is all zeros for no days", () => {
    expect(sumTotals([])).toEqual(NOTHING)
  })

  it("adds every count, each side's seconds and each amount", () => {
    const day = {
      feedsStarted: 2,
      leftSeconds: 600,
      rightSeconds: 300,
      nursingSeconds: 900,
      breastMilkMl: 40.5,
      formulaMl: 20,
      bottleMl: 60.5,
      diapers: 3,
      wetDiapers: 2,
      dirtyDiapers: 2,
      sleepsStarted: 3,
      sleepSeconds: 5400,
      napSeconds: 1800,
      nightSeconds: 3600,
      longestSleepSeconds: 2400,
    }
    expect(sumTotals([day, day])).toEqual({
      feedsStarted: 4,
      leftSeconds: 1200,
      rightSeconds: 600,
      nursingSeconds: 1800,
      breastMilkMl: 81,
      formulaMl: 40,
      bottleMl: 121,
      diapers: 6,
      wetDiapers: 4,
      dirtyDiapers: 4,
      sleepsStarted: 6,
      sleepSeconds: 10_800,
      napSeconds: 3600,
      nightSeconds: 7200,
      longestSleepSeconds: 2400,
    })
  })

  it("keeps the longest of the days' longest sleeps, since each counts whole on the day it started", () => {
    const days = [2400, 7200, 600].map((longestSleepSeconds) => ({ ...NOTHING, longestSleepSeconds }))
    expect(sumTotals(days)).toEqual({ ...NOTHING, longestSleepSeconds: 7200 })
  })

  it("adds amounts in tenths of a mL, so 0.1 mL and 0.2 mL make 0.3 mL", () => {
    const tenth = { ...NOTHING, formulaMl: 0.1, bottleMl: 0.1 }
    const fifth = { ...NOTHING, formulaMl: 0.2, bottleMl: 0.2 }
    expect(sumTotals([tenth, fifth])).toMatchObject({ formulaMl: 0.3, bottleMl: 0.3 })
  })
})

describe("totalsByDay", () => {
  it("gives each date its bounds in the zone and its own totals, counting the AC 4 feed on the day it started", () => {
    expect(totalsByDay(["2026-10-06", "2026-10-07"], VANCOUVER, feedsOnly([AC4_FEED]), NOW)).toEqual([
      {
        date: "2026-10-06",
        bounds: zonedDayBounds("2026-10-06", VANCOUVER),
        totals: { ...NOTHING, feedsStarted: 1, leftSeconds: 600, nursingSeconds: 600 },
      },
      {
        date: "2026-10-07",
        bounds: zonedDayBounds("2026-10-07", VANCOUVER),
        totals: {
          ...NOTHING,
          leftSeconds: 300,
          rightSeconds: 900,
          nursingSeconds: 1200,
          breastMilkMl: 50,
          formulaMl: 50,
          bottleMl: 100,
        },
      },
    ])
  })

  it.each(AC23_DAY_LENGTHS)("gives $date in $zone all $hours of its hours (AC 23)", ({ zone, date, hours }) => {
    const lengths = totalsByDay([date], zone, feedsOnly([]), NOW).map(({ bounds }) => bounds.end - bounds.start)
    expect(lengths).toEqual([hours * HOUR])
  })

  it("gives the AC 12 sleep's two days their own parts of it, and counts it on the day it started (AC 12)", () => {
    const sleeps = [asleep(AC12_MIDNIGHT_SLEEP.start, AC12_MIDNIGHT_SLEEP.end, "night")]
    const days = totalsByDay(["2026-10-06", "2026-10-07"], VANCOUVER, { feeds: [], diapers: [], sleeps }, NOW)
    expect(days.map(({ totals }) => totals)).toEqual([
      { ...NOTHING, sleepsStarted: 1, sleepSeconds: 1800, nightSeconds: 1800, longestSleepSeconds: 5400 },
      { ...NOTHING, sleepSeconds: 3600, nightSeconds: 3600 },
    ])
  })
})

const minuteOf = (instant: number) => Math.floor(instant / MINUTE) * MINUTE

const feedsNear = (anchor: number) =>
  fc
    .array(
      fc.tuple(fc.integer({ min: -6 * 24 * 60, max: 6 * 24 * 60 }), fc.integer({ min: 0, max: 8 * 60 }), fc.nat(5000)),
      { maxLength: 12 },
    )
    .map((rows) =>
      rows.map(([offset, minutes, tenths]) => {
        const start = minuteOf(anchor) + offset * MINUTE
        return minutes === 0 ? bottleAt(start, (tenths + 1) / 10) : nursing(start, start + minutes * MINUTE)
      }),
    )

const diapersNear = (anchor: number) =>
  fc.array(fc.integer({ min: -6 * 24 * 60, max: 6 * 24 * 60 }), { maxLength: 8 }).map((offsets) =>
    offsets.map((offset): DiaperChange => ({
      occurredAt: minuteOf(anchor) + offset * MINUTE,
      wet: true,
      dirty: false,
    })),
  )

const sleepsNear = (anchor: number) =>
  fc
    .array(
      fc.tuple(
        fc.integer({ min: -6 * 24 * 60, max: 6 * 24 * 60 }),
        fc.integer({ min: 1, max: 14 * 60 }),
        fc.constantFrom<SleepKind>("nap", "night"),
      ),
      { maxLength: 8 },
    )
    .map((rows) =>
      rows.map(([offset, minutes, kind]) => {
        const start = minuteOf(anchor) + offset * MINUTE
        return asleep(start, start + minutes * MINUTE, kind)
      }),
    )

const household = zonedInstants.chain(([instant, zone]) =>
  fc.tuple(
    fc.constant(zone),
    fc.constant(instant),
    feedsNear(instant),
    diapersNear(instant),
    sleepsNear(instant),
    fc.boolean(),
    fc.integer({ min: 0, max: 3 * 24 * 60 }),
  ),
)

describe("a period's days", () => {
  it("add up to the week's totals and to the month's, across clock changes, with a side and a sleep still running", () => {
    fc.assert(
      fc.property(household, ([zone, instant, closed, diapers, slept, running, minutesRun]) => {
        const feeds = running ? [...closed, nursing(minuteOf(instant), null)] : closed
        const sleeps = running ? [...slept, asleep(minuteOf(instant), null, "night")] : slept
        const now = running ? minuteOf(instant) + minutesRun * MINUTE : instant + 7 * DAY
        const date = localDateOf(instant, zone)
        const week = isoWeekOfDate(date)
        const month = monthOfDate(date)
        const periods = [
          { dates: isoWeekDates(week), bounds: isoWeekBounds(week, zone) },
          { dates: monthDates(month), bounds: monthBounds(month, zone) },
        ]
        for (const { dates, bounds } of periods) {
          const days = totalsByDay(dates, zone, { feeds, diapers, sleeps }, now)
          expect(sumTotals(days.map(({ totals }) => totals))).toEqual(totalsIn(bounds, { feeds, diapers, sleeps }, now))
        }
      }),
    )
  })
})
