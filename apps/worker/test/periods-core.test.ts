import type { NewMeasurement, PortionEntry, SegmentEntry } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { deleteDiaper, logDiaper } from "../src/core/diapers.ts"
import { deletePortion, deleteSegment } from "../src/core/feeds/components.ts"
import { deleteFeed } from "../src/core/feeds/feed-edits.ts"
import { pauseFeed, startFeed, switchSide } from "../src/core/feeds/lifecycle.ts"
import { logFeed } from "../src/core/feeds/log.ts"
import { deleteMeasurement, logMeasurement } from "../src/core/growth.ts"
import { dayOf, monthOf, weekOf } from "../src/core/periods.ts"
import { bottle, newFeed, segment } from "./feed-fixtures.ts"
import {
  ACTION_ID,
  ANDREW,
  HOUR_MS,
  inHousehold,
  MINUTE_MS,
  minutesAgo,
  NO_TOTALS,
  NOW,
  SEED,
  saved,
  seededHousehold,
  stampOf,
} from "./fixtures.ts"
import { inStorage } from "./requests.ts"

const OCT_7 = { start: Date.UTC(2026, 9, 7, 7), end: Date.UTC(2026, 9, 8, 7) }
const OCT_8 = { start: Date.UTC(2026, 9, 8, 7), end: Date.UTC(2026, 9, 9, 7) }
const OCT_7_AT_23_50 = Date.UTC(2026, 9, 8, 6, 50)
const ac4 = (minutes: number) => OCT_7_AT_23_50 + minutes * MINUTE_MS

const WEDNESDAY_OCT_14_NOON = Date.UTC(2026, 9, 14, 19)
const SUNDAY_OCT_11_AT_23_50 = Date.UTC(2026, 9, 12, 6, 50)
const sundayNight = (minutes: number) => SUNDAY_OCT_11_AT_23_50 + minutes * MINUTE_MS

const OCT_7_AT_23_30 = Date.UTC(2026, 9, 8, 6, 30)
const OCT_8_AT_00_15 = Date.UTC(2026, 9, 8, 7, 15)
const OCT_8_AT_03_00 = Date.UTC(2026, 9, 8, 10)

const LONDON_OCT_28 = Date.UTC(2026, 9, 28, 12)

const fed = (sql: SqlStorage, segments: SegmentEntry[], portions: PortionEntry[] = [], now = NOW) =>
  saved(logFeed(stampOf(sql, ANDREW.email, now), newFeed(segments, portions))(sql))

const diaperAt = (sql: SqlStorage, occurredAt: number, now = NOW) =>
  saved(logDiaper(stampOf(sql, ANDREW.email, now), { actionId: ACTION_ID, occurredAt, wet: true, dirty: false })(sql))

const weighed = (measuredAt: number): NewMeasurement => ({
  actionId: ACTION_ID,
  measuredAt,
  weightG: 4210.5,
  lengthCm: null,
  headCm: null,
})

const measuredAt = (sql: SqlStorage, at: number, now = NOW) =>
  saved(logMeasurement(stampOf(sql, ANDREW.email, now), weighed(at))(sql))

const idAt = (parts: ReadonlyArray<{ readonly id: string }>, index: number) => parts[index]?.id ?? "missing"

const inLondon = async <R>(read: (sql: SqlStorage) => R) =>
  inStorage(await seededHousehold({ ...SEED, timeZone: "Europe/London" }), read)

describe("dayOf", () => {
  it("answers a day with nothing logged with its bounds in the household's zone, when it answered, and nothing else", async () => {
    expect(await inHousehold((sql) => dayOf(sql, "2026-10-08", NOW))).toEqual({
      date: "2026-10-08",
      bounds: OCT_8,
      asOf: NOW,
      totals: NO_TOTALS,
      feeds: [],
      diapers: [],
      measurements: [],
    })
  })

  it("holds a feed across midnight whole in both days, and counts it on the day it started (AC 4)", async () => {
    const { feed, before, after } = await inHousehold((sql) => {
      const segments = [segment("left", ac4(0), ac4(15)), segment("right", ac4(15), ac4(30))]
      const feed = fed(sql, segments, [bottle(ac4(30), 50, 0), bottle(ac4(35), 0, 50)])
      return { feed, before: dayOf(sql, "2026-10-07", NOW), after: dayOf(sql, "2026-10-08", NOW) }
    })
    expect(before.feeds).toEqual([feed])
    expect(after.feeds).toEqual([feed])
    expect(before.totals).toEqual({ ...NO_TOTALS, feedsStarted: 1, leftSeconds: 600, nursingSeconds: 600 })
    expect(after.totals).toEqual({
      ...NO_TOTALS,
      leftSeconds: 300,
      rightSeconds: 900,
      nursingSeconds: 1200,
      breastMilkMl: 50,
      formulaMl: 50,
      bottleMl: 100,
    })
  })

  it("holds a running feed with its side still open, counts it up to when it answered, and leaves it out of tomorrow", async () => {
    const { feed, today, tomorrow } = await inHousehold((sql) => {
      const feed = saved(startFeed(stampOf(sql), { actionId: ACTION_ID, side: "left", startedAt: minutesAgo(20) })(sql))
      return { feed, today: dayOf(sql, "2026-10-08", NOW), tomorrow: dayOf(sql, "2026-10-09", NOW) }
    })
    expect(feed.segments.map(({ endedAt }) => endedAt)).toEqual([null])
    expect(today.feeds).toEqual([feed])
    expect(today.totals).toEqual({ ...NO_TOTALS, feedsStarted: 1, leftSeconds: 1200, nursingSeconds: 1200 })
    expect(tomorrow.feeds).toEqual([])
  })

  it("holds a feed a phone started ahead of the clock, before any time has run on it (AC 21)", async () => {
    const { feed, today } = await inHousehold((sql) => {
      const starting = { actionId: ACTION_ID, side: "right" as const, startedAt: NOW + 2 * MINUTE_MS }
      const feed = saved(startFeed(stampOf(sql), starting)(sql))
      return { feed, today: dayOf(sql, "2026-10-08", NOW) }
    })
    expect(today.feeds).toEqual([feed])
    expect(today.totals).toEqual({ ...NO_TOTALS, feedsStarted: 1 })
  })

  it("leaves a feed paused before the day began out of it, though it's still the active feed", async () => {
    const { paused, yesterday, today } = await inHousehold((sql) => {
      const starting = { actionId: ACTION_ID, side: "left" as const, startedAt: OCT_8.start - 2 * HOUR_MS }
      const started = saved(startFeed(stampOf(sql), starting)(sql))
      const pausing = { actionId: ACTION_ID, version: started.version, occurredAt: OCT_8.start - HOUR_MS }
      const paused = saved(pauseFeed(stampOf(sql), started.id, pausing)(sql))
      return { paused, yesterday: dayOf(sql, "2026-10-07", NOW), today: dayOf(sql, "2026-10-08", NOW) }
    })
    expect(paused.status).toBe("active")
    expect(yesterday.feeds).toEqual([paused])
    expect(today.feeds).toEqual([])
  })

  it("leaves a feed that ended as the day began to the day before, though its session's end touches this one", async () => {
    const { feed, yesterday, today } = await inHousehold((sql) => {
      const feed = fed(sql, [segment("left", OCT_8.start - 30 * MINUTE_MS, OCT_8.start)])
      return { feed, yesterday: dayOf(sql, "2026-10-07", NOW), today: dayOf(sql, "2026-10-08", NOW) }
    })
    expect(feed.endedAt).toBe(OCT_8.start)
    expect(yesterday.feeds).toEqual([feed])
    expect(today.feeds).toEqual([])
  })

  it("holds a bottle, a diaper and a measurement at the day's first moment, and leaves the next day's first moment to that day", async () => {
    const { atStart, atEnd, day, next } = await inHousehold((sql) => {
      const logAt = (at: number) => ({
        feeds: [fed(sql, [], [bottle(at)])],
        diapers: [diaperAt(sql, at)],
        measurements: [measuredAt(sql, at)],
      })
      const atStart = logAt(OCT_7.start)
      const atEnd = logAt(OCT_7.end)
      return { atStart, atEnd, day: dayOf(sql, "2026-10-07", NOW), next: dayOf(sql, "2026-10-08", NOW) }
    })
    expect(day).toMatchObject(atStart)
    expect(next).toMatchObject(atEnd)
  })

  it("lists feeds, diapers and measurements in time order, not in the order they were logged", async () => {
    const { feeds, diapers, measurements, day } = await inHousehold((sql) => {
      const feeds = [
        fed(sql, [], [bottle(minutesAgo(30))]),
        fed(sql, [segment("left", minutesAgo(200), minutesAgo(190))]),
      ]
      const diapers = [diaperAt(sql, minutesAgo(20)), diaperAt(sql, minutesAgo(220))]
      const measurements = [measuredAt(sql, minutesAgo(10)), measuredAt(sql, minutesAgo(240))]
      return { feeds, diapers, measurements, day: dayOf(sql, "2026-10-08", NOW) }
    })
    expect(day.feeds).toEqual(feeds.toReversed())
    expect(day.diapers).toEqual(diapers.toReversed())
    expect(day.measurements).toEqual(measurements.toReversed())
  })

  it("leaves out whatever was deleted, and a feed whose only part in the day was", async () => {
    const { trimmed, day } = await inHousehold((sql) => {
      const keep = { actionId: ACTION_ID, deleteIfEmpty: false }
      const dropped = fed(sql, [segment("right", minutesAgo(60), minutesAgo(45))])
      saved(deleteFeed(stampOf(sql), dropped.id, { actionId: ACTION_ID, version: dropped.version })(sql))
      const logged = fed(
        sql,
        [segment("left", minutesAgo(120), minutesAgo(110)), segment("right", minutesAgo(110), minutesAgo(100))],
        [bottle(minutesAgo(95))],
      )
      const lessRight = saved(
        deleteSegment(stampOf(sql), idAt(logged.segments, 1), { ...keep, version: logged.version })(sql),
      )
      const trimmed = saved(
        deletePortion(stampOf(sql), idAt(logged.portions, 0), { ...keep, version: lessRight.version })(sql),
      )
      const lastNight = fed(
        sql,
        [segment("left", OCT_8.start - HOUR_MS, OCT_8.start - 30 * MINUTE_MS)],
        [bottle(minutesAgo(80))],
      )
      saved(deletePortion(stampOf(sql), idAt(lastNight.portions, 0), { ...keep, version: lastNight.version })(sql))
      const diaper = diaperAt(sql, minutesAgo(30))
      saved(deleteDiaper(stampOf(sql), diaper.id, { actionId: ACTION_ID, version: diaper.version })(sql))
      const measurement = measuredAt(sql, minutesAgo(20))
      saved(deleteMeasurement(stampOf(sql), measurement.id, { actionId: ACTION_ID, version: measurement.version })(sql))
      return { trimmed, day: dayOf(sql, "2026-10-08", NOW) }
    })
    expect(day.feeds).toEqual([trimmed])
    expect(day.diapers).toEqual([])
    expect(day.measurements).toEqual([])
    expect(day.totals).toEqual({ ...NO_TOTALS, feedsStarted: 1, leftSeconds: 600, nursingSeconds: 600 })
  })

  it("takes the day in the household's zone, all 25 hours of a day the clocks go back (AC 23)", async () => {
    const day = await inLondon((sql) => dayOf(sql, "2026-10-25", LONDON_OCT_28))
    expect(day.bounds).toEqual({ start: Date.UTC(2026, 9, 24, 23), end: Date.UTC(2026, 9, 26, 0) })
  })
})

describe("at 3 AM, with a feed from before midnight still running", () => {
  it("holds it whole in yesterday and today with its right side open, each day counting its own minutes, and the week adding them up", async () => {
    const { feed, yesterday, today, tomorrow, week } = await inHousehold((sql) => {
      const starting = { actionId: ACTION_ID, side: "left" as const, startedAt: OCT_7_AT_23_30 }
      const started = saved(startFeed(stampOf(sql, ANDREW.email, OCT_7_AT_23_30), starting)(sql))
      const switching = { actionId: ACTION_ID, version: started.version, occurredAt: OCT_8_AT_00_15 }
      return {
        feed: saved(switchSide(stampOf(sql, ANDREW.email, OCT_8_AT_00_15), started.id, switching)(sql)),
        yesterday: dayOf(sql, "2026-10-07", OCT_8_AT_03_00),
        today: dayOf(sql, "2026-10-08", OCT_8_AT_03_00),
        tomorrow: dayOf(sql, "2026-10-09", OCT_8_AT_03_00),
        week: weekOf(sql, "2026-W41", OCT_8_AT_03_00),
      }
    })
    expect(feed.segments.map(({ endedAt }) => endedAt)).toEqual([OCT_8_AT_00_15, null])
    expect(yesterday.feeds).toEqual([feed])
    expect(yesterday.totals).toEqual({ ...NO_TOTALS, feedsStarted: 1, leftSeconds: 1800, nursingSeconds: 1800 })
    expect(today.feeds).toEqual([feed])
    expect(today.totals).toEqual({ ...NO_TOTALS, leftSeconds: 900, rightSeconds: 9900, nursingSeconds: 10800 })
    expect(tomorrow.feeds).toEqual([])
    expect(week.days.slice(2, 4).map(({ totals }) => totals)).toEqual([yesterday.totals, today.totals])
    expect(week.totals).toEqual({
      ...NO_TOTALS,
      feedsStarted: 1,
      leftSeconds: 2700,
      rightSeconds: 9900,
      nursingSeconds: 12600,
    })
  })
})

describe("weekOf", () => {
  it("answers Monday to Sunday, each day with its bounds and totals, the week's totals their sum, and every record in the week", async () => {
    const { feed, diaper, week, before } = await inHousehold((sql) => {
      const segments = [segment("left", sundayNight(0), sundayNight(30))]
      const feed = fed(sql, segments, [bottle(sundayNight(35), 40, 20)], WEDNESDAY_OCT_14_NOON)
      const diaper = diaperAt(sql, Date.UTC(2026, 9, 13, 16), WEDNESDAY_OCT_14_NOON)
      return {
        feed,
        diaper,
        week: weekOf(sql, "2026-W42", WEDNESDAY_OCT_14_NOON),
        before: weekOf(sql, "2026-W41", WEDNESDAY_OCT_14_NOON),
      }
    })
    const monday = { start: Date.UTC(2026, 9, 12, 7), end: Date.UTC(2026, 9, 13, 7) }
    expect(week.week).toBe("2026-W42")
    expect(week.bounds).toEqual({ start: monday.start, end: Date.UTC(2026, 9, 19, 7) })
    expect(week.asOf).toBe(WEDNESDAY_OCT_14_NOON)
    expect(week.days.map(({ date }) => date)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ])
    expect(week.days[0]).toEqual({
      date: "2026-10-12",
      bounds: monday,
      totals: { ...NO_TOTALS, leftSeconds: 1200, nursingSeconds: 1200, breastMilkMl: 40, formulaMl: 20, bottleMl: 60 },
    })
    expect(week.days[1]?.totals).toEqual({ ...NO_TOTALS, diapers: 1, wetDiapers: 1 })
    expect(week.days.slice(2).map(({ totals }) => totals)).toEqual(Array(5).fill(NO_TOTALS))
    expect(week.totals).toEqual({
      ...NO_TOTALS,
      leftSeconds: 1200,
      nursingSeconds: 1200,
      breastMilkMl: 40,
      formulaMl: 20,
      bottleMl: 60,
      diapers: 1,
      wetDiapers: 1,
    })
    expect(week.feeds).toEqual([feed])
    expect(week.diapers).toEqual([diaper])
    expect(before.feeds).toEqual([feed])
    expect(before.totals).toEqual({ ...NO_TOTALS, feedsStarted: 1, leftSeconds: 600, nursingSeconds: 600 })
  })
})

describe("a week's totals", () => {
  it("add up its days' whole seconds, so a side that crossed midnight mid-second counts a second short", async () => {
    const week = await inHousehold((sql) => {
      const tuesdayBegins = Date.UTC(2026, 9, 13, 7)
      fed(sql, [segment("left", tuesdayBegins - 1500, tuesdayBegins + 1500)], [], WEDNESDAY_OCT_14_NOON)
      return weekOf(sql, "2026-W42", WEDNESDAY_OCT_14_NOON)
    })
    expect(week.days.slice(0, 2).map(({ totals }) => totals.leftSeconds)).toEqual([1, 1])
    expect(week.totals.leftSeconds).toBe(2)
  })
})

describe("monthOf", () => {
  it("answers every day of the month, a 25-hour one among them, with the month's records", async () => {
    const { measurement, month } = await inLondon((sql) => {
      const measurement = measuredAt(sql, Date.UTC(2026, 9, 20, 9), LONDON_OCT_28)
      return { measurement, month: monthOf(sql, "2026-10", LONDON_OCT_28) }
    })
    expect(month.month).toBe("2026-10")
    expect(month.bounds).toEqual({ start: Date.UTC(2026, 8, 30, 23), end: Date.UTC(2026, 10, 1, 0) })
    expect(month.days).toHaveLength(31)
    expect(month.days.find(({ date }) => date === "2026-10-25")?.bounds).toEqual({
      start: Date.UTC(2026, 9, 24, 23),
      end: Date.UTC(2026, 9, 26, 0),
    })
    expect(month.measurements).toEqual([measurement])
    expect(month.totals).toEqual(NO_TOTALS)
  })
})
