import { describe, expect, it } from "vitest"
import {
  CURVE_PERCENTILES,
  type CurvePercentile,
  type GrowthMetric,
  percentileFor,
  valueAtPercentile,
} from "../../src/index.ts"

const METRICS = [
  "weightForAge",
  "lengthForAge",
  "headCircumferenceForAge",
] as const satisfies ReadonlyArray<GrowthMetric>

const READ_BACK_DAYS = [0, 1, 365, 730]

const drawn = (metric: GrowthMetric, ageDays: number, curve: CurvePercentile): number => {
  const value = valueAtPercentile(metric, "female", ageDays, curve)
  if (value === "unavailable") throw new Error(`No value at percentile ${curve} for ${metric} on day ${ageDays}`)
  return value
}

describe("valueAtPercentile", () => {
  it("draws the curves WHO publishes for its charts, the 3rd to the 97th", () => {
    expect(CURVE_PERCENTILES).toEqual([3, 15, 50, 85, 97])
  })

  it("puts the 50th percentile at WHO's median, in the unit growth records store", () => {
    expect(valueAtPercentile("weightForAge", "female", 0, 50)).toBeCloseTo(3232.2, 9)
    expect(valueAtPercentile("lengthForAge", "female", 0, 50)).toBeCloseTo(49.1477, 12)
    expect(valueAtPercentile("headCircumferenceForAge", "female", 0, 50)).toBeCloseTo(33.8787, 12)
  })

  it.each(METRICS.flatMap((metric) => CURVE_PERCENTILES.map((curve) => ({ metric, curve }))))(
    "draws $metric at percentile $curve where percentileFor reads it back, on days 0, 1, 365 and 730",
    ({ metric, curve }) => {
      for (const day of READ_BACK_DAYS) {
        expect(percentileFor(metric, "female", day, drawn(metric, day, curve))).toBeCloseTo(curve, 9)
      }
    },
  )

  it.each([
    { reason: "a boy, whose tables aren't bundled", sex: "male", ageDays: 0 },
    { reason: "an age before birth", sex: "female", ageDays: -1 },
    { reason: "an age past day 730", sex: "female", ageDays: 731 },
    { reason: "part of a day", sex: "female", ageDays: 0.5 },
  ] as const)("is unavailable for $reason", ({ sex, ageDays }) => {
    expect(valueAtPercentile("weightForAge", sex, ageDays, 50)).toBe("unavailable")
  })
})
