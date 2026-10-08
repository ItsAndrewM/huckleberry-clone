import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { type Interval, isoWeekBounds, localDateOf, monthBounds, zonedDayBounds } from "../../src/index.ts"
import { AC23_DAY_LENGTHS } from "../fixtures/scenarios.ts"
import { intlDate, LONDON, VANCOUVER, zonedInstants } from "../fixtures/zones.ts"

const at = (iso: string) => Date.parse(iso)
const HOUR = 3_600_000
const hoursIn = (interval: Interval) => (interval.end - interval.start) / HOUR

describe("localDateOf", () => {
  it("is the household's calendar date, not UTC's", () => {
    expect(localDateOf(at("2026-10-07T06:59:59.999Z"), VANCOUVER)).toBe("2026-10-06")
    expect(localDateOf(at("2026-10-07T07:00:00Z"), VANCOUVER)).toBe("2026-10-07")
    expect(localDateOf(at("2026-10-07T06:59:59.999Z"), LONDON)).toBe("2026-10-07")
  })

  it("agrees with Intl in every zone, including around DST changes", () => {
    fc.assert(
      fc.property(zonedInstants, ([instant, zone]) => {
        expect(localDateOf(instant, zone)).toBe(intlDate(instant, zone))
      }),
    )
  })
})

describe("zonedDayBounds", () => {
  it("runs from local midnight to the next local midnight", () => {
    expect(zonedDayBounds("2026-10-06", VANCOUVER)).toEqual({
      start: at("2026-10-06T07:00:00Z"),
      end: at("2026-10-07T07:00:00Z"),
    })
  })

  it.each(AC23_DAY_LENGTHS)("$zone $date lasts $hours hours (AC 23)", ({ zone, date, hours }) => {
    expect(hoursIn(zonedDayBounds(date, zone))).toBe(hours)
  })

  it("contains every instant whose local date it is", () => {
    fc.assert(
      fc.property(zonedInstants, ([instant, zone]) => {
        const day = zonedDayBounds(localDateOf(instant, zone), zone)
        expect(day.start).toBeLessThanOrEqual(instant)
        expect(instant).toBeLessThan(day.end)
      }),
    )
  })
})

describe("isoWeekBounds", () => {
  it("runs from Monday midnight to the next Monday midnight", () => {
    expect(isoWeekBounds("2026-W41", VANCOUVER)).toEqual({
      start: at("2026-10-05T07:00:00Z"),
      end: at("2026-10-12T07:00:00Z"),
    })
  })

  it("is an hour longer in the week clocks go back", () => {
    expect(hoursIn(isoWeekBounds("2025-W44", VANCOUVER))).toBe(7 * 24 + 1)
  })
})

describe("monthBounds", () => {
  it("runs from the 1st at midnight to the next 1st at midnight", () => {
    expect(monthBounds("2025-11", VANCOUVER)).toEqual({
      start: at("2025-11-01T07:00:00Z"),
      end: at("2025-12-01T08:00:00Z"),
    })
  })

  it("crosses into the next year", () => {
    expect(monthBounds("2026-12", LONDON)).toEqual({
      start: at("2026-12-01T00:00:00Z"),
      end: at("2027-01-01T00:00:00Z"),
    })
  })

  it("is an hour shorter in the month clocks go forward", () => {
    expect(hoursIn(monthBounds("2026-03", LONDON))).toBe(31 * 24 - 1)
  })
})
