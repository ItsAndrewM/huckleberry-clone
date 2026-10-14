import { describe, expect, it } from "vitest"
import { growthItems, nothingLogged, totalsLines } from "../src/features/history/day-summary.ts"
import { measurement, UNITS } from "./growth-fixtures.ts"
import { dayWith, LOCALE, local, WEIGHED } from "./history-fixtures.ts"
import { dosedAt, NO_TOTALS, ZONE } from "./today-fixtures.ts"

const DAY_TOTALS = {
  ...NO_TOTALS,
  feedsStarted: 7,
  leftSeconds: 3600,
  rightSeconds: 3120,
  nursingSeconds: 6720,
  breastMilkMl: 300,
  formulaMl: 240,
  bottleMl: 540,
  diapers: 8,
  wetDiapers: 6,
  dirtyDiapers: 3,
}

describe("totalsLines", () => {
  it("words the day's totals as Today's card does, feeds then diapers", () => {
    expect(totalsLines(DAY_TOTALS, "ml")).toEqual([
      ["7 feeds started", "1 h 52 min nursing", "540 mL in bottles"],
      ["8 diapers", "6 pee", "3 poo"],
    ])
  })

  it("counts one in the singular, and leaves out what didn't happen", () => {
    const one = { ...NO_TOTALS, feedsStarted: 1, bottleMl: 90, formulaMl: 90, diapers: 1, dirtyDiapers: 1 }
    expect(totalsLines(one, "ml")).toEqual([
      ["1 feed started", "90 mL in bottles"],
      ["1 diaper", "1 poo"],
    ])
  })

  it("has no lines for a day with nothing logged", () => {
    expect(totalsLines(NO_TOTALS, "ml")).toEqual([])
  })
})

describe("a day's sleep line", () => {
  it("says how long she slept, in naps and at night, after the feeds and diapers", () => {
    const slept = { ...NO_TOTALS, sleepsStarted: 3, sleepSeconds: 40_800, napSeconds: 10_200, nightSeconds: 30_600 }
    expect(totalsLines(slept, "ml")).toEqual([["11 h 20 min asleep", "2 h 50 min naps", "8 h 30 min night"]])
  })
})

describe("nothingLogged", () => {
  const EMPTY_DAY = dayWith({ feeds: [], diapers: [], measurements: [], doses: [] })

  it("is said of a day with nothing in it", () => {
    expect(nothingLogged(EMPTY_DAY, "ml")).toBe(true)
  })

  it("isn't said of a day holding only a dose", () => {
    expect(nothingLogged({ ...EMPTY_DAY, doses: [dosedAt(local("08:00"))] }, "ml")).toBe(false)
  })

  it("isn't said of a day holding only feeds or diapers, only a measurement, or only sleep", () => {
    expect(nothingLogged({ ...EMPTY_DAY, totals: DAY_TOTALS }, "ml")).toBe(false)
    expect(nothingLogged({ ...EMPTY_DAY, measurements: [WEIGHED] }, "ml")).toBe(false)
    const napped = { ...NO_TOTALS, sleepsStarted: 1, sleepSeconds: 3600, napSeconds: 3600, longestSleepSeconds: 3600 }
    expect(nothingLogged({ ...EMPTY_DAY, totals: napped }, "ml")).toBe(false)
  })
})

describe("growthItems", () => {
  it("lists each measurement's time and values in the household's units, weight first", () => {
    expect(growthItems([WEIGHED], UNITS, ZONE, LOCALE)).toEqual([
      {
        id: WEIGHED.id,
        time: "8:00 AM",
        values: ["4.21\u00a0kg", "55.0\u00a0cm", "37.5\u00a0cm"],
        name: "Edit the measurement from 8:00 AM",
      },
    ])
  })

  it("leaves out a metric that wasn't measured", () => {
    const headOnly = measurement("head", local("10:00"), { headCm: 38 })
    expect(growthItems([headOnly], { ...UNITS, length: "in" }, ZONE, LOCALE)[0]?.values).toEqual(["15.0\u00a0in"])
  })
})
