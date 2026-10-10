import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { percentile } from "../../src/index.ts"

describe("percentile", () => {
  it.each([
    [0, 50],
    [1, 84.1344746068543],
    [-1, 15.865525393145704],
    [2, 97.72498680518208],
    [-2, 2.2750131948179217],
    [1.959963984540054, 97.5],
    [-1.880793608151251, 3],
    [3, 99.86501019683699],
    [-3, 0.13498980316300957],
    [6, 99.99999990134123],
    [-6, 9.865876450377015e-8],
  ])("puts z %s at percentile %s", (z, expected) => {
    expect(percentile(z)).toBeCloseTo(expected, 12)
  })

  it.each([
    [8, 100],
    [Number.POSITIVE_INFINITY, 100],
    [-8, 0],
    [Number.NEGATIVE_INFINITY, 0],
  ])("rounds z %s to percentile %s, its tail being under 1e-13 points", (z, expected) => {
    expect(percentile(z)).toBe(expected)
  })

  it("stays within 0 to 100 near 8 SD, where the series' last digits cancel", () => {
    const z = 7.98673
    expect(percentile(-z)).toBeGreaterThanOrEqual(0)
    expect(percentile(z)).toBeLessThanOrEqual(100)
  })

  it("has no percentile for no number", () => {
    expect(percentile(Number.NaN)).toBeNaN()
  })

  it("gives z and -z percentiles that sum to 100", () => {
    fc.assert(
      fc.property(fc.double({ min: -10, max: 10, noNaN: true }), (z) => {
        expect(percentile(z) + percentile(-z)).toBeCloseTo(100, 12)
      }),
    )
  })

  it("never falls as z rises from -6 to 6", () => {
    const zs = Array.from({ length: 1200 }, (_, i) => (i - 600) / 100)
    expect(zs.filter((z) => percentile(z + 0.01) < percentile(z))).toEqual([])
  })
})
