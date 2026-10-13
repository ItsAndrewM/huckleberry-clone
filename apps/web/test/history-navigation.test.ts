import { describe, expect, it } from "vitest"
import { hiddenIn } from "../src/features/history/history-kinds.ts"
import {
  daySearch,
  navigationOf,
  searchFor,
  shownPeriod,
  viewSearch,
} from "../src/features/history/history-navigation.ts"
import { periodOf } from "../src/features/history/history-period.ts"

const TODAY = "2026-10-11"
const BIRTH = "2026-09-01"
const NONE = hiddenIn(undefined)
const NO_DIAPERS = hiddenIn("diapers")

describe("shownPeriod", () => {
  it("shows the household's today when the address names no day, or one after today", () => {
    expect(shownPeriod({}, TODAY)).toEqual({ view: "day", date: TODAY })
    expect(shownPeriod({ date: "2026-10-12" }, TODAY)).toEqual({ view: "day", date: TODAY })
  })

  it("shows an earlier day the address names", () => {
    expect(shownPeriod({ date: "2026-10-09" }, TODAY)).toEqual({ view: "day", date: "2026-10-09" })
  })

  it("shows the week that holds the address's date, or this week", () => {
    expect(shownPeriod({ view: "week" }, TODAY)).toEqual({ view: "week", week: "2026-W41" })
    expect(shownPeriod({ view: "week", date: "2026-09-30" }, TODAY)).toEqual({ view: "week", week: "2026-W40" })
  })
})

describe("searchFor", () => {
  it("leaves today and this week out of the address, so they follow the household's midnight", () => {
    expect(searchFor(periodOf("day", TODAY), TODAY, NONE)).toEqual({
      view: undefined,
      date: undefined,
      hide: undefined,
    })
    expect(searchFor(periodOf("week", "2026-10-06"), TODAY, NONE)).toEqual({
      view: "week",
      date: undefined,
      hide: undefined,
    })
  })

  it("names an earlier week by its Monday, and keeps what's hidden", () => {
    expect(searchFor(periodOf("week", "2026-09-30"), TODAY, NO_DIAPERS)).toEqual({
      view: "week",
      date: "2026-09-28",
      hide: "diapers",
    })
  })
})

describe("navigationOf", () => {
  it("steps back a day from today, and not forward", () => {
    expect(navigationOf(periodOf("day", TODAY), TODAY, BIRTH, NONE)).toMatchObject({
      isCurrent: true,
      previous: { date: "2026-10-10" },
      next: null,
    })
  })

  it("steps forward from yesterday to today's own address", () => {
    expect(navigationOf(periodOf("day", "2026-10-10"), TODAY, BIRTH, NONE).next).toEqual({
      view: undefined,
      date: undefined,
      hide: undefined,
    })
  })

  it("stops at the birth date, a day or a week at a time", () => {
    expect(navigationOf(periodOf("day", BIRTH), TODAY, BIRTH, NONE)).toMatchObject({
      isCurrent: false,
      previous: null,
      next: { date: "2026-09-02" },
    })
    expect(navigationOf(periodOf("week", BIRTH), TODAY, BIRTH, NONE).previous).toBeNull()
    expect(navigationOf(periodOf("week", "2026-09-07"), TODAY, BIRTH, NONE).previous).toMatchObject({
      date: "2026-08-31",
    })
  })

  it("steps a week at a time, keeping what's hidden, with a way back to this week", () => {
    const navigation = navigationOf(periodOf("week", "2026-09-30"), TODAY, BIRTH, NO_DIAPERS)
    expect(navigation).toMatchObject({
      isCurrent: false,
      previous: { view: "week", date: "2026-09-21", hide: "diapers" },
      next: { view: "week", date: undefined, hide: "diapers" },
      current: { view: "week", date: undefined, hide: "diapers" },
    })
  })
})

describe("viewSearch", () => {
  it("opens the week that holds the day shown", () => {
    expect(viewSearch("week", periodOf("day", "2026-09-30"), TODAY, NONE)).toMatchObject({
      view: "week",
      date: "2026-09-28",
    })
  })

  it("opens today from this week, and Monday from an earlier week", () => {
    expect(viewSearch("day", periodOf("week", TODAY), TODAY, NONE)).toMatchObject({ view: undefined, date: undefined })
    expect(viewSearch("day", periodOf("week", "2026-09-30"), TODAY, NO_DIAPERS)).toEqual({
      view: undefined,
      date: "2026-09-28",
      hide: "diapers",
    })
  })
})

describe("daySearch", () => {
  it("opens a week's day in the Day view, keeping what's hidden", () => {
    expect(daySearch("2026-10-06", TODAY, NO_DIAPERS)).toEqual({ view: undefined, date: "2026-10-06", hide: "diapers" })
    expect(daySearch(TODAY, TODAY, NONE)).toEqual({ view: undefined, date: undefined, hide: undefined })
  })
})
