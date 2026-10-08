import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  CM_PER_INCH,
  cmFromInches,
  flOzFromMl,
  GRAMS_PER_OUNCE,
  GRAMS_PER_POUND,
  gramsFromPoundsOunces,
  inchesFromCm,
  ML_PER_FL_OZ,
  mlFromFlOz,
  OUNCES_PER_POUND,
  poundsOuncesFromGrams,
  roundTo,
  validateVolumeMl,
} from "../../src/index.ts"

describe("exact constants", () => {
  it("uses the international pound and inch and the US fluid ounce", () => {
    expect(GRAMS_PER_POUND).toBe(453.59237)
    expect(OUNCES_PER_POUND).toBe(16)
    expect(GRAMS_PER_OUNCE).toBe(28.349523125)
    expect(CM_PER_INCH).toBe(2.54)
    expect(ML_PER_FL_OZ).toBe(29.5735295625)
  })

  it("converts without rounding", () => {
    expect(gramsFromPoundsOunces(1, 0)).toBe(453.59237)
    expect(gramsFromPoundsOunces(0, 1)).toBe(28.349523125)
    expect(cmFromInches(1)).toBe(2.54)
    expect(inchesFromCm(2.54)).toBe(1)
    expect(flOzFromMl(ML_PER_FL_OZ)).toBe(1)
  })
})

describe("roundTo", () => {
  it.each([
    [1.25, 1, 1.3],
    [3401.9, 0, 3402],
    [0.05, 1, 0.1],
  ])("%s to %s decimals is %s", (value, decimals, expected) => {
    expect(roundTo(value, decimals)).toBe(expected)
  })
})

describe("pounds and ounces", () => {
  it("carries a rounded 16 oz into the next pound", () => {
    expect(poundsOuncesFromGrams(gramsFromPoundsOunces(7, 15.97), 1)).toEqual({ pounds: 8, ounces: 0 })
  })

  it("round-trips any entry to a tenth of an ounce (AC 8)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40 }), fc.integer({ min: 0, max: 159 }), (pounds, tenths) => {
        const ounces = tenths / 10
        expect(poundsOuncesFromGrams(gramsFromPoundsOunces(pounds, ounces), 1)).toEqual({ pounds, ounces })
      }),
    )
  })
})

describe("centimetres and inches", () => {
  it("round-trips any entry to a tenth of an inch (AC 8)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 600 }), (tenths) => {
        const inches = tenths / 10
        expect(roundTo(inchesFromCm(cmFromInches(inches)), 1)).toBe(inches)
      }),
    )
  })
})

describe("bottle volumes in ounces", () => {
  it("stores ounces as millilitres to the 0.1 mL that volumes allow", () => {
    expect(mlFromFlOz(1)).toBe(29.6)
    expect(mlFromFlOz(2.5)).toBe(73.9)
  })

  it("shows any amount entered to a tenth of an ounce unchanged after a switch to mL and back", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 160 }), (tenths) => {
        const flOz = tenths / 10
        const ml = mlFromFlOz(flOz)
        expect(validateVolumeMl(ml)).toBeNull()
        expect(roundTo(flOzFromMl(ml), 1)).toBe(flOz)
      }),
    )
  })
})
