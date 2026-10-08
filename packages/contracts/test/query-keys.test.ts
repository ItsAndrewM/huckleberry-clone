import { affectedPeriods, type Interval } from "@bt/domain"
import { Exit, Schema } from "effect"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { Changed, QueryKey, queryKeys } from "../src/index.ts"

const FIRST_INSTANT = Date.UTC(2000, 0, 1)
const LAST_INSTANT = Date.UTC(2100, 0, 1) - 1
const HOUR_MS = 3_600_000

const decodeChanged = Schema.decodeUnknownExit(Schema.toCodecJson(Changed))
const decodesAsKey = Schema.is(QueryKey)

const changedFor = (before: Interval | null, after: Interval | null, zone: string): ReadonlyArray<QueryKey> => [
  queryKeys.today,
  queryKeys.last24h,
  ...affectedPeriods(before, after, zone),
]

describe("queryKeys", () => {
  it.each([
    [queryKeys.me, ["me"]],
    [queryKeys.today, ["today"]],
    [queryKeys.last24h, ["last24h"]],
    [queryKeys.day("2026-10-06"), ["day", "2026-10-06"]],
    [queryKeys.week("2026-W41"), ["week", "2026-W41"]],
    [queryKeys.month("2026-10"), ["month", "2026-10"]],
    [queryKeys.growth, ["growth"]],
    [queryKeys.deleted, ["deleted"]],
  ])("builds %j, a key the client decodes", (key, expected) => {
    expect(key).toEqual(expected)
    expect(decodesAsKey(key)).toBe(true)
  })

  it.each([[["sleep"]], [["day"]], [["day", "2026-02-30"]], [["week", "2026-10"]], [["today", "2026-10-06"]], [[]]])(
    "rejects %j",
    (key) => {
      expect(decodesAsKey(key)).toBe(false)
    },
  )
})

describe("the changed list", () => {
  it.each(["Etc/GMT+12", "Pacific/Pago_Pago", "America/Vancouver", "UTC", "Australia/Lord_Howe", "Pacific/Kiritimati"])(
    "decodes the keys of the first and last instants in range in %s, whose dates can fall in 1999 or 2100",
    (zone) => {
      const edges = [
        { start: FIRST_INSTANT, end: FIRST_INSTANT },
        { start: LAST_INSTANT, end: LAST_INSTANT },
      ]
      for (const edge of edges) expect(Exit.isSuccess(decodeChanged(changedFor(edge, null, zone)))).toBe(true)
    },
  )

  it("decodes every key affectedPeriods derives from instants in range, in every zone", () => {
    const zones = Intl.supportedValuesOf("timeZone")
    const nearEdge = (edge: number) => fc.integer({ min: edge - 2 * 24 * HOUR_MS, max: edge + 2 * 24 * HOUR_MS })
    const instant = fc
      .oneof(nearEdge(FIRST_INSTANT), nearEdge(LAST_INSTANT), fc.integer({ min: FIRST_INSTANT, max: LAST_INSTANT }))
      .map((ms) => Math.min(Math.max(ms, FIRST_INSTANT), LAST_INSTANT))
    const interval = fc
      .tuple(instant, fc.integer({ min: 0, max: 72 * HOUR_MS }))
      .map(([start, length]) => ({ start, end: Math.min(start + length, LAST_INSTANT) }))
    fc.assert(
      fc.property(fc.option(interval), fc.option(interval), fc.constantFrom(...zones), (before, after, zone) => {
        expect(Exit.isSuccess(decodeChanged(changedFor(before, after, zone)))).toBe(true)
      }),
      { numRuns: 500 },
    )
  })
})
