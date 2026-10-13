import { Exit, Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  DayPeriod,
  DayTotals,
  type Diaper,
  type Feed,
  type Measurement,
  MonthPeriod,
  PeriodBounds,
  PeriodsGroup,
  type Sleep,
  type Totals,
  WeekPeriod,
} from "../src/index.ts"

const MINUTE_MS = 60_000
const AT = Date.UTC(2026, 9, 12, 14, 30)
const OCT_12 = { start: Date.UTC(2026, 9, 12, 7), end: Date.UTC(2026, 9, 13, 7) }

const TOTALS: Totals = {
  feedsStarted: 1,
  leftSeconds: 900,
  rightSeconds: 0,
  nursingSeconds: 900,
  breastMilkMl: 30,
  formulaMl: 0,
  bottleMl: 30,
  diapers: 1,
  wetDiapers: 1,
  dirtyDiapers: 0,
  sleepsStarted: 0,
  sleepSeconds: 0,
  napSeconds: 0,
  nightSeconds: 0,
  longestSleepSeconds: 0,
}

const FEED: Feed = {
  id: "feed-1",
  status: "active",
  startedAt: AT,
  endedAt: null,
  segments: [{ id: "segment-1", side: "left", startedAt: AT, endedAt: null }],
  portions: [{ id: "portion-1", occurredAt: AT + 5 * MINUTE_MS, breastMilkMl: 30, formulaMl: 0 }],
  version: 2,
  createdBy: "caregiver-1",
  createdAt: AT,
  updatedBy: "caregiver-1",
  updatedAt: AT + 5 * MINUTE_MS,
  deletedAt: null,
}

const DIAPER: Diaper = {
  id: "diaper-1",
  occurredAt: AT - 60 * MINUTE_MS,
  wet: true,
  dirty: false,
  version: 1,
  createdBy: "caregiver-2",
  createdAt: AT,
  updatedBy: "caregiver-2",
  updatedAt: AT,
  deletedAt: null,
}

const MEASUREMENT: Measurement = {
  id: "measurement-1",
  measuredAt: AT - 120 * MINUTE_MS,
  weightG: 4210.5,
  lengthCm: null,
  headCm: 37.5,
  version: 1,
  createdBy: "caregiver-1",
  createdAt: AT,
  updatedBy: "caregiver-1",
  updatedAt: AT,
  deletedAt: null,
}

const SLEEP: Sleep = {
  id: "sleep-1",
  kind: "nap",
  startedAt: AT - 90 * MINUTE_MS,
  endedAt: AT - 30 * MINUTE_MS,
  version: 2,
  createdBy: "caregiver-1",
  createdAt: AT - 90 * MINUTE_MS,
  updatedBy: "caregiver-1",
  updatedAt: AT - 30 * MINUTE_MS,
  deletedAt: null,
}

const PERIOD = {
  bounds: OCT_12,
  asOf: AT + 15 * MINUTE_MS,
  totals: TOTALS,
  feeds: [FEED],
  diapers: [DIAPER],
  sleeps: [SLEEP],
  measurements: [MEASUREMENT],
}

const DAY = { date: "2026-10-12", ...PERIOD }

const dayTotals = (date: string, day: number) => ({
  date,
  bounds: { start: OCT_12.start + day * 24 * 60 * MINUTE_MS, end: OCT_12.end + day * 24 * 60 * MINUTE_MS },
  totals: TOTALS,
})

const decodes = <A, I extends Schema.Json>(schema: Schema.Codec<A, I>, input: Schema.Json) =>
  Exit.isSuccess(Schema.decodeUnknownExit(Schema.toCodecJson(schema))(input))

describe("a period's bounds", () => {
  it("are whole milliseconds, even outside the instants a record can hold, as a day in 1999 has", () => {
    expect(decodes(PeriodBounds, OCT_12)).toBe(true)
    expect(decodes(PeriodBounds, { start: Date.UTC(1999, 0, 1, 8), end: Date.UTC(1999, 0, 2, 8) })).toBe(true)
    expect(decodes(PeriodBounds, { start: OCT_12.start + 0.5, end: OCT_12.end })).toBe(false)
  })
})

describe("a day's totals", () => {
  it("names its date and its bounds beside its totals", () => {
    expect(decodes(DayTotals, dayTotals("2026-10-12", 0))).toBe(true)
    expect(decodes(DayTotals, { ...dayTotals("2026-10-12", 0), date: "2026-02-30" })).toBe(false)
  })
})

describe("a day", () => {
  it("holds its bounds, when the household answered, its totals, and every feed, diaper and measurement in it", () => {
    expect(decodes(DayPeriod, DAY)).toBe(true)
  })

  it("still reads when a later version adds a field, as M3.1's sleeps will be", () => {
    expect(decodes(DayPeriod, { ...DAY, sleeps: [] })).toBe(true)
  })

  it.each([
    ["a date that doesn't exist", { date: "2026-02-30" }],
    ["an answer from before 2000", { asOf: Date.UTC(1999, 11, 31) }],
    ["an answer whose feeds are null", { feeds: null }],
    ["an answer whose diapers are null", { diapers: null }],
    ["an answer whose measurements are null", { measurements: null }],
  ])("refuses %s", (_label, change) => {
    expect(decodes(DayPeriod, { ...DAY, ...change })).toBe(false)
  })
})

describe("a week and a month", () => {
  it("hold the same as a day, plus the totals of each of their days", () => {
    const days = [0, 1, 2, 3, 4, 5, 6].map((day) => dayTotals(`2026-10-${12 + day}`, day))
    expect(decodes(WeekPeriod, { ...PERIOD, week: "2026-W42", days })).toBe(true)
    expect(decodes(MonthPeriod, { ...PERIOD, month: "2026-10", days })).toBe(true)
  })

  it("refuses a week or a month that doesn't exist", () => {
    expect(decodes(WeekPeriod, { ...PERIOD, week: "2025-W53", days: [] })).toBe(false)
    expect(decodes(MonthPeriod, { ...PERIOD, month: "2026-13", days: [] })).toBe(false)
  })
})

describe("PeriodsGroup", () => {
  it("reads a day by its date, a week by its ISO week and a month by its year and month", () => {
    const endpoints = Object.entries(PeriodsGroup.endpoints).map(
      ([name, { method, path }]) => `${name}: ${method} ${path}`,
    )
    expect(endpoints).toEqual(["day: GET /days/:date", "week: GET /weeks/:week", "month: GET /months/:month"])
  })
})
