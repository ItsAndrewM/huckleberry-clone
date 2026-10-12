import { DayPeriod, MonthPeriod, SavedFeed, WeekPeriod } from "@bt/contracts"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ANDREW, MINUTE_MS, minutesAgo, NO_TOTALS, NOW, seededHousehold } from "./fixtures.ts"
import { get, type Household, sendJson } from "./requests.ts"

const decodeDay = Schema.decodeUnknownSync(Schema.toCodecJson(DayPeriod))
const decodeWeek = Schema.decodeUnknownSync(Schema.toCodecJson(WeekPeriod))
const decodeMonth = Schema.decodeUnknownSync(Schema.toCodecJson(MonthPeriod))
const decodeSavedFeed = Schema.decodeUnknownSync(Schema.toCodecJson(SavedFeed))

const OCT_8 = { start: Date.UTC(2026, 9, 8, 7), end: Date.UTC(2026, 9, 9, 7) }

const okBody = async (household: Household, path: string) => {
  const response = await get(household, path, ANDREW.email)
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("no-store")
  return response.json()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("GET /api/days/:date", () => {
  it("answers 200, no-store, with the day's bounds in the household's zone and nothing logged yet", async () => {
    expect(await okBody(await seededHousehold(), "/api/days/2026-10-08")).toEqual({
      date: "2026-10-08",
      bounds: OCT_8,
      asOf: NOW,
      totals: NO_TOTALS,
      feeds: [],
      diapers: [],
      measurements: [],
    })
  })

  it("answers a running feed whole, its time growing with the household's clock", async () => {
    const household = await seededHousehold()
    const starting = { actionId: crypto.randomUUID(), side: "right", startedAt: minutesAgo(20) }
    const { feed } = decodeSavedFeed((await sendJson(household, "POST", "/api/feeds/start", starting)).body)
    expect(decodeDay(await okBody(household, "/api/days/2026-10-08"))).toMatchObject({
      asOf: NOW,
      totals: { feedsStarted: 1, rightSeconds: 1200 },
      feeds: [feed],
    })
    vi.setSystemTime(NOW + 10 * MINUTE_MS)
    expect(decodeDay(await okBody(household, "/api/days/2026-10-08"))).toMatchObject({
      asOf: NOW + 10 * MINUTE_MS,
      totals: { rightSeconds: 1800 },
    })
  })

  it.each(["1999-12-31", "2100-12-31"])(
    "answers %s, a day the date allows whose bounds fall outside the instants a record can hold",
    async (date) => {
      expect(decodeDay(await okBody(await seededHousehold(), `/api/days/${date}`))).toMatchObject({ date, feeds: [] })
    },
  )
})

describe("GET /api/weeks/:week and GET /api/months/:month", () => {
  it("answer 200, no-store, with seven days from Monday, and with every day of the month", async () => {
    const household = await seededHousehold()
    const week = decodeWeek(await okBody(household, "/api/weeks/2026-W41"))
    const month = decodeMonth(await okBody(household, "/api/months/2026-10"))
    expect(week.days.map(({ date }) => date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ])
    expect(month.days).toHaveLength(31)
    expect([week.asOf, month.asOf]).toEqual([NOW, NOW])
  })

  it("answers 2100-W51, the last week whose days all fall in the years a date allows", async () => {
    const week = decodeWeek(await okBody(await seededHousehold(), "/api/weeks/2100-W51"))
    expect(week).toMatchObject({ week: "2100-W51", feeds: [] })
    expect(week.days.map(({ date }) => date)).toEqual([
      "2100-12-20",
      "2100-12-21",
      "2100-12-22",
      "2100-12-23",
      "2100-12-24",
      "2100-12-25",
      "2100-12-26",
    ])
  })
})

describe("a period that isn't one", () => {
  it.each([
    ["/api/days/2026-02-30", "date"],
    ["/api/days/yesterday", "date"],
    ["/api/days/2101-01-01", "date"],
    ["/api/weeks/2025-W53", "week"],
    ["/api/weeks/2026-41", "week"],
    ["/api/weeks/2100-W52", "week"],
    ["/api/weeks/9999-W52", "week"],
    ["/api/months/2026-13", "month"],
  ])("answers %s with 400, naming the %s", async (path, field) => {
    const response = await get(await seededHousehold(), path, ANDREW.email)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ _tag: "InvalidInput", fieldErrors: [{ path: field, issue: "invalid" }] })
  })
})

describe("who can read a period", () => {
  it.each(["/api/days/2026-10-08", "/api/weeks/2026-W41", "/api/months/2026-10", "/api/days/2026-02-30"])(
    "refuses a stranger at %s with 401, before looking at the period",
    async (path) => {
      const response = await get(await seededHousehold(), path, "stranger@example.test")
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ _tag: "Unauthorized" })
    },
  )
})
