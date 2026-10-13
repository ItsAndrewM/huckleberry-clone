import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { layoutDay, localDateOf, onWallClock, zonedDayBounds } from "../../src/index.ts"
import { intlWallClock, VANCOUVER, zonedInstants } from "../fixtures/zones.ts"
import { block, dayOf, MINUTE, SCALE, side } from "./fixtures.ts"

const LOS_ANGELES = "America/Los_Angeles"
const HOUR = 60 * MINUTE

const dayIn = (date: string, zone: string) => {
  const bounds = zonedDayBounds(date, zone)
  return { date, zone, bounds, now: bounds.end, blocks: [], points: [] }
}

const wallMinutes = (at: number, zone: string) => {
  const wall = intlWallClock(at, zone)
  return Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16))
}

describe("onWallClock", () => {
  it("lays an ordinary day out exactly as layoutDay does", () => {
    const day = dayOf([block("feed", [side("left", 60, 74), side("right", 74, 83)])])
    const points = [{ id: "diaper", at: day.bounds.start + 130 * MINUTE }]
    const real = layoutDay({ ...day, points }, SCALE)
    const wall = layoutDay(onWallClock({ ...day, points }), SCALE)
    expect(wall.steps).toBe(real.steps)
    expect(wall.blocks).toEqual(real.blocks)
    expect(wall.clusters).toEqual(real.clusters)
    expect(wall.now).toBe(real.now)
    expect(wall.hours.map(({ top, height }) => [top, height])).toEqual(
      real.hours.map(({ top, height }) => [top, height]),
    )
  })

  it("draws a 25-hour day as 24 rows, both passes of the repeated hour on the same rows", () => {
    const day = dayIn("2026-11-01", LOS_ANGELES)
    const firstPass = Date.parse("2026-11-01T01:30:00-07:00")
    const secondPass = Date.parse("2026-11-01T01:30:00-08:00")
    const grid = layoutDay(
      onWallClock({
        ...day,
        points: [
          { id: "first", at: firstPass },
          { id: "second", at: secondPass },
        ],
      }),
      SCALE,
    )
    expect(day.bounds.end - day.bounds.start).toBe(25 * HOUR)
    expect(grid.hours).toHaveLength(24)
    expect(grid.steps).toBe(288)
    expect(grid.clusters).toEqual([{ top: 18, ids: ["first", "second"] }])
  })

  it("draws a 23-hour day as 24 rows, a side across the skipped hour as long as the clock says", () => {
    const day = dayIn("2026-03-08", LOS_ANGELES)
    const across = block("across", [
      {
        kind: "left",
        startedAt: Date.parse("2026-03-08T01:50:00-08:00"),
        endedAt: Date.parse("2026-03-08T03:10:00-07:00"),
      },
    ])
    const grid = layoutDay(onWallClock({ ...day, blocks: [across] }), SCALE)
    expect(grid.hours).toHaveLength(24)
    expect(grid.blocks.map(({ top, height }) => [top, height])).toEqual([[22, 16]])
  })

  it("keeps a side whose clock goes back as it ends from ending before it starts", () => {
    const day = dayIn("2026-11-01", LOS_ANGELES)
    const back = block("back", [
      {
        kind: "right",
        startedAt: Date.parse("2026-11-01T01:50:00-07:00"),
        endedAt: Date.parse("2026-11-01T01:10:00-08:00"),
      },
    ])
    const [wall] = onWallClock({ ...day, blocks: [back] }).blocks
    expect(wall?.endedAt).toBe(wall?.startedAt)
    expect(wall?.bands[0]?.endedAt).toBe(wall?.bands[0]?.startedAt)
  })

  it("stretches a feed whose second side crosses the clocks going back over both sides' clock times", () => {
    const day = dayIn("2026-11-01", LOS_ANGELES)
    const across = block("across", [
      {
        kind: "left",
        startedAt: Date.parse("2026-11-01T01:40:00-07:00"),
        endedAt: Date.parse("2026-11-01T01:55:00-07:00"),
      },
      {
        kind: "right",
        startedAt: Date.parse("2026-11-01T01:55:00-07:00"),
        endedAt: Date.parse("2026-11-01T01:20:00-08:00"),
      },
    ])
    const [placed] = layoutDay(onWallClock({ ...day, blocks: [across] }), SCALE).blocks
    expect(placed).toMatchObject({ top: 20, height: 4 })
    expect(placed?.bands.map(({ kind, top, height }) => [kind, top, height])).toEqual([["left", 0, 4]])
  })

  it("keeps a running side running, and moves now onto the clock", () => {
    const day = dayOf([block("running", [side("left", 600, null)])], dayOf([]).bounds.start + 610 * MINUTE)
    const wall = onWallClock(day)
    expect(wall.blocks[0]?.endedAt).toBeNull()
    expect(wall.blocks[0]?.bands[0]?.endedAt).toBeNull()
    expect(layoutDay(wall, SCALE).blocks[0]).toMatchObject({ top: 120, height: 4, running: true })
    expect(layoutDay(wall, SCALE).now).toBe(122)
  })

  it("puts every moment of a day at its wall-clock minute", () => {
    fc.assert(
      fc.property(zonedInstants, ([at, zone]) => {
        const date = localDateOf(at, zone)
        const wall = onWallClock({ ...dayIn(date, zone), now: at, points: [{ id: "at", at }] })
        const minute = Math.floor((wall.now - wall.bounds.start) / MINUTE)
        expect(minute).toBe(wallMinutes(at, zone))
        expect(wall.points[0]?.at).toBe(wall.now)
        expect(wall.zone).toBe("UTC")
      }),
    )
  })

  it("runs the clock's day from the date's midnight for 24 hours", () => {
    expect(onWallClock(dayIn("2026-10-09", VANCOUVER)).bounds).toEqual({
      start: Date.UTC(2026, 9, 9),
      end: Date.UTC(2026, 9, 10),
    })
  })
})
