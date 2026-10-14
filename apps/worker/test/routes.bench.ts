import { SavedSupplement } from "@bt/contracts"
import { addDaysToDate, isoWeekOfDate, localDateOf, monthOfDate } from "@bt/domain"
import { runInDurableObject } from "cloudflare:test"
import { Schema } from "effect"
import { expect, it } from "vitest"
import { calendarOf } from "../src/core/calendar.ts"
import { ANDREW, SEED, seededHousehold } from "./fixtures.ts"
import { get, type Household, send } from "./requests.ts"
import { rowCounts, seedTwoYears, TWO_YEARS } from "./two-years.ts"

const RUNS = 7
const MINUTE_MS = 60_000
const LABEL_WIDTH = 40

interface Timing {
  readonly label: string
  readonly times: ReadonlyArray<number>
  readonly bytes: number | null
}

const median = (times: ReadonlyArray<number>) => times.toSorted((a, b) => a - b)[Math.floor(times.length / 2)] ?? 0

const timeRead = async (household: Household, label: string, path: string): Promise<Timing> => {
  const times: number[] = []
  let bytes = 0
  for (let run = 0; run < RUNS; run++) {
    const begun = performance.now()
    const response = await get(household, path, ANDREW.email)
    const body = await response.text()
    times.push(performance.now() - begun)
    if (!response.ok) throw new Error(`${path} answered ${response.status}: ${body}`)
    bytes = body.length
  }
  return { label, times, bytes }
}

const pastFeed = (startedAt: number) =>
  JSON.stringify({
    actionId: crypto.randomUUID(),
    segments: [{ side: "left", startedAt, endedAt: startedAt + 10 * MINUTE_MS }],
    portions: [],
  })

const timeFeedWrites = async (household: Household, end: number): Promise<Timing> => {
  const times: number[] = []
  for (let run = 0; run < RUNS; run++) {
    const begun = performance.now()
    const response = await send(household, "POST", "/api/feeds", pastFeed(end - (90 - run * 12) * MINUTE_MS))
    const body = await response.text()
    times.push(performance.now() - begun)
    if (!response.ok) throw new Error(`POST /api/feeds answered ${response.status}: ${body}`)
  }
  return { label: "A feed write, with D9's overlap check", times, bytes: null }
}

const pastSleep = (startedAt: number) =>
  JSON.stringify({ actionId: crypto.randomUUID(), kind: "nap", startedAt, endedAt: startedAt + 5 * MINUTE_MS })

const timeSleepWrites = async (household: Household, end: number): Promise<Timing> => {
  const times: number[] = []
  for (let run = 0; run < RUNS; run++) {
    const begun = performance.now()
    const response = await send(household, "POST", "/api/sleeps", pastSleep(end - (50 - run * 6) * MINUTE_MS))
    const body = await response.text()
    times.push(performance.now() - begun)
    if (!response.ok) throw new Error(`POST /api/sleeps answered ${response.status}: ${body}`)
  }
  return { label: "A sleep write, with its overlap check", times, bytes: null }
}

const timeDoseWrites = async (household: Household, end: number): Promise<Timing> => {
  const added = await send(
    household,
    "POST",
    "/api/supplements",
    JSON.stringify({ actionId: crypto.randomUUID(), name: "Iron", dose: "1 mL" }),
  )
  const { supplement } = Schema.decodeUnknownSync(Schema.toCodecJson(SavedSupplement))(await added.json())
  const times: number[] = []
  for (let run = 0; run < RUNS; run++) {
    const occurredAt = end - (run + 1) * 24 * 60 * MINUTE_MS
    const dose = { actionId: crypto.randomUUID(), supplementId: supplement.id, occurredAt, confirmedDuplicate: false }
    const begun = performance.now()
    const response = await send(household, "POST", "/api/doses", JSON.stringify(dose))
    const body = await response.text()
    times.push(performance.now() - begun)
    if (!response.ok) throw new Error(`POST /api/doses answered ${response.status}: ${body}`)
  }
  return { label: "A dose write, with its same-day check", times, bytes: null }
}

const milliseconds = (value: number) => `${value.toFixed(0)} ms`

const row = (timing: Timing) =>
  [
    timing.label.padEnd(LABEL_WIDTH),
    milliseconds(median(timing.times)).padStart(9),
    milliseconds(Math.max(...timing.times)).padStart(9),
    (timing.bytes === null ? "" : `${(timing.bytes / 1000).toFixed(1)} kB`).padStart(12),
  ].join("")

const report = (counts: ReadonlyArray<readonly [string, number]>, timings: ReadonlyArray<Timing>) =>
  [
    `Two years of heavy logging: ${counts.map(([table, n]) => `${n.toLocaleString("en-US")} ${table}`).join(", ")}`,
    `${RUNS} runs each, timed from the test through the household's fetch`,
    ["".padEnd(LABEL_WIDTH), "median".padStart(9), "slowest".padStart(9), "answer".padStart(12)].join(""),
    ...timings.map(row),
  ].join("\n")

it("times the reads and three writes over two years of heavy logging", { timeout: 600_000 }, async () => {
  const household = await seededHousehold({ ...SEED, child: { ...SEED.child, birthDate: "2024-10-01" } })
  const end = Date.now()
  const { zone, counts } = await runInDurableObject(household, (_instance, state) => {
    state.storage.transactionSync(() => seedTwoYears(state.storage.sql, end))
    return { zone: calendarOf(state.storage.sql).zone, counts: rowCounts(state.storage.sql) }
  })
  const feeds = TWO_YEARS.days * TWO_YEARS.feedsADay
  expect(counts).toEqual([
    ["feeds", feeds],
    ["nursing_segments", 2 * feeds],
    ["bottle_portions", feeds],
    ["diapers", TWO_YEARS.days * TWO_YEARS.diapersADay],
    ["sleeps", TWO_YEARS.days * TWO_YEARS.sleepsADay],
    ["supplement_logs", TWO_YEARS.days * TWO_YEARS.dosesADay],
    ["growth_measurements", Math.ceil(TWO_YEARS.days / 7)],
  ])
  const today = localDateOf(end, zone)
  const aYearAgo = addDaysToDate(today, -364)
  const timings = [
    await timeRead(household, "Today", "/api/today"),
    await timeRead(household, "The last 24 hours", "/api/last24h"),
    await timeRead(household, "Today's day", `/api/days/${today}`),
    await timeRead(household, "This week", `/api/weeks/${isoWeekOfDate(today)}`),
    await timeRead(household, "This month", `/api/months/${monthOfDate(today)}`),
    await timeRead(household, "A day a year ago", `/api/days/${aYearAgo}`),
    await timeRead(household, "A week a year ago", `/api/weeks/${isoWeekOfDate(aYearAgo)}`),
    await timeRead(household, "A month a year ago", `/api/months/${monthOfDate(aYearAgo)}`),
    await timeRead(household, "Growth", "/api/growth"),
    await timeRead(household, "Recently deleted", "/api/deleted"),
    await timeRead(household, "Export, CSV", "/api/export.csv"),
    await timeRead(household, "Export, JSON", "/api/export.json"),
    await timeFeedWrites(household, end),
    await timeSleepWrites(household, end),
    await timeDoseWrites(household, end),
  ]
  console.log(report(counts, timings))
})
