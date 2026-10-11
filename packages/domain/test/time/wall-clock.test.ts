import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  addDaysToDate,
  type Instant,
  localDateTimeOf,
  type LocalResolution,
  resolveLocal,
  startOfDate,
} from "../../src/index.ts"
import { intlDate, intlWallClock, LONDON, VANCOUVER, zonedInstants } from "../fixtures/zones.ts"

const at = (iso: string) => Date.parse(iso)

const instantsOf = (resolution: LocalResolution): Instant[] => {
  if (resolution.kind === "ok") return [resolution.instant]
  if (resolution.kind === "ambiguous") return [resolution.earlier, resolution.later]
  return []
}

describe("resolveLocal (D11)", () => {
  it("resolves an ordinary local time to its one instant", () => {
    expect(resolveLocal("2026-10-06T23:30", VANCOUVER)).toEqual({ kind: "ok", instant: at("2026-10-07T06:30:00Z") })
  })

  it.each([
    [VANCOUVER, "2025-11-02T01:30", "2025-11-02T08:30:00Z", "2025-11-02T09:30:00Z"],
    [VANCOUVER, "2025-11-02T01:00", "2025-11-02T08:00:00Z", "2025-11-02T09:00:00Z"],
    [LONDON, "2026-10-25T01:30", "2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z"],
    ["Australia/Lord_Howe", "2026-04-05T01:45", "2026-04-04T14:45:00Z", "2026-04-04T15:15:00Z"],
  ])("%s %s happens twice when clocks go back, so it offers both", (zone, local, earlier, later) => {
    expect(resolveLocal(local, zone)).toEqual({ kind: "ambiguous", earlier: at(earlier), later: at(later) })
  })

  it.each([
    [VANCOUVER, "2026-03-08T02:00"],
    [VANCOUVER, "2026-03-08T02:30"],
    [VANCOUVER, "2026-03-08T02:59"],
    [LONDON, "2026-03-29T01:30"],
  ])("%s %s never happens because clocks go forward", (zone, local) => {
    expect(resolveLocal(local, zone)).toEqual({ kind: "nonexistent" })
  })

  it.each([
    [VANCOUVER, "2026-03-08T01:59", "2026-03-08T09:59:00Z"],
    [VANCOUVER, "2026-03-08T03:00", "2026-03-08T10:00:00Z"],
    [VANCOUVER, "2025-11-02T00:59", "2025-11-02T07:59:00Z"],
    [VANCOUVER, "2025-11-02T02:00", "2025-11-02T10:00:00Z"],
  ])("%s %s, just outside a change, is ordinary", (zone, local, instant) => {
    expect(resolveLocal(local, zone)).toEqual({ kind: "ok", instant: at(instant) })
  })

  it.each(["2026-11-01 01:30", "2026-11-01T1:30", "2026-02-30T10:00", "2026-11-01T24:00", ""])(
    "throws on %j, which is not a real local date-time",
    (local) => {
      expect(() => resolveLocal(local, VANCOUVER)).toThrow(RangeError)
    },
  )

  it("finds the instant behind every wall-clock time a zone showed, including around DST changes", () => {
    fc.assert(
      fc.property(zonedInstants, ([instant, zone]) => {
        const minute = instant - (instant % 60_000)
        expect(instantsOf(resolveLocal(intlWallClock(minute, zone), zone))).toContain(minute)
      }),
    )
  })
})

describe("localDateTimeOf", () => {
  it("reads the household's wall clock at an instant, to the minute", () => {
    expect(localDateTimeOf(at("2026-10-07T06:30:59Z"), VANCOUVER)).toBe("2026-10-06T23:30")
  })

  it("reads 1:30 twice on the night clocks go back", () => {
    expect(localDateTimeOf(at("2025-11-02T08:30:00Z"), VANCOUVER)).toBe("2025-11-02T01:30")
    expect(localDateTimeOf(at("2025-11-02T09:30:00Z"), VANCOUVER)).toBe("2025-11-02T01:30")
  })

  it("matches what Intl shows, and resolves back to the same minute, in every zone", () => {
    fc.assert(
      fc.property(zonedInstants, ([instant, zone]) => {
        const minute = instant - (instant % 60_000)
        const local = localDateTimeOf(instant, zone)
        expect(local).toBe(intlWallClock(instant, zone))
        expect(instantsOf(resolveLocal(local, zone))).toContain(minute)
      }),
    )
  })
})

describe("startOfDate", () => {
  it("is local midnight on an ordinary day", () => {
    expect(startOfDate("2026-10-06", VANCOUVER)).toBe(at("2026-10-06T07:00:00Z"))
  })

  it("is the first of two midnights when clocks go back at 01:00 (Havana)", () => {
    expect(startOfDate("2026-11-01", "America/Havana")).toBe(at("2026-11-01T04:00:00Z"))
  })

  it("is 01:00 when clocks skip midnight (Santiago)", () => {
    expect(startOfDate("2026-09-06", "America/Santiago")).toBe(at("2026-09-06T04:00:00Z"))
  })

  it.each(["2026-02-30", "2026-10-6", ""])("throws on %j, which is not a date", (date) => {
    expect(() => startOfDate(date, VANCOUVER)).toThrow(RangeError)
  })

  it("is the first instant with that local date, in every zone, including on DST days", () => {
    fc.assert(
      fc.property(zonedInstants, ([instant, zone]) => {
        const date = intlDate(instant, zone)
        const start = startOfDate(date, zone)
        expect(intlDate(start, zone)).toBe(date)
        expect(intlDate(start - 1, zone)).toBe(addDaysToDate(date, -1))
      }),
    )
  })
})
