import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { affectedPeriods, splitByDays } from "../../src/index.ts"
import { AC12_MIDNIGHT_SLEEP } from "../fixtures/scenarios.ts"
import { LONDON, VANCOUVER, zonedInstants } from "../fixtures/zones.ts"

const at = (iso: string) => Date.parse(iso)
const pointAt = (iso: string) => ({ start: at(iso), end: at(iso) })

describe("affectedPeriods (D7)", () => {
  it("covers the day, week and month of a point event such as a bottle", () => {
    expect(affectedPeriods(null, pointAt("2026-10-06T19:00:00Z"), VANCOUVER)).toEqual([
      ["day", "2026-10-06"],
      ["week", "2026-W41"],
      ["month", "2026-10"],
    ])
  })

  it("gives a delete the same periods as a create", () => {
    const bottle = pointAt("2026-10-06T19:00:00Z")
    expect(affectedPeriods(bottle, null, VANCOUVER)).toEqual(affectedPeriods(null, bottle, VANCOUVER))
  })

  it("covers the old and the new periods when an edit moves a record to another week and month", () => {
    expect(affectedPeriods(pointAt("2026-10-31T19:00:00Z"), pointAt("2026-11-02T19:00:00Z"), VANCOUVER)).toEqual([
      ["day", "2026-10-31"],
      ["day", "2026-11-02"],
      ["week", "2026-W44"],
      ["week", "2026-W45"],
      ["month", "2026-10"],
      ["month", "2026-11"],
    ])
  })

  it("covers both days of the AC 12 sleep, which crosses midnight", () => {
    expect(affectedPeriods(null, AC12_MIDNIGHT_SLEEP, VANCOUVER)).toEqual([
      ["day", "2026-10-06"],
      ["day", "2026-10-07"],
      ["week", "2026-W41"],
      ["month", "2026-10"],
    ])
  })

  it("leaves out the next day for an interval that ends exactly at midnight", () => {
    const nap = { start: at("2026-10-07T05:00:00Z"), end: at("2026-10-07T07:00:00Z") }
    expect(affectedPeriods(null, nap, VANCOUVER)).toEqual([
      ["day", "2026-10-06"],
      ["week", "2026-W41"],
      ["month", "2026-10"],
    ])
  })

  it("decides the day in the household's time zone", () => {
    const bottle = pointAt("2026-10-07T03:00:00Z")
    expect(affectedPeriods(null, bottle, VANCOUVER)[0]).toEqual(["day", "2026-10-06"])
    expect(affectedPeriods(null, bottle, LONDON)[0]).toEqual(["day", "2026-10-07"])
  })

  it("is empty when there is no interval", () => {
    expect(affectedPeriods(null, null, VANCOUVER)).toEqual([])
  })

  it("covers exactly the local days an interval touches", () => {
    fc.assert(
      fc.property(zonedInstants, fc.integer({ min: 1, max: 3 * 24 * 60 }), ([start, zone], minutes) => {
        const interval = { start, end: start + minutes * 60_000 }
        const days = affectedPeriods(null, interval, zone).filter(([kind]) => kind === "day")
        expect(days).toEqual(splitByDays(interval, zone).map((piece) => ["day", piece.date]))
      }),
    )
  })
})
