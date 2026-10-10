import { describe, expect, it } from "vitest"
import { zScoreLMS } from "../../src/index.ts"

const NORMAL = { L: 1, M: 50, S: 0.04 }
const SKEWED = { L: 0.5, M: 4, S: 0.1 }
const LOGNORMAL = { L: 0, M: 5, S: 0.1 }

describe("zScoreLMS", () => {
  it.each([
    { curve: "a normal curve", lms: NORMAL, value: 50, z: 0 },
    { curve: "a normal curve", lms: NORMAL, value: 52, z: 1 },
    { curve: "a normal curve", lms: NORMAL, value: 48, z: -1 },
    { curve: "a curve with L 0.5", lms: SKEWED, value: 4.41, z: 1 },
    { curve: "a curve with L -1", lms: { L: -1, M: 10, S: 0.1 }, value: 100 / 9, z: 1 },
    { curve: "a curve with L 0, through the log", lms: LOGNORMAL, value: 5 * Math.exp(0.2), z: 2 },
  ])("puts $value at z $z on $curve", ({ lms, value, z }) => {
    expect(zScoreLMS(value, lms)).toBeCloseTo(z, 12)
  })

  it("keeps the curve's own z-score up to 3 SD", () => {
    expect(zScoreLMS(5.29, SKEWED)).toBeCloseTo(3, 12)
  })

  it("steps beyond 3 SD by the distance from 2 to 3 SD, as WHO restricts the curve, where the curve alone says 3.96", () => {
    expect(zScoreLMS(5.74, SKEWED)).toBeCloseTo(4, 12)
  })

  it("steps below -3 SD by the distance from -2 to -3 SD, where the curve alone says -4.06", () => {
    expect(zScoreLMS(2.54, SKEWED)).toBeCloseTo(-4, 12)
  })

  it("steps beyond 3 SD the same way when L is 0", () => {
    expect(zScoreLMS(5 * Math.exp(0.4), LOGNORMAL)).toBeCloseTo(3 + Math.exp(0.1), 12)
  })

  it.each([0, -1, Number.NaN])("has no z-score for a measurement of %s", (value) => {
    expect(zScoreLMS(value, SKEWED)).toBeNaN()
  })
})
