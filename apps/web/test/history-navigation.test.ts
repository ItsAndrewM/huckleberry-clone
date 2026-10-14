import { describe, expect, it } from "vitest"
import { hiddenIn } from "../src/features/history/history-kinds.ts"
import {
  daySearch,
  goToOpensOn,
  navigationOf,
  opensAtTop,
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
    expect(shownPeriod({}, TODAY, BIRTH)).toEqual({ view: "day", date: TODAY })
    expect(shownPeriod({ date: "2026-10-12" }, TODAY, BIRTH)).toEqual({ view: "day", date: TODAY })
  })

  it("shows an earlier day the address names", () => {
    expect(shownPeriod({ date: "2026-10-09" }, TODAY, BIRTH)).toEqual({ view: "day", date: "2026-10-09" })
  })

  it("shows the week that holds the address's date, or this week", () => {
    expect(shownPeriod({ view: "week" }, TODAY, BIRTH)).toEqual({ view: "week", week: "2026-W41" })
    expect(shownPeriod({ view: "week", date: "2026-09-30" }, TODAY, BIRTH)).toEqual({ view: "week", week: "2026-W40" })
  })

  it("shows a day as a list when the address asks for it", () => {
    expect(shownPeriod({ view: "list" }, TODAY, BIRTH)).toEqual({ view: "list", date: TODAY })
    expect(shownPeriod({ view: "list", date: "2026-10-09" }, TODAY, BIRTH)).toEqual({
      view: "list",
      date: "2026-10-09",
    })
    expect(shownPeriod({ view: "list", date: "2026-08-10" }, TODAY, BIRTH)).toEqual({ view: "list", date: BIRTH })
  })

  it("shows her birth date, or the week that holds it, for an address naming an earlier day", () => {
    expect(shownPeriod({ date: "2026-08-10" }, TODAY, BIRTH)).toEqual({ view: "day", date: BIRTH })
    expect(shownPeriod({ view: "week", date: "2026-08-10" }, TODAY, BIRTH)).toEqual({ view: "week", week: "2026-W36" })
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

  it("keeps the list in the address, today's included", () => {
    expect(searchFor(periodOf("list", TODAY), TODAY, NONE)).toEqual({ view: "list", date: undefined, hide: undefined })
    expect(searchFor(periodOf("list", "2026-10-09"), TODAY, NO_DIAPERS)).toEqual({
      view: "list",
      date: "2026-10-09",
      hide: "diapers",
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

  it("steps a day at a time in the list, staying a list, with a way back to today's", () => {
    expect(navigationOf(periodOf("list", "2026-10-09"), TODAY, BIRTH, NO_DIAPERS)).toMatchObject({
      isCurrent: false,
      previous: { view: "list", date: "2026-10-08", hide: "diapers" },
      next: { view: "list", date: "2026-10-10", hide: "diapers" },
      current: { view: "list", date: undefined, hide: "diapers" },
    })
    expect(navigationOf(periodOf("list", BIRTH), TODAY, BIRTH, NONE).previous).toBeNull()
    expect(navigationOf(periodOf("list", TODAY), TODAY, BIRTH, NONE).next).toBeNull()
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
    expect(viewSearch("week", periodOf("day", "2026-09-30"), TODAY, BIRTH, NONE)).toMatchObject({
      view: "week",
      date: "2026-09-28",
    })
  })

  it("opens today from this week, and Monday from an earlier week", () => {
    expect(viewSearch("day", periodOf("week", TODAY), TODAY, BIRTH, NONE)).toMatchObject({
      view: undefined,
      date: undefined,
    })
    expect(viewSearch("day", periodOf("week", "2026-09-30"), TODAY, BIRTH, NO_DIAPERS)).toEqual({
      view: undefined,
      date: "2026-09-28",
      hide: "diapers",
    })
  })

  it("lists the day shown, and brings the list's day back to the grid", () => {
    expect(viewSearch("list", periodOf("day", "2026-09-30"), TODAY, BIRTH, NO_DIAPERS)).toEqual({
      view: "list",
      date: "2026-09-30",
      hide: "diapers",
    })
    expect(viewSearch("day", periodOf("list", "2026-09-30"), TODAY, BIRTH, NONE)).toEqual({
      view: undefined,
      date: "2026-09-30",
      hide: undefined,
    })
    expect(viewSearch("week", periodOf("list", "2026-09-30"), TODAY, BIRTH, NONE)).toMatchObject({
      view: "week",
      date: "2026-09-28",
    })
  })

  it("lists today from this week, and Monday from an earlier week", () => {
    expect(viewSearch("list", periodOf("week", TODAY), TODAY, BIRTH, NONE)).toEqual({
      view: "list",
      date: undefined,
      hide: undefined,
    })
    expect(viewSearch("list", periodOf("week", "2026-09-30"), TODAY, BIRTH, NONE)).toMatchObject({
      view: "list",
      date: "2026-09-28",
    })
  })

  it("keeps a switch from her birth week inside her days", () => {
    expect(viewSearch("day", periodOf("week", BIRTH), TODAY, BIRTH, NONE)).toEqual({
      view: undefined,
      date: BIRTH,
      hide: undefined,
    })
  })
})

describe("goToOpensOn", () => {
  it("opens Go to on the day shown, or the week's Monday, or her birth date in her first week", () => {
    expect(goToOpensOn(periodOf("day", "2026-10-06"), BIRTH)).toBe("2026-10-06")
    expect(goToOpensOn(periodOf("list", "2026-10-06"), BIRTH)).toBe("2026-10-06")
    expect(goToOpensOn(periodOf("week", "2026-09-30"), BIRTH)).toBe("2026-09-28")
    expect(goToOpensOn(periodOf("week", BIRTH), BIRTH)).toBe(BIRTH)
  })
})

describe("daySearch", () => {
  it("opens a week's day in the Day view, keeping what's hidden", () => {
    expect(daySearch("2026-10-06", TODAY, NO_DIAPERS)).toEqual({ view: undefined, date: "2026-10-06", hide: "diapers" })
    expect(daySearch(TODAY, TODAY, NONE)).toEqual({ view: undefined, date: undefined, hide: undefined })
  })
})

describe("opensAtTop", () => {
  it("leaves the scroll to a Day view, which opens at now or at its first entry", () => {
    expect(opensAtTop({})).toBe(false)
    expect(opensAtTop({ date: "2026-10-06", hide: "diapers" })).toBe(false)
  })

  it("opens a day's list and a week at the top", () => {
    expect(opensAtTop({ view: "list" })).toBe(true)
    expect(opensAtTop({ view: "list", date: "2026-10-06" })).toBe(true)
    expect(opensAtTop({ view: "week", date: "2026-09-28" })).toBe(true)
  })
})
