import { flOzFromMl, zonedDayBounds } from "@bt/domain"
import { describe, expect, it } from "vitest"
import { barRows, tallestDay } from "../src/features/trends/bar-rows.ts"
import { dayTicks, hourLabel } from "../src/features/trends/day-ticks.ts"
import { TRENDS_METRICS } from "../src/features/trends/metrics.ts"
import { tableRows, valueParts } from "../src/features/trends/table-rows.ts"
import { trendDays } from "../src/features/trends/trends-numbers.ts"
import { usualDay, usualWeeks } from "../src/features/trends/usual-day.ts"
import { ZONE } from "./today-fixtures.ts"
import { BIRTH, dated, LOCALE, MONDAY, TODAY, TUESDAY, WEEK } from "./trends-fixtures.ts"

const [FEEDS, NURSING, BOTTLES] = TRENDS_METRICS
const DAYS = trendDays(WEEK, TODAY, BIRTH)

describe("barRows", () => {
  it("draws finished days and today, and nothing for days still to come, logged or not", () => {
    const days = trendDays([...WEEK.slice(0, 3), dated("2026-10-15", MONDAY), dated("2026-10-16")], TODAY, BIRTH)
    expect(barRows(FEEDS, days, "ml", null).map(({ date, value }) => [date, value])).toEqual([
      ["2026-10-12", 8],
      ["2026-10-13", 7],
      [TODAY, 2],
    ])
  })

  it("stacks a day's parts in order, in the chart's units, and leaves out a part with nothing in it", () => {
    expect(barRows(NURSING, DAYS, "ml", null).map(({ key, value }) => [key, value])).toEqual([
      ["2026-10-12:left", 52],
      ["2026-10-12:right", 48],
      ["2026-10-13:left", 40],
      ["2026-10-13:right", 40],
      [`${TODAY}:left`, 15],
    ])
    expect(barRows(BOTTLES, DAYS, "fl_oz", null).map(({ key, value }) => [key, value])).toEqual([
      ["2026-10-12:breast-milk", flOzFromMl(400)],
      ["2026-10-12:formula", flOzFromMl(210)],
      ["2026-10-13:breast-milk", flOzFromMl(520)],
    ])
  })

  it("paints the first part in the accent, the second lighter, and today lighter still", () => {
    const fills = barRows(NURSING, DAYS, "ml", null).map(({ fill }) => fill)
    expect(fills).toEqual([
      "var(--primary)",
      "color-mix(in oklab, var(--primary) 45%, var(--background))",
      "var(--primary)",
      "color-mix(in oklab, var(--primary) 45%, var(--background))",
      "color-mix(in oklab, var(--primary) 55%, var(--background))",
    ])
  })

  it("fades every day but the one picked", () => {
    const fills = barRows(FEEDS, DAYS, "ml", "2026-10-13").map(({ date, fill }) => [date, fill])
    expect(fills).toEqual([
      ["2026-10-12", "color-mix(in oklab, var(--primary) 30%, var(--background))"],
      ["2026-10-13", "var(--primary)"],
      [TODAY, "color-mix(in oklab, var(--primary) 30%, var(--background))"],
    ])
  })

  it("finds the tallest day's stack", () => {
    expect(tallestDay(barRows(NURSING, DAYS, "ml", null))).toBe(100)
    expect(tallestDay([])).toBe(0)
  })
})

describe("tableRows", () => {
  it("lists each day from the first to today, worded as the numbers are, and leaves out what's to come", () => {
    const rows = tableRows(trendDays([dated("2026-10-11"), ...WEEK], TODAY, BIRTH), "ml", LOCALE)
    expect(rows).toEqual([
      { date: "2026-10-11", name: "Sun, Oct 11", cells: ["No entries"] },
      { date: "2026-10-12", name: "Mon, Oct 12", cells: ["8", "1 h 40 min", "610 mL", "8", "0 min"] },
      { date: "2026-10-13", name: "Tue, Oct 13", cells: ["7", "1 h 20 min", "520 mL", "7", "0 min"] },
      { date: TODAY, name: "Wed, Oct 14, so far", cells: ["2", "15 min", "0 mL", "1", "0 min"] },
    ])
  })

  it("leaves out the days before her birth date", () => {
    expect(tableRows(trendDays([dated("2026-08-31"), dated(BIRTH, MONDAY)], TODAY, BIRTH), "ml", LOCALE)).toEqual([
      { date: BIRTH, name: "Tue, Sep 1", cells: ["8", "1 h 40 min", "610 mL", "8", "0 min"] },
    ])
  })
})

describe("a table cell's parts", () => {
  it("breaks a length after its hours, where a unit's last letter meets the next number", () => {
    expect(valueParts("12 h 50 min")).toEqual(["12 h", "50 min"])
    expect(valueParts("1 h 25 min")).toEqual(["1 h", "25 min"])
  })

  it("never breaks inside an amount, a count or a length of one unit", () => {
    const whole = ["610 mL", "20.5 fl oz", "8.3", "13 h", "45 min", "<1 min", "No entries"]
    expect(whole.map(valueParts)).toEqual(whole.map((value) => [value]))
  })
})

describe("usualDay", () => {
  it("reads the seven days before from the two weeks that hold them", () => {
    expect(usualWeeks(TODAY)).toEqual(["2026-W41", "2026-W42"])
    expect(usualWeeks("2026-10-12")).toEqual(["2026-W41", "2026-W41"])
  })

  it("is undefined until both weeks have loaded", () => {
    expect(usualDay([WEEK, undefined], TODAY, TODAY, BIRTH)).toBeUndefined()
  })

  it("averages the finished days with entries among the seven before the day, each counted once", () => {
    const earlier = [dated("2026-10-06", MONDAY), dated("2026-10-07", TUESDAY), dated("2026-10-11")]
    expect(usualDay([earlier, WEEK], TODAY, TODAY, BIRTH)).toMatchObject({ days: 3 })
    expect(usualDay([WEEK, WEEK], TODAY, TODAY, BIRTH)).toMatchObject({ days: 2, totals: { feedsStarted: 7.5 } })
  })

  it("never counts the shown day in its own usual day, even with entries", () => {
    expect(usualDay([WEEK, WEEK], "2026-10-13", TODAY, BIRTH)).toMatchObject({ days: 1, totals: { feedsStarted: 8 } })
  })

  it("is null when none of the seven days before had entries", () => {
    expect(usualDay([[dated("2026-10-12")], []], "2026-10-13", TODAY, BIRTH)).toBeNull()
  })
})

describe("dayTicks", () => {
  it("marks midnight, 6 AM, noon, 6 PM and the next midnight on the household's clock", () => {
    const bounds = zonedDayBounds("2026-10-09", ZONE)
    const label = hourLabel(ZONE, LOCALE)
    expect(dayTicks("2026-10-09", bounds, ZONE).map(label)).toEqual(["12 AM", "6 AM", "12 PM", "6 PM", "12 AM"])
  })

  it("keeps each tick at its hour on the day the clocks go back", () => {
    const bounds = zonedDayBounds("2026-11-01", "America/Los_Angeles")
    const ticks = dayTicks("2026-11-01", bounds, "America/Los_Angeles")
    expect(ticks.map(hourLabel("America/Los_Angeles", LOCALE))).toEqual(["12 AM", "6 AM", "12 PM", "6 PM", "12 AM"])
    expect(ticks.at(-1)).toBe(bounds.end)
  })
})
