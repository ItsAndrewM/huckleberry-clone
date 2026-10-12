import { type HourRow, layoutDay } from "@bt/domain"
import { describe, expect, it } from "vitest"
import { SCALE } from "../src/features/history/day-model.ts"
import { atStep, inLane, stepsTall } from "../src/features/history/grid-classes.ts"
import { hourLabels } from "../src/features/history/hour-labels.ts"
import { LOCALE, local } from "./history-fixtures.ts"
import { ZONE } from "./today-fixtures.ts"

const HOUR = 3_600_000
const AUTUMN_ZONE = "America/Los_Angeles"
const AUTUMN_START = Date.parse("2026-11-01T00:00:00-07:00")

const rowsOf = (date: string, zone: string, start: number, hours: number): ReadonlyArray<HourRow> =>
  layoutDay({ date, zone, bounds: { start, end: start + hours * HOUR }, now: start, blocks: [], points: [] }, SCALE)
    .hours

describe("hourLabels", () => {
  it("names each hour on the household's clock", () => {
    expect(hourLabels(rowsOf("2026-10-09", ZONE, local("00:00"), 24), ZONE, LOCALE).slice(0, 3)).toEqual([
      "12 AM",
      "1 AM",
      "2 AM",
    ])
  })

  it("names the hour the clocks go back over twice", () => {
    const rows = rowsOf("2026-11-01", AUTUMN_ZONE, AUTUMN_START, 25)
    expect(hourLabels(rows, AUTUMN_ZONE, LOCALE).slice(0, 4)).toEqual(["12 AM", "1 AM", "1 AM", "2 AM"])
  })
})

describe("atStep and stepsTall", () => {
  it("place and size a grid item in steps, as tens and ones the stylesheet adds up", () => {
    expect(atStep(287)).toBe("cal-at cal-at-tens-28 cal-at-ones-7")
    expect(stepsTall(4)).toBe("cal-tall cal-tall-tens-0 cal-tall-ones-4")
    expect(stepsTall(300)).toBe("cal-tall cal-tall-tens-30 cal-tall-ones-0")
  })
})

describe("inLane", () => {
  it("places a block in its lane, sharing the width with the rest of its group", () => {
    expect(inLane(1, 2)).toBe("cal-lanes-2 cal-lane-1")
  })

  it("keeps a seventh lane on the sixth, the most the grid draws", () => {
    expect(inLane(6, 7)).toBe("cal-lanes-6 cal-lane-5")
  })
})
