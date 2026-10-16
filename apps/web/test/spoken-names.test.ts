import type { LocalDate } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { formatAgeWords } from "../src/features/growth/format.ts"
import { entryName } from "../src/features/history/entry-labels.ts"
import { BOTH, DATE, DISPLAY, local, NOW_ON_DAY } from "./history-fixtures.ts"
import { diaperAt, sleptAt } from "./today-fixtures.ts"

const plain = (text: string) => text.replace(/\s/gu, " ")

const diaperNameOn = (day: LocalDate, at: number, display = DISPLAY) =>
  plain(entryName({ kind: "diaper", diaper: diaperAt(at) }, display, NOW_ON_DAY, day))

describe("entryName", () => {
  it("says the weekday of an entry that began before the day shown", () => {
    const night = sleptAt(local("20:30", "2026-10-08"), { kind: "night", endedAt: local("05:00") })
    expect(entryName({ kind: "sleep", sleep: night }, DISPLAY, NOW_ON_DAY, DATE)).toMatch(/^Night at Thu 8:30\sPM: /u)
  })

  it("keeps the plain time for an entry on the day shown", () => {
    const nap = sleptAt(local("07:00"), { endedAt: local("07:20") })
    expect(entryName({ kind: "sleep", sleep: nap }, DISPLAY, NOW_ON_DAY, DATE)).toMatch(/^Nap at 7:00\sAM: /u)
  })

  it("starts a diaper's details with the word its marker shows", () => {
    expect(entryName({ kind: "diaper", diaper: BOTH }, DISPLAY, NOW_ON_DAY, DATE)).toMatch(
      /^Diaper at 5:30\sAM: Both, pee and poo$/u,
    )
  })
})

describe("entryName at the edges of the day shown", () => {
  it("keeps the plain time for an entry at exactly the day's first moment", () => {
    expect(diaperNameOn(DATE, local("00:00"))).toBe("Diaper at 12:00 AM: Pee")
  })

  it("says the weekday of an entry a millisecond before the day began", () => {
    expect(diaperNameOn(DATE, local("23:59", "2026-10-08") + 59_999)).toBe("Diaper at Thu 11:59 PM: Pee")
  })
})

describe("entryName on the day the clocks go back", () => {
  const FALL_BACK = "2026-11-01"
  const LOS_ANGELES = { ...DISPLAY, timeZone: "America/Los_Angeles" }
  const FIRST_ONE_THIRTY = Date.parse(`${FALL_BACK}T01:30:00-07:00`)
  const SECOND_ONE_THIRTY = Date.parse(`${FALL_BACK}T01:30:00-08:00`)
  const LAST_HOUR = Date.parse(`${FALL_BACK}T23:30:00-08:00`)

  it("keeps the plain time for both 1:30 AMs", () => {
    expect(SECOND_ONE_THIRTY - FIRST_ONE_THIRTY).toBe(3_600_000)
    expect(diaperNameOn(FALL_BACK, FIRST_ONE_THIRTY, LOS_ANGELES)).toBe("Diaper at 1:30 AM: Pee")
    expect(diaperNameOn(FALL_BACK, SECOND_ONE_THIRTY, LOS_ANGELES)).toBe("Diaper at 1:30 AM: Pee")
  })

  it("keeps the plain time for an entry in the day's 25th hour", () => {
    expect(diaperNameOn(FALL_BACK, LAST_HOUR, LOS_ANGELES)).toBe("Diaper at 11:30 PM: Pee")
  })

  it("says the weekday of that same entry on the next day", () => {
    expect(diaperNameOn("2026-11-02", LAST_HOUR, LOS_ANGELES)).toBe("Diaper at Sun 11:30 PM: Pee")
  })
})

describe("formatAgeWords", () => {
  it.each([
    [{ months: 1, days: 5 }, "1 month 5 days"],
    [{ months: 2, days: 1 }, "2 months 1 day"],
    [{ months: 3, days: 0 }, "3 months"],
    [{ months: 0, days: 12 }, "12 days"],
    [{ months: 0, days: 0 }, "Birth"],
    [null, "Before birth"],
  ])("reads %o as %s", (age, words) => {
    expect(formatAgeWords(age)).toBe(words)
  })
})
