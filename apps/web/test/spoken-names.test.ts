import { describe, expect, it } from "vitest"
import { formatAgeWords } from "../src/features/growth/format.ts"
import { entryName } from "../src/features/history/entry-labels.ts"
import { BOTH, DATE, DISPLAY, local, NOW_ON_DAY } from "./history-fixtures.ts"
import { sleptAt } from "./today-fixtures.ts"

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
