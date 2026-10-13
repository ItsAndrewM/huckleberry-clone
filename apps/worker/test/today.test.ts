import { Last24h, SavedDiaper, SavedFeed, SavedSleep, Today } from "@bt/contracts"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ANDREW, HOUR_MS, MINUTE_MS, minutesAgo, NO_TOTALS, NOW, seededHousehold } from "./fixtures.ts"
import { get, type Household, sendJson } from "./requests.ts"

const decodeToday = Schema.decodeUnknownSync(Schema.toCodecJson(Today))
const decodeLast24h = Schema.decodeUnknownSync(Schema.toCodecJson(Last24h))
const decodeSavedDiaper = Schema.decodeUnknownSync(Schema.toCodecJson(SavedDiaper))
const decodeSavedFeed = Schema.decodeUnknownSync(Schema.toCodecJson(SavedFeed))
const decodeSavedSleep = Schema.decodeUnknownSync(Schema.toCodecJson(SavedSleep))

const okBody = async (household: Household, path: string) => {
  const response = await get(household, path, ANDREW.email)
  expect(response.status).toBe(200)
  return response.json()
}

const today = async (household: Household) => decodeToday(await okBody(household, "/api/today"))
const last24h = async (household: Household) => decodeLast24h(await okBody(household, "/api/last24h"))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("GET /api/today", () => {
  it("answers 200, no-store, with the household's day and nothing logged yet", async () => {
    const response = await get(await seededHousehold(), "/api/today", ANDREW.email)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      date: "2026-10-08",
      totals: NO_TOTALS,
      activeFeed: null,
      lastFeed: null,
      activeSleep: null,
      lastSleep: null,
      prefill: { lastBottle: null, lastSide: null },
      recent: [],
      doses: [],
    })
  })

  it("shows a diaper a phone logged ahead of the clock at once, in the totals and the recent list (AC 21)", async () => {
    const household = await seededHousehold()
    const logging = { actionId: crypto.randomUUID(), occurredAt: NOW + 2 * MINUTE_MS, wet: false, dirty: true }
    const { diaper } = decodeSavedDiaper((await sendJson(household, "POST", "/api/diapers", logging)).body)
    expect(await today(household)).toMatchObject({
      totals: { diapers: 1, wetDiapers: 0, dirtyDiapers: 1 },
      recent: [{ kind: "diaper", diaper }],
    })
  })

  it("answers a running feed as the active and the last feed, its time growing with the household's clock", async () => {
    const household = await seededHousehold()
    const starting = { actionId: crypto.randomUUID(), side: "right", startedAt: minutesAgo(20) }
    const { feed } = decodeSavedFeed((await sendJson(household, "POST", "/api/feeds/start", starting)).body)
    expect(await today(household)).toMatchObject({
      totals: { feedsStarted: 1, rightSeconds: 1200 },
      activeFeed: feed,
      lastFeed: feed,
      prefill: { lastSide: "right" },
    })
    vi.setSystemTime(NOW + 10 * MINUTE_MS)
    expect((await today(household)).totals.rightSeconds).toBe(1800)
  })

  it("answers a running sleep as the active and the last sleep, its time growing with the household's clock", async () => {
    const household = await seededHousehold()
    const starting = { actionId: crypto.randomUUID(), kind: "nap", startedAt: minutesAgo(30) }
    const { sleep } = decodeSavedSleep((await sendJson(household, "POST", "/api/sleeps/start", starting)).body)
    expect(await today(household)).toMatchObject({
      totals: { sleepsStarted: 1, sleepSeconds: 1800, napSeconds: 1800, longestSleepSeconds: 1800 },
      activeSleep: sleep,
      lastSleep: sleep,
    })
    vi.setSystemTime(NOW + 10 * MINUTE_MS)
    expect((await today(household)).totals.sleepSeconds).toBe(2400)
  })
})

describe("GET /api/last24h", () => {
  it("answers 200, no-store, with the totals from 24 hours before now", async () => {
    const household = await seededHousehold()
    const bottle = { occurredAt: minutesAgo(30), breastMilkMl: 40, formulaMl: 20 }
    await sendJson(household, "POST", "/api/feeds", { actionId: crypto.randomUUID(), segments: [], portions: [bottle] })
    const response = await get(household, "/api/last24h", ANDREW.email)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(decodeLast24h(await response.json())).toEqual({
      from: NOW - 24 * HOUR_MS,
      totals: { ...NO_TOTALS, feedsStarted: 1, breastMilkMl: 40, formulaMl: 20, bottleMl: 60 },
    })
  })

  it("reads the household's clock for each request, so the 24 hours move with it", async () => {
    const household = await seededHousehold()
    expect((await last24h(household)).from).toBe(NOW - 24 * HOUR_MS)
    vi.setSystemTime(NOW + HOUR_MS)
    expect((await last24h(household)).from).toBe(NOW + HOUR_MS - 24 * HOUR_MS)
  })
})

describe("GET /api/today and GET /api/last24h", () => {
  it.each(["/api/today", "/api/last24h"])("refuse a stranger at %s with 401", async (path) => {
    const response = await get(await seededHousehold(), path, "stranger@example.test")
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ _tag: "Unauthorized" })
  })
})
