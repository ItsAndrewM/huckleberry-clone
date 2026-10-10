import { describe, expect, it } from "vitest"
import { percentileFor, zScoreFor } from "../../src/index.ts"

describe("zScoreFor", () => {
  it("reads a weight in grams, as growth records store it, against WHO's kilograms", () => {
    expect(zScoreFor("weightForAge", "female", 0, 3232.2)).toBeCloseTo(0, 12)
  })

  it("reads length and head circumference in centimetres, WHO's own unit", () => {
    expect(zScoreFor("lengthForAge", "female", 0, 49.1477)).toBeCloseTo(0, 12)
    expect(zScoreFor("headCircumferenceForAge", "female", 0, 33.8787)).toBeCloseTo(0, 12)
  })

  it("uses the L, M and S of the day it's given", () => {
    expect(zScoreFor("weightForAge", "female", 730, 11474.1)).toBeCloseTo(0, 12)
  })

  it.each([
    { reason: "a boy, whose tables aren't bundled", sex: "male", ageDays: 0, value: 3232.2 },
    { reason: "an age before birth", sex: "female", ageDays: -1, value: 3232.2 },
    { reason: "an age past day 730", sex: "female", ageDays: 731, value: 11474.1 },
    { reason: "part of a day", sex: "female", ageDays: 0.5, value: 3232.2 },
    { reason: "a weight of zero", sex: "female", ageDays: 0, value: 0 },
    { reason: "a negative weight", sex: "female", ageDays: 0, value: -1 },
    { reason: "no number", sex: "female", ageDays: 0, value: Number.NaN },
    { reason: "an endless weight", sex: "female", ageDays: 0, value: Number.POSITIVE_INFINITY },
    { reason: "a weight that rounds to nothing in kilograms", sex: "female", ageDays: 0, value: 1e-321 },
  ] as const)("is unavailable for $reason", ({ sex, ageDays, value }) => {
    expect(zScoreFor("weightForAge", sex, ageDays, value)).toBe("unavailable")
    expect(percentileFor("weightForAge", sex, ageDays, value)).toBe("unavailable")
  })
})

describe("percentileFor", () => {
  it("puts WHO's median at the 50th percentile", () => {
    expect(percentileFor("weightForAge", "female", 0, 3232.2)).toBeCloseTo(50, 10)
  })

  it("gives the percentile of the measurement's z-score", () => {
    expect(percentileFor("lengthForAge", "female", 0, 49.1477 * 1.0379)).toBeCloseTo(84.1344746068543, 8)
  })

  it.each([
    { metric: "weightForAge", ageDays: 0, value: 200, expected: 0 },
    { metric: "weightForAge", ageDays: 730, value: 40000, expected: 100 },
    { metric: "lengthForAge", ageDays: 0, value: 20, expected: 0 },
    { metric: "lengthForAge", ageDays: 730, value: 150, expected: 100 },
    { metric: "headCircumferenceForAge", ageDays: 0, value: 15, expected: 0 },
    { metric: "headCircumferenceForAge", ageDays: 730, value: 70, expected: 100 },
  ] as const)(
    "puts $metric at $value on day $ageDays, a limit growth records allow, at percentile $expected",
    ({ metric, ageDays, value, expected }) => {
      expect(percentileFor(metric, "female", ageDays, value)).toBe(expected)
    },
  )
})
