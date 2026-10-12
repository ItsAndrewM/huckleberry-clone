import { tz } from "@date-fns/tz"
import { getISOWeek, getISOWeekYear } from "date-fns"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  addDaysToDate,
  datesBetween,
  isIsoWeek,
  isLocalDate,
  isoWeekMonday,
  isoWeekOfDate,
  isYearMonth,
  monthOfDate,
  nextMonth,
} from "../../src/index.ts"

const dates = fc
  .integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2035, 0, 1) })
  .map((ms) => new Date(ms).toISOString().slice(0, 10))

describe("addDaysToDate", () => {
  it.each([
    ["2026-10-06", 1, "2026-10-07"],
    ["2026-10-31", 1, "2026-11-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2026-11-01", 0, "2026-11-01"],
  ])("%s + %i days is %s", (date, days, expected) => {
    expect(addDaysToDate(date, days)).toBe(expected)
  })

  it.each(["2026-02-30", "2026-13-01", "2026-10-6", "", "+010000-01", "-000001-01"])(
    "throws on %j instead of guessing a date",
    (date) => {
      expect(() => addDaysToDate(date, 1)).toThrow(RangeError)
      expect(() => monthOfDate(date)).toThrow(RangeError)
      expect(() => isoWeekOfDate(date)).toThrow(RangeError)
    },
  )
})

describe("datesBetween", () => {
  it("lists every date from first to last, inclusive", () => {
    expect(datesBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"])
  })

  it("returns one date when first and last are the same", () => {
    expect(datesBetween("2026-10-06", "2026-10-06")).toEqual(["2026-10-06"])
  })

  it("returns nothing when last is before first", () => {
    expect(datesBetween("2026-10-07", "2026-10-06")).toEqual([])
  })

  it.each([
    ["garbage", "2026-10-06"],
    ["2026-10-06", "zzz"],
    ["2026-02-30", "2026-03-02"],
    ["2026-10-06", "2026-10-06x"],
    ["2026-02-30", "2026-02-01"],
    ["2026-02-01", "2026-02-30"],
    ["2026-10-06", "+010000-01"],
  ])("throws on %j to %j, because one end is not a real date", (first, last) => {
    expect(() => datesBetween(first, last)).toThrow(RangeError)
  })
})

describe("months", () => {
  it("monthOfDate is the date's year and month", () => {
    expect(monthOfDate("2026-10-06")).toBe("2026-10")
  })

  it.each([
    ["2026-10", "2026-11"],
    ["2026-12", "2027-01"],
  ])("the month after %s is %s", (month, expected) => {
    expect(nextMonth(month)).toBe(expected)
  })

  it.each(["2026-13", "2026-1"])("throws on the month %j", (month) => {
    expect(() => nextMonth(month)).toThrow(RangeError)
  })
})

describe("ISO weeks", () => {
  it.each([
    ["2026-10-07", "2026-W41"],
    ["2026-01-01", "2026-W01"],
    ["2027-01-01", "2026-W53"],
    ["2024-12-30", "2025-W01"],
    ["2026-11-01", "2026-W44"],
  ])("%s is in %s", (date, week) => {
    expect(isoWeekOfDate(date)).toBe(week)
  })

  it.each([
    ["2026-W41", "2026-10-05"],
    ["2026-W53", "2026-12-28"],
    ["2025-W01", "2024-12-30"],
  ])("%s starts on Monday %s", (week, monday) => {
    expect(isoWeekMonday(week)).toBe(monday)
  })

  it.each(["2026-W54", "2025-W53", "2026-W5", "2026-41"])("throws on the week %j, which does not exist", (week) => {
    expect(() => isoWeekMonday(week)).toThrow(RangeError)
  })

  it("numbers every week as date-fns does in UTC, from 1999 to 2100, without reading the device's zone", () => {
    const utc = tz("UTC")
    const centuryDates = fc
      .integer({ min: Date.UTC(1999, 0, 1), max: Date.UTC(2100, 11, 31) })
      .map((ms) => new Date(ms).toISOString().slice(0, 10))
    fc.assert(
      fc.property(centuryDates, (date) => {
        const day = utc(Date.parse(`${date}T00:00:00Z`))
        const week = `${getISOWeekYear(day)}-W${String(getISOWeek(day)).padStart(2, "0")}`
        expect([isoWeekOfDate(date), isIsoWeek(week), isoWeekMonday(week) <= date]).toEqual([week, true, true])
      }),
    )
  })

  it("puts every date in the week that starts on the Monday up to six days before it", () => {
    fc.assert(
      fc.property(dates, (date) => {
        const monday = isoWeekMonday(isoWeekOfDate(date))
        expect(new Date(`${monday}T00:00:00Z`).getUTCDay()).toBe(1)
        expect(datesBetween(monday, date).length).toBeGreaterThanOrEqual(1)
        expect(datesBetween(monday, date).length).toBeLessThanOrEqual(7)
      }),
    )
  })
})

const digits = (max: number, width: number) => fc.integer({ min: 0, max }).map((n) => String(n).padStart(width, "0"))

const wellFormed = fc.oneof(
  fc.tuple(digits(9999, 4), digits(99, 2), digits(99, 2)).map(([year, month, day]) => `${year}-${month}-${day}`),
  fc.tuple(digits(9999, 4), digits(99, 2)).map(([year, week]) => `${year}-W${week}`),
  fc.tuple(digits(9999, 4), digits(99, 2)).map(([year, month]) => `${year}-${month}`),
)

describe("isLocalDate, isIsoWeek and isYearMonth", () => {
  it.each(["2026-10-06", "2028-02-29", "0001-01-01", "9999-12-31"])("%j is a date", (value) => {
    expect(isLocalDate(value)).toBe(true)
  })

  it.each(["2026-02-30", "2026-13-01", "2026-10-6", "", "+010000-01", "-000001-01", "2026-10-06x", "2026-10-06T00:00"])(
    "%j is not a date",
    (value) => {
      expect(isLocalDate(value)).toBe(false)
    },
  )

  it.each(["2026-W41", "2026-W53", "2025-W01"])("%j is an ISO week", (value) => {
    expect(isIsoWeek(value)).toBe(true)
  })

  it.each(["2026-W54", "2025-W53", "2026-W00", "2026-W5", "2026-41", "9999-W60", " 2026-W41"])(
    "%j is not an ISO week",
    (value) => {
      expect(isIsoWeek(value)).toBe(false)
    },
  )

  it.each(["2026-10", "2026-01", "0001-12"])("%j is a month", (value) => {
    expect(isYearMonth(value)).toBe(true)
  })

  it.each(["2026-13", "2026-00", "2026-1", "2026-10-06", ""])("%j is not a month", (value) => {
    expect(isYearMonth(value)).toBe(false)
  })

  it("never throws, whatever the string", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), wellFormed), (value) => {
        expect(() => [isLocalDate(value), isIsoWeek(value), isYearMonth(value)]).not.toThrow()
      }),
    )
  })
})
