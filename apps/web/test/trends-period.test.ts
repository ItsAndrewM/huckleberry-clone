import { describe, expect, it } from "vitest"
import { periodOf } from "../src/features/trends/trends-period.ts"
import {
  dateInTrends,
  navigationOf,
  searchFor,
  shownPeriod,
  viewInTrends,
  viewSearch,
} from "../src/features/trends/trends-search.ts"
import { backLabel, currentLabel, dayName, periodTitle, weekdayOf } from "../src/features/trends/trends-titles.ts"
import { BIRTH, LOCALE, TODAY } from "./trends-fixtures.ts"

describe("Trends' address", () => {
  it("reads the Day and Month views and a real date, and nothing else", () => {
    expect([viewInTrends("day"), viewInTrends("month"), viewInTrends("week"), viewInTrends(1)]).toEqual([
      "day",
      "month",
      undefined,
      undefined,
    ])
    expect([dateInTrends("2026-10-09"), dateInTrends("2026-02-30"), dateInTrends(undefined)]).toEqual([
      "2026-10-09",
      undefined,
      undefined,
    ])
  })

  it("shows this week when the address names nothing", () => {
    expect(shownPeriod({}, TODAY, BIRTH)).toEqual({ view: "week", week: "2026-W42" })
  })

  it("shows the period holding the date the address names", () => {
    expect(shownPeriod({ view: "month", date: "2026-09-20" }, TODAY, BIRTH)).toEqual({
      view: "month",
      month: "2026-09",
    })
    expect(shownPeriod({ view: "day", date: "2026-10-10" }, TODAY, BIRTH)).toEqual({ view: "day", date: "2026-10-10" })
  })

  it("keeps a date after today or before her birth date inside her days", () => {
    expect(shownPeriod({ view: "day", date: "2026-11-02" }, TODAY, BIRTH)).toEqual({ view: "day", date: TODAY })
    expect(shownPeriod({ view: "day", date: "2026-08-02" }, TODAY, BIRTH)).toEqual({ view: "day", date: BIRTH })
  })

  it("leaves the date out for the period holding today, so it follows the household's midnight", () => {
    expect(searchFor(periodOf("week", TODAY), TODAY)).toEqual({})
    expect(searchFor(periodOf("month", TODAY), TODAY)).toEqual({ view: "month" })
    expect(searchFor(periodOf("week", "2026-10-07"), TODAY)).toEqual({ date: "2026-10-05" })
    expect(searchFor(periodOf("month", "2026-09-07"), TODAY)).toEqual({ view: "month", date: "2026-09-01" })
  })
})

describe("navigationOf", () => {
  it("steps back from this week, and not forward", () => {
    expect(navigationOf(periodOf("week", TODAY), TODAY, BIRTH)).toEqual({
      period: { view: "week", week: "2026-W42" },
      isCurrent: true,
      previous: { date: "2026-10-05" },
      next: null,
      current: {},
    })
  })

  it("steps forward from last month to this month's own address", () => {
    expect(navigationOf(periodOf("month", "2026-09-10"), TODAY, BIRTH)).toMatchObject({
      isCurrent: false,
      previous: null,
      next: { view: "month" },
      current: { view: "month" },
    })
  })

  it("stops stepping back at the period holding her birth date", () => {
    expect(navigationOf(periodOf("week", "2026-09-02"), TODAY, BIRTH).previous).toBeNull()
    expect(navigationOf(periodOf("day", BIRTH), TODAY, BIRTH).previous).toBeNull()
    expect(navigationOf(periodOf("day", "2026-09-02"), TODAY, BIRTH).previous).toEqual({
      view: "day",
      date: BIRTH,
    })
  })
})

describe("viewSearch", () => {
  it("keeps today in view when switching from a period that holds it", () => {
    expect(viewSearch("month", periodOf("week", TODAY), TODAY, null)).toEqual({ view: "month" })
    expect(viewSearch("day", periodOf("week", TODAY), TODAY, null)).toEqual({ view: "day" })
  })

  it("switches to the period holding an earlier period's first day", () => {
    expect(viewSearch("month", periodOf("week", "2026-09-30"), TODAY, null)).toEqual({
      view: "month",
      date: "2026-09-01",
    })
  })

  it("switches to the picked day's period", () => {
    expect(viewSearch("day", periodOf("week", TODAY), TODAY, "2026-10-13")).toEqual({
      view: "day",
      date: "2026-10-13",
    })
  })
})

describe("Trends' titles", () => {
  it("names a day, a week and a month, whatever the phone's zone", () => {
    expect(periodTitle(periodOf("day", "2026-10-13"), LOCALE)).toBe("Tue, Oct 13")
    expect(periodTitle(periodOf("week", TODAY), LOCALE)).toMatch(/^Oct 12\s–\s18$/u)
    expect(periodTitle(periodOf("week", "2026-10-01"), LOCALE)).toMatch(/^Sep 28\s–\sOct 4$/u)
    expect(periodTitle(periodOf("month", TODAY), LOCALE)).toBe("October 2026")
    expect(dayName("2026-10-13", LOCALE)).toBe("Tue, Oct 13")
    expect(weekdayOf("2026-10-13", LOCALE)).toBe("Tue")
  })

  it("says a period holding today is so far, and how to get back to it", () => {
    expect([currentLabel("day"), currentLabel("week"), currentLabel("month")]).toEqual([
      "Today, so far",
      "This week, so far",
      "This month, so far",
    ])
    expect([backLabel("day"), backLabel("week"), backLabel("month")]).toEqual([
      "Back to today",
      "Back to this week",
      "Back to this month",
    ])
  })
})
