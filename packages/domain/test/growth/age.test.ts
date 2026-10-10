import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { addDaysToDate, ageInDays } from "../../src/index.ts"

const dates = fc
  .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2099, 11, 31) })
  .map((ms) => new Date(ms).toISOString().slice(0, 10))

describe("ageInDays", () => {
  it.each([
    { measuredOn: "2026-10-10", birthDate: "2026-10-10", days: 0 },
    { measuredOn: "2026-10-11", birthDate: "2026-10-10", days: 1 },
    { measuredOn: "2027-10-10", birthDate: "2026-10-10", days: 365 },
    { measuredOn: "2028-10-10", birthDate: "2027-10-10", days: 366 },
    { measuredOn: "2026-10-09", birthDate: "2026-10-10", days: -1 },
  ])("puts $measuredOn on day $days after a birth on $birthDate", ({ measuredOn, birthDate, days }) => {
    expect(ageInDays(measuredOn, birthDate)).toBe(days)
  })

  it("puts a two-year visit after a 29 February on day 731, one past WHO's tables", () => {
    expect(ageInDays("2029-03-01", "2027-03-01")).toBe(731)
  })

  it.each([
    { change: "America/Adak springing forward", measuredOn: "2026-03-09", birthDate: "2026-03-07" },
    { change: "America/Adak falling back", measuredOn: "2026-11-02", birthDate: "2026-10-31" },
    { change: "Australia/Lord_Howe falling back", measuredOn: "2026-04-06", birthDate: "2026-04-04" },
    { change: "Australia/Lord_Howe springing forward", measuredOn: "2026-10-05", birthDate: "2026-10-03" },
  ])("counts two whole days across $change, whatever the host's zone", ({ measuredOn, birthDate }) => {
    expect(ageInDays(measuredOn, birthDate)).toBe(2)
  })

  it("gives back the days added to the birth date", () => {
    fc.assert(
      fc.property(dates, fc.integer({ min: -1000, max: 1000 }), (birthDate, days) => {
        expect(ageInDays(addDaysToDate(birthDate, days), birthDate)).toBe(days)
      }),
    )
  })

  it.each([
    ["2026-02-30", "2026-01-01"],
    ["2026-10-10", ""],
    ["2026-10-6", "2026-10-01"],
  ])("throws on %j or %j instead of guessing a date", (measuredOn, birthDate) => {
    expect(() => ageInDays(measuredOn, birthDate)).toThrow(RangeError)
  })
})
