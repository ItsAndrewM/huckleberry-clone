import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { addDaysToDate, ageInDays, ageInMonthsAndDays } from "../../src/index.ts"

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

describe("ageInMonthsAndDays", () => {
  it.each([
    { measuredOn: "2026-09-01", age: "the birth date itself", months: 0, days: 0 },
    { measuredOn: "2026-09-15", age: "14 days", months: 0, days: 14 },
    { measuredOn: "2026-09-30", age: "29 days", months: 0, days: 29 },
    { measuredOn: "2026-10-01", age: "1 month", months: 1, days: 0 },
    { measuredOn: "2026-10-06", age: "1 month and 5 days", months: 1, days: 5 },
    { measuredOn: "2027-09-01", age: "12 months", months: 12, days: 0 },
    { measuredOn: "2028-08-31", age: "23 months and 30 days", months: 23, days: 30 },
  ])("puts $measuredOn at $age after a birth on 1 September 2026", ({ measuredOn, months, days }) => {
    expect(ageInMonthsAndDays(measuredOn, "2026-09-01")).toEqual({ months, days })
  })

  it.each([
    { measuredOn: "2027-02-28", age: "1 month", months: 1, days: 0 },
    { measuredOn: "2027-03-01", age: "1 month and 1 day", months: 1, days: 1 },
    { measuredOn: "2027-03-30", age: "1 month and 30 days", months: 1, days: 30 },
    { measuredOn: "2027-03-31", age: "2 months", months: 2, days: 0 },
    { measuredOn: "2027-04-30", age: "3 months", months: 3, days: 0 },
  ])(
    "counts a 31 January birth's months on the last day of shorter months: $measuredOn is $age",
    ({ measuredOn, months, days }) => {
      expect(ageInMonthsAndDays(measuredOn, "2027-01-31")).toEqual({ months, days })
    },
  )

  it.each([
    { measuredOn: "2028-02-28", age: "28 days", months: 0, days: 28 },
    { measuredOn: "2028-02-29", age: "1 month", months: 1, days: 0 },
  ])(
    "counts a 31 January birth's month on 29 February in a leap year: $measuredOn is $age",
    ({ measuredOn, months, days }) => {
      expect(ageInMonthsAndDays(measuredOn, "2028-01-31")).toEqual({ months, days })
    },
  )

  it("turns a 29 February birth a year old on 28 February", () => {
    expect(ageInMonthsAndDays("2029-02-28", "2028-02-29")).toEqual({ months: 12, days: 0 })
  })

  it("counts a year below 100 as itself, not as a year in the 1900s", () => {
    expect(ageInMonthsAndDays("0050-03-01", "0050-01-31")).toEqual({ months: 1, days: 1 })
  })

  it("has no age before the birth date", () => {
    expect(ageInMonthsAndDays("2026-08-31", "2026-09-01")).toBeNull()
  })

  it("steps a day at a time: the next day adds a day, or starts the next month at day 0", () => {
    fc.assert(
      fc.property(dates, fc.integer({ min: 0, max: 800 }), (birthDate, span) => {
        const today = ageInMonthsAndDays(addDaysToDate(birthDate, span), birthDate)
        const tomorrow = ageInMonthsAndDays(addDaysToDate(birthDate, span + 1), birthDate)
        expect(today).not.toBeNull()
        expect([
          { months: today?.months, days: (today?.days ?? Number.NaN) + 1 },
          { months: (today?.months ?? Number.NaN) + 1, days: 0 },
        ]).toContainEqual(tomorrow)
      }),
    )
  })

  it.each([
    ["2026-02-30", "2026-01-01"],
    ["2026-10-10", ""],
  ])("throws on %j or %j instead of guessing a date", (measuredOn, birthDate) => {
    expect(() => ageInMonthsAndDays(measuredOn, birthDate)).toThrow(RangeError)
  })
})
