import { describe, expect, it } from "vitest"
import { formatAge, formatMeasuredOn, formatMeasurement, formatPercentile } from "../src/features/growth/format.ts"
import { at, LOCALE, UNITS, ZONE } from "./growth-fixtures.ts"

describe("formatPercentile", () => {
  it.each([
    [46.773, "47th"],
    [0.5, "1st"],
    [1.49, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [99.49, "99th"],
  ])("shows percentile %f as a whole %s", (percentile, shown) => {
    expect(formatPercentile(percentile)).toBe(shown)
  })

  it.each([
    [0, "<1st"],
    [0.4999, "<1st"],
    [99.5, ">99th"],
    [100, ">99th"],
  ])("shows %f, which rounds to 0 or 100, as %s, never a 0th or 100th", (percentile, shown) => {
    expect(formatPercentile(percentile)).toBe(shown)
  })

  it("says when there's no percentile", () => {
    expect(formatPercentile("unavailable")).toBe("Percentile unavailable")
  })
})

describe("formatAge", () => {
  it.each([
    [0, 0, "Birth"],
    [0, 1, "1 d"],
    [0, 14, "14 d"],
    [1, 0, "1 mo"],
    [1, 5, "1 mo 5 d"],
    [23, 30, "23 mo 30 d"],
  ])("shows %i months and %i days as %s", (months, days, shown) => {
    expect(formatAge({ months, days })).toBe(shown)
  })

  it("says a measurement from before the birth date has no age", () => {
    expect(formatAge(null)).toBe("Before birth")
  })
})

describe("formatMeasurement", () => {
  it.each([
    ["kg", 4300, "4.30 kg"],
    ["kg", 3456.7, "3.46 kg"],
    ["g", 4300, "4300 g"],
    ["g", 3200.4, "3200 g"],
    ["lb_oz", 4300, "9 lb 7.7 oz"],
    ["lb_oz", 3600, "7 lb 15.0 oz"],
    ["lb_oz", 3200, "7 lb 0.9 oz"],
  ] as const)("shows a weight in %s: %f g as %s", (weight, grams, shown) => {
    expect(formatMeasurement("weightForAge", grams, { ...UNITS, weight })).toBe(shown)
  })

  it.each([
    ["lengthForAge", "cm", 54.5, "54.5 cm"],
    ["lengthForAge", "in", 54.5, "21.5 in"],
    ["headCircumferenceForAge", "cm", 34, "34.0 cm"],
    ["headCircumferenceForAge", "in", 36.8, "14.5 in"],
  ] as const)("shows %s in %s: %f cm as %s", (metric, length, cm, shown) => {
    expect(formatMeasurement(metric, cm, { ...UNITS, length })).toBe(shown)
  })
})

describe("formatMeasuredOn", () => {
  it("names the day in the household's zone", () => {
    expect(formatMeasuredOn(at("2026-10-06", 10), ZONE, LOCALE)).toBe("Oct 6, 2026")
  })

  it("keeps a late-evening measurement on its own day, though UTC has moved on", () => {
    expect(formatMeasuredOn(at("2026-10-06", 23), ZONE, LOCALE)).toBe("Oct 6, 2026")
  })
})
