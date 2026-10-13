import { describe, expect, it } from "vitest"
import {
  dateInSearch,
  dayOfMonth,
  dayTitle,
  editsDateText,
  pickedDate,
  viewInSearch,
  weekdayOf,
  weekTitle,
} from "../src/features/history/history-date.ts"
import { periodOf } from "../src/features/history/history-period.ts"
import { backLabel, currentLabel, periodTitle } from "../src/features/history/history-titles.ts"
import { LOCALE } from "./history-fixtures.ts"

describe("History's address", () => {
  it("reads a real date, and nothing else", () => {
    expect(dateInSearch("2026-10-09")).toBe("2026-10-09")
    expect(dateInSearch("2026-02-30")).toBeUndefined()
    expect(dateInSearch("yesterday")).toBeUndefined()
    expect(dateInSearch(20261009)).toBeUndefined()
    expect(dateInSearch(undefined)).toBeUndefined()
  })

  it("reads the Week and List views, and leaves anything else to the Day view", () => {
    expect(viewInSearch("week")).toBe("week")
    expect(viewInSearch("list")).toBe("list")
    expect(viewInSearch("day")).toBeUndefined()
    expect(viewInSearch("month")).toBeUndefined()
    expect(viewInSearch(undefined)).toBeUndefined()
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

  it("names the list's day, its today and the way back to it as the Day view does", () => {
    expect(periodTitle(periodOf("list", "2026-10-09"), LOCALE)).toBe(periodTitle(periodOf("day", "2026-10-09"), LOCALE))
    expect([currentLabel("list"), backLabel("list")]).toEqual([currentLabel("day"), backLabel("day")])
    expect([currentLabel("day"), backLabel("day")]).toEqual(["Today", "Back to today"])
  })
})

describe("Go to", () => {
  it("takes a date from her birth date through today, and nothing else", () => {
    expect(pickedDate("2026-09-15", "2026-09-01", "2026-10-09")).toBe("2026-09-15")
    expect(pickedDate("2026-09-01", "2026-09-01", "2026-10-09")).toBe("2026-09-01")
    expect(pickedDate("2026-10-09", "2026-09-01", "2026-10-09")).toBe("2026-10-09")
    expect(pickedDate("2026-08-31", "2026-09-01", "2026-10-09")).toBeUndefined()
    expect(pickedDate("2026-10-10", "2026-09-01", "2026-10-09")).toBeUndefined()
    expect(pickedDate("", "2026-09-01", "2026-10-09")).toBeUndefined()
    expect(pickedDate("0002-09-15", "2026-09-01", "2026-10-09")).toBeUndefined()
  })

  it("waits for Enter or leaving the field after a typed digit or an arrow", () => {
    expect(["1", "9", "ArrowUp", "ArrowDown", "Backspace", "Delete"].map(editsDateText)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ])
    expect(["Enter", "Tab", "Escape", "a", "F5", "ArrowLeft", "ArrowRight"].map(editsDateText)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ])
  })
})
