import { averageDay } from "@bt/domain"
import { describe, expect, it } from "vitest"
import { TRENDS_METRICS } from "../src/features/trends/metrics.ts"
import { averageNumbers, dayNumbers, trendDays } from "../src/features/trends/trends-numbers.ts"
import { NO_TOTALS } from "./today-fixtures.ts"
import { BIRTH, dated, MONDAY, SO_FAR, TODAY, TUESDAY, WEEK } from "./trends-fixtures.ts"

const [FEEDS, NURSING, BOTTLES, DIAPERS] = TRENDS_METRICS
const AVERAGE = averageDay(WEEK, TODAY, BIRTH)

describe("trendDays", () => {
  it("says which days count, which is today and which are still to come", () => {
    expect(trendDays(WEEK, TODAY, BIRTH).map(({ status }) => status)).toEqual([
      "counted",
      "counted",
      "today",
      "after-today",
      "after-today",
      "after-today",
      "after-today",
    ])
  })
})

describe("averageNumbers", () => {
  it.each([
    ["Feeds started", FEEDS, "7.5 a day, over 2 days", []],
    ["Nursing", NURSING, "1 h 30 min a day, over 2 days", ["Left 46 min", "Right 44 min"]],
    ["Bottles", BOTTLES, "565 mL a day, over 2 days", ["Breast milk 460 mL", "Formula 105 mL"]],
    ["Diapers", DIAPERS, "7.5 a day, over 2 days", ["5.5 pee", "2.5 poo"]],
  ])("gives %s's average day and how many days it covers", (_title, metric, value, detail) => {
    expect(averageNumbers(metric, AVERAGE, "ml", true)).toEqual({ value, detail })
  })

  it("says one day in the singular", () => {
    const one = averageDay([dated("2026-10-12", MONDAY)], TODAY, BIRTH)
    expect(averageNumbers(BOTTLES, one, "ml", false).value).toBe("610 mL a day, over 1 day")
  })

  it("gives bottles in fluid ounces when the household measures them so", () => {
    expect(averageNumbers(BOTTLES, AVERAGE, "fl_oz", true)).toEqual({
      value: "19.1 fl oz a day, over 2 days",
      detail: ["Breast milk 15.6 fl oz", "Formula 3.6 fl oz"],
    })
  })

  it("says no full day is logged yet in the period holding today, and no entries in an earlier one", () => {
    expect(averageNumbers(FEEDS, null, "ml", true)).toEqual({ value: "No full day logged yet", detail: [] })
    expect(averageNumbers(FEEDS, null, "ml", false)).toEqual({ value: "No entries", detail: [] })
  })
})

describe("dayNumbers", () => {
  const [monday, tuesday, today] = trendDays(
    [dated("2026-10-12", MONDAY), dated("2026-10-13", TUESDAY), dated(TODAY, SO_FAR)],
    TODAY,
    BIRTH,
  )

  it("gives a finished day's numbers as Today's card words them", () => {
    expect(monday === undefined ? null : dayNumbers(NURSING, monday, "ml")).toEqual({
      value: "1 h 40 min",
      detail: ["Left 52 min", "Right 48 min"],
    })
  })

  it("leaves out a kind the day had none of, and says a real zero", () => {
    expect(tuesday === undefined ? null : dayNumbers(BOTTLES, tuesday, "ml")).toEqual({
      value: "520 mL",
      detail: ["Breast milk 520 mL"],
    })
    expect(today === undefined ? null : dayNumbers(BOTTLES, today, "ml")).toEqual({ value: "0 mL so far", detail: [] })
  })

  it("says today's numbers are so far", () => {
    expect(today === undefined ? null : dayNumbers(DIAPERS, today, "ml")).toEqual({
      value: "1 so far",
      detail: ["1 pee"],
    })
  })

  it("says No entries for a finished day with nothing logged", () => {
    const [empty] = trendDays([dated("2026-10-11", NO_TOTALS)], TODAY, BIRTH)
    expect(empty === undefined ? null : dayNumbers(FEEDS, empty, "ml")).toEqual({ value: "No entries", detail: [] })
  })
})
