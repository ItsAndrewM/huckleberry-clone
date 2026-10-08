import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  addDaysToDate,
  clipTo,
  type DayPiece,
  durationMs,
  overlaps,
  splitByDays,
  zonedDayBounds,
} from "../../src/index.ts"
import { AC12_MIDNIGHT_SLEEP, AC4_MIDNIGHT_FEED } from "../fixtures/scenarios.ts"
import { LONDON, VANCOUVER, zonedInstants } from "../fixtures/zones.ts"

const at = (iso: string) => Date.parse(iso)
const MINUTE = 60_000
const minutesByDate = (pieces: ReadonlyArray<DayPiece>) =>
  pieces.map((piece) => [piece.date, durationMs(piece.interval) / MINUTE])

describe("overlaps (half-open)", () => {
  it.each([
    [{ start: 0, end: 10 }, { start: 5, end: 15 }, true],
    [{ start: 0, end: 10 }, { start: 2, end: 3 }, true],
    [{ start: 0, end: 10 }, { start: 10, end: 20 }, false],
    [{ start: 10, end: 20 }, { start: 0, end: 10 }, false],
    [{ start: 5, end: 5 }, { start: 0, end: 10 }, false],
  ])("%o and %o overlap: %s", (a, b, expected) => {
    expect(overlaps(a, b)).toBe(expected)
  })
})

describe("clipTo", () => {
  const period = { start: 100, end: 200 }

  it("keeps the part inside the period", () => {
    expect(clipTo({ start: 50, end: 150 }, period)).toEqual({ start: 100, end: 150 })
    expect(clipTo({ start: 120, end: 180 }, period)).toEqual({ start: 120, end: 180 })
  })

  it("is null when nothing is inside, including an interval that only touches the end", () => {
    expect(clipTo({ start: 0, end: 50 }, period)).toBeNull()
    expect(clipTo({ start: 200, end: 250 }, period)).toBeNull()
  })
})

describe("splitByDays", () => {
  it("splits the AC 4 feed's nursing at local midnight: 10 minutes on the 6th, 20 on the 7th", () => {
    const pieces = AC4_MIDNIGHT_FEED.segments.flatMap((segment) =>
      splitByDays({ start: segment.startedAt, end: segment.endedAt }, VANCOUVER),
    )
    expect(minutesByDate(pieces)).toEqual([
      ["2026-10-06", 10],
      ["2026-10-07", 5],
      ["2026-10-07", 15],
    ])
  })

  it("splits the AC 12 sleep, 23:30 to 01:00, into 30 and 60 minutes", () => {
    expect(minutesByDate(splitByDays(AC12_MIDNIGHT_SLEEP, VANCOUVER))).toEqual([
      ["2026-10-06", 30],
      ["2026-10-07", 60],
    ])
  })

  it.each([
    [VANCOUVER, "2026-11-01T06:30:00Z", "2026-11-01T09:30:00Z", "2026-10-31", "2026-11-01", 30, 150],
    [LONDON, "2026-03-28T23:30:00Z", "2026-03-29T02:00:00Z", "2026-03-28", "2026-03-29", 30, 120],
  ])("splits by local days on a DST day in %s", (zone, start, end, firstDate, secondDate, first, second) => {
    expect(minutesByDate(splitByDays({ start: at(start), end: at(end) }, zone))).toEqual([
      [firstDate, first],
      [secondDate, second],
    ])
  })

  it("gives one piece per local day for a long interval", () => {
    const pieces = splitByDays({ start: at("2026-10-06T19:00:00Z"), end: at("2026-10-08T21:00:00Z") }, VANCOUVER)
    expect(pieces.map((piece) => piece.date)).toEqual(["2026-10-06", "2026-10-07", "2026-10-08"])
  })

  it("adds no empty piece for an interval that ends exactly at midnight", () => {
    const pieces = splitByDays({ start: at("2026-10-07T05:00:00Z"), end: at("2026-10-07T07:00:00Z") }, VANCOUVER)
    expect(pieces.map((piece) => piece.date)).toEqual(["2026-10-06"])
  })

  it("returns nothing for an empty interval", () => {
    expect(splitByDays({ start: 1000, end: 1000 }, VANCOUVER)).toEqual([])
  })

  it("covers the interval exactly, one consecutive local day per piece", () => {
    fc.assert(
      fc.property(zonedInstants, fc.integer({ min: 1, max: 4 * 24 * 60 }), ([start, zone], minutes) => {
        const interval = { start, end: start + minutes * MINUTE }
        const pieces = splitByDays(interval, zone)
        expect(pieces[0]?.interval.start).toBe(interval.start)
        expect(pieces.at(-1)?.interval.end).toBe(interval.end)
        pieces.forEach((piece, i) => {
          expect(clipTo(piece.interval, zonedDayBounds(piece.date, zone))).toEqual(piece.interval)
          const next = pieces[i + 1]
          if (next === undefined) return
          expect(next.interval.start).toBe(piece.interval.end)
          expect(next.date).toBe(addDaysToDate(piece.date, 1))
        })
      }),
    )
  })
})
