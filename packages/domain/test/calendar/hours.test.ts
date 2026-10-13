import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { layoutDay, localDateOf, localDateTimeOf, zonedDayBounds } from "../../src/index.ts"
import { AC23_DAY_LENGTHS } from "../fixtures/scenarios.ts"
import { VANCOUVER, zonedInstants } from "../fixtures/zones.ts"
import { BOUNDS, MINUTE, SCALE, dayOf } from "./fixtures.ts"

const TROLL = "Antarctica/Troll"

const hoursOf = (date: string, zone: string) => {
  const bounds = zonedDayBounds(date, zone)
  return layoutDay({ date, zone, bounds, now: bounds.start, blocks: [], points: [] }, SCALE)
}

const localTimes = (date: string, zone: string) =>
  hoursOf(date, zone).hours.map(({ start }) => localDateTimeOf(start, zone).slice(11))

const tiles = ({ steps, hours }: ReturnType<typeof hoursOf>) =>
  hours.every((row, index) => row.top === (hours[index - 1]?.top ?? 0) + (hours[index - 1]?.height ?? 0)) &&
  hours.at(-1)?.top === steps - (hours.at(-1)?.height ?? 0)

describe("layoutDay's hour rows", () => {
  it("draws 24 rows of 12 five-minute steps on an ordinary day, from the household's midnight", () => {
    const grid = layoutDay(dayOf([]), SCALE)
    expect(grid.steps).toBe(288)
    expect(grid.hours).toHaveLength(24)
    expect(grid.hours[0]).toEqual({
      start: BOUNDS.start,
      end: BOUNDS.start + 60 * MINUTE,
      top: 0,
      height: 12,
      repeated: false,
    })
    expect(grid.hours.map(({ top }) => top)).toEqual(Array.from({ length: 24 }, (_, hour) => hour * 12))
    expect(grid.hours.at(-1)?.end).toBe(BOUNDS.end)
  })

  it.each(AC23_DAY_LENGTHS)("gives $zone's $date $hours rows, one per real hour (AC 23)", ({ zone, date, hours }) => {
    const grid = hoursOf(date, zone)
    expect(grid.hours).toHaveLength(hours)
    expect(grid.steps).toBe(hours * 12)
    expect(tiles(grid)).toBe(true)
  })

  it("draws the hour the clocks went back over twice, and marks the second", () => {
    const grid = hoursOf("2025-11-02", VANCOUVER)
    expect(localTimes("2025-11-02", VANCOUVER).slice(0, 4)).toEqual(["00:00", "01:00", "01:00", "02:00"])
    expect(grid.hours.map(({ repeated }) => repeated).slice(0, 4)).toEqual([false, false, true, false])
  })

  it("marks both second-pass hours on a day the clocks go back two hours", () => {
    const grid = hoursOf("2026-10-25", TROLL)
    expect(localTimes("2026-10-25", TROLL).slice(0, 6)).toEqual(["00:00", "01:00", "02:00", "01:00", "02:00", "03:00"])
    expect(grid.hours.map(({ repeated }) => repeated).slice(0, 6)).toEqual([false, false, false, true, true, false])
    expect(grid.hours.filter(({ repeated }) => repeated)).toHaveLength(2)
  })

  it("skips the hour the clocks went forward over", () => {
    expect(localTimes("2026-03-08", VANCOUVER).slice(0, 3)).toEqual(["00:00", "01:00", "03:00"])
  })

  it("starts a day whose midnight never happened at its first moment", () => {
    expect(localTimes("2026-09-06", "America/Santiago")[0]).toBe("01:00")
  })

  it("tiles every day in every zone from the first step to the last, with 23 to 25 rows, clock changes included", () => {
    fc.assert(
      fc.property(zonedInstants, ([instant, zone]) => {
        const date = localDateOf(instant, zone)
        const grid = hoursOf(date, zone)
        expect(tiles(grid)).toBe(true)
        expect(grid.hours[0]?.start).toBe(zonedDayBounds(date, zone).start)
        expect(grid.hours.length).toBeGreaterThanOrEqual(23)
        expect(grid.hours.length).toBeLessThanOrEqual(25)
        expect(grid.hours.every(({ height }) => height > 0)).toBe(true)
      }),
    )
  })
})
