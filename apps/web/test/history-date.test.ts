import { describe, expect, it } from "vitest"
import {
  dateInSearch,
  dayOfMonth,
  dayTitle,
  navigationOf,
  shownDate,
  viewInSearch,
  weekdayOf,
  weekTitle,
} from "../src/features/history/history-date.ts"
import { LOCALE } from "./history-fixtures.ts"

const TODAY = "2026-10-11"
const BIRTH = "2026-09-01"

describe("the date in History's address", () => {
  it("reads a real date, and nothing else", () => {
    expect(dateInSearch("2026-10-09")).toBe("2026-10-09")
    expect(dateInSearch("2026-02-30")).toBeUndefined()
    expect(dateInSearch("yesterday")).toBeUndefined()
    expect(dateInSearch(20261009)).toBeUndefined()
    expect(dateInSearch(undefined)).toBeUndefined()
  })

  it("reads the Week view, and leaves anything else to the Day view", () => {
    expect(viewInSearch("week")).toBe("week")
    expect(viewInSearch("day")).toBeUndefined()
    expect(viewInSearch("month")).toBeUndefined()
    expect(viewInSearch(undefined)).toBeUndefined()
  })
})

describe("shownDate", () => {
  it("shows the household's today when the address names no day, or one after today", () => {
    expect(shownDate(undefined, TODAY)).toBe(TODAY)
    expect(shownDate("2026-10-12", TODAY)).toBe(TODAY)
  })

  it("shows an earlier day the address names", () => {
    expect(shownDate("2026-10-09", TODAY)).toBe("2026-10-09")
  })
})

describe("navigationOf", () => {
  it("steps back a day from today, and not forward", () => {
    expect(navigationOf(TODAY, TODAY, BIRTH)).toEqual({
      date: TODAY,
      isToday: true,
      previous: { date: "2026-10-10" },
      next: null,
    })
  })

  it("steps forward from yesterday to today's own address, which follows the household's midnight", () => {
    expect(navigationOf("2026-10-10", TODAY, BIRTH).next).toEqual({})
  })

  it("stops at the birth date", () => {
    expect(navigationOf(BIRTH, TODAY, BIRTH)).toMatchObject({
      isToday: false,
      previous: null,
      next: { date: "2026-09-02" },
    })
  })
})

describe("History's titles", () => {
  it("names the day as the household would, whatever the phone's zone", () => {
    expect(dayTitle("2026-10-09", LOCALE)).toBe("Fri, Oct 9")
  })

  it("names a week by its Monday and Sunday, across a month or a year", () => {
    expect(weekTitle("2026-10-05", "2026-10-11", LOCALE)).toMatch(/^Oct 5\s–\s11$/u)
    expect(weekTitle("2026-09-28", "2026-10-04", LOCALE)).toMatch(/^Sep 28\s–\sOct 4$/u)
    expect(weekTitle("2026-12-28", "2027-01-03", LOCALE)).toMatch(/^Dec 28, 2026\s–\sJan 3, 2027$/u)
  })

  it("heads a week's column with its weekday and the day of the month", () => {
    expect(weekdayOf("2026-10-05", LOCALE)).toBe("Mon")
    expect(dayOfMonth("2026-10-05")).toBe(5)
  })
})
