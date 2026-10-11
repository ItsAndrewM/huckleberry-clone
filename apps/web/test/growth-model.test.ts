import { CURVE_PERCENTILES, type CurvePercentile, valueAtPercentile } from "@bt/domain"
import { describe, expect, it } from "vitest"
import {
  ageWindowFor,
  axisLabel,
  axisUnitOf,
  curveEnds,
  curvesFor,
  DAYS_PER_MONTH,
  growthRows,
  inAxisUnit,
  monthTicks,
} from "../src/features/growth/chart-model.ts"
import { GROWTH_METRICS } from "../src/features/growth/metrics.ts"
import { at, LOCALE, MEASUREMENTS, measurement, meWith, UNITS } from "./growth-fixtures.ts"

const [WEIGHT, LENGTH, HEAD] = GROWTH_METRICS

describe("ageWindowFor", () => {
  it.each([
    [0, 6],
    [38, 6],
    [182, 6],
    [183, 12],
    [365, 12],
    [366, 24],
    [730, 24],
    [900, 24],
  ])("on day %i of her life, shows birth to %i months", (ageToday, months) => {
    expect(ageWindowFor(ageToday).months).toBe(months)
  })

  it("ticks every month for 6 months, every 2 for a year and every 3 for 2 years", () => {
    expect([0, 183, 366].map((ageToday) => monthTicks(ageWindowFor(ageToday)))).toEqual([
      [0, 1, 2, 3, 4, 5, 6],
      [0, 2, 4, 6, 8, 10, 12],
      [0, 3, 6, 9, 12, 15, 18, 21, 24],
    ])
  })
})

describe("axisLabel", () => {
  it.each([
    [0, "kg", "Weight (kg)"],
    [1, "in", "Length (in)"],
    [2, "cm", "Head circumference (cm)"],
  ] as const)("names metric %i's axis in %s as %s", (index, unit, label) => {
    const info = GROWTH_METRICS[index]
    expect(axisLabel(info, unit)).toBe(label)
  })
})

describe("axisUnitOf and inAxisUnit", () => {
  it.each([
    { metric: "weightForAge", setting: "kg", units: { ...UNITS, weight: "kg" }, unit: "kg" },
    { metric: "weightForAge", setting: "g", units: { ...UNITS, weight: "g" }, unit: "kg" },
    { metric: "weightForAge", setting: "lb_oz", units: { ...UNITS, weight: "lb_oz" }, unit: "lb" },
    { metric: "lengthForAge", setting: "cm", units: { ...UNITS, length: "cm" }, unit: "cm" },
    { metric: "headCircumferenceForAge", setting: "in", units: { ...UNITS, length: "in" }, unit: "in" },
  ] as const)("plots $metric in $unit when the household's setting is $setting", ({ metric, units, unit }) => {
    expect(axisUnitOf(metric, units)).toBe(unit)
  })

  it.each([
    [4300, "kg", 4.3],
    [453.59237, "lb", 1],
    [2.54, "in", 1],
    [54.5, "cm", 54.5],
  ] as const)("plots a stored %f in %s at %f", (recorded, unit, plotted) => {
    expect(inAxisUnit(recorded, unit)).toBeCloseTo(plotted, 12)
  })
})

describe("curvesFor", () => {
  const sixMonths = ageWindowFor(0)

  const girlsWeightCurves = () => {
    const curves = curvesFor("weightForAge", "female", sixMonths, "kg")
    if (curves === "unavailable") throw new Error("A girl's weight curves should be drawn")
    return curves
  }

  const girlsWeightKg = (day: number, percentile: CurvePercentile) => {
    const grams = valueAtPercentile("weightForAge", "female", day, percentile)
    if (grams === "unavailable") throw new Error(`WHO has a girl's weight at percentile ${percentile} on day ${day}`)
    return grams / 1000
  }

  it("draws the 3rd to 97th curves for each day of the window, labelled at their ends", () => {
    const curves = curvesFor("weightForAge", "female", sixMonths, "kg")
    if (curves === "unavailable") throw new Error("A girl's weight curves should be drawn")
    expect(curves.map(({ label }) => label)).toEqual(["3rd", "15th", "50th", "85th", "97th"])
    expect(curves.map(({ points }) => points.length)).toEqual([183, 183, 183, 183, 183])
  })

  it("starts the 50th at WHO's median at birth and ends it on the window's last day, in the axis unit", () => {
    const curves = curvesFor("weightForAge", "female", sixMonths, "lb")
    if (curves === "unavailable") throw new Error("A girl's weight curves should be drawn")
    const median = curves[2]?.points ?? []
    expect(median[0]?.months).toBe(0)
    expect(median[0]?.value).toBeCloseTo(3232.2 / 453.59237, 12)
    expect(median.at(-1)?.months).toBeCloseTo(182 / DAYS_PER_MONTH, 12)
  })

  it("draws each curve at its own percentile, in kg, on the window's first and last days", () => {
    const days = [0, 182]
    const drawn = girlsWeightCurves().map(({ points }) => days.map((day) => points[day]?.value))
    expect(drawn).toEqual(CURVE_PERCENTILES.map((percentile) => days.map((day) => girlsWeightKg(day, percentile))))
  })

  it("starts the curves at WHO's birth weights, rising from the 3rd's 2.440 kg to the 97th's 4.166 kg", () => {
    const atBirth = girlsWeightCurves().map(({ points }) => points[0]?.value.toFixed(3))
    expect(atBirth).toEqual(["2.440", "2.779", "3.232", "3.729", "4.166"])
  })

  it("draws 2 years of days for a 2-year window", () => {
    const curves = curvesFor("lengthForAge", "female", ageWindowFor(400), "cm")
    if (curves === "unavailable") throw new Error("A girl's length curves should be drawn")
    expect(curves[0]?.points.length).toBe(731)
  })

  it("has no curves for a boy, whose tables aren't bundled", () => {
    expect(curvesFor("weightForAge", "male", sixMonths, "kg")).toBe("unavailable")
  })

  it("puts each curve's label at its last point, the window's last day", () => {
    const curves = curvesFor("headCircumferenceForAge", "female", sixMonths, "cm")
    if (curves === "unavailable") throw new Error("A girl's head circumference curves should be drawn")
    const ends = curveEnds(curves)
    expect(ends.map(({ label }) => label)).toEqual(["3rd", "15th", "50th", "85th", "97th"])
    expect(ends.map(({ months }) => months)).toEqual(Array.from({ length: 5 }, () => 182 / DAYS_PER_MONTH))
    expect(ends[2]?.value).toBe(curves[2]?.points.at(-1)?.value)
  })
})

describe("growthRows", () => {
  it("lists every weight, newest first, with its day, age, value and percentile", () => {
    expect(growthRows(MEASUREMENTS, WEIGHT, meWith(), LOCALE)).toEqual([
      {
        id: "m3",
        measuredOn: "Oct 6, 2026",
        age: "1 mo 5 d",
        value: "4.30 kg",
        percentile: "47th",
        point: { months: 35 / DAYS_PER_MONTH, value: 4.3 },
      },
      {
        id: "m2",
        measuredOn: "Sep 15, 2026",
        age: "14 d",
        value: "3.60 kg",
        percentile: "52nd",
        point: { months: 14 / DAYS_PER_MONTH, value: 3.6 },
      },
      {
        id: "m1",
        measuredOn: "Sep 1, 2026",
        age: "Birth",
        value: "3.20 kg",
        percentile: "47th",
        point: { months: 0, value: 3.2 },
      },
    ])
  })

  it("dates and ages a late-evening measurement by the household's day, though UTC has moved on", () => {
    const [row] = growthRows([measurement("m", at("2026-10-06", 23), { weightG: 4300 })], WEIGHT, meWith(), LOCALE)
    expect(row).toMatchObject({ measuredOn: "Oct 6, 2026", age: "1 mo 5 d", point: { months: 35 / DAYS_PER_MONTH } })
  })

  it("leaves out a measurement without the metric", () => {
    expect(growthRows(MEASUREMENTS, LENGTH, meWith(), LOCALE).map(({ id }) => id)).toEqual(["m3", "m1"])
  })

  it("shows values in the household's units, and plots them in the axis unit", () => {
    const [newest] = growthRows(MEASUREMENTS, HEAD, meWith({ units: { ...UNITS, length: "in" } }), LOCALE)
    expect(newest?.value).toBe("14.5 in")
    expect(newest?.point?.value).toBeCloseTo(36.8 / 2.54, 12)
  })

  it.each([
    { reason: "before the birth date", measuredAt: at("2026-08-31", 10), age: "Before birth" },
    { reason: "after day 730", measuredAt: at("2028-09-01", 10), age: "24 mo" },
  ])("lists a measurement from $reason without a percentile or a point", ({ measuredAt, age }) => {
    const [row] = growthRows([measurement("m", measuredAt, { weightG: 4000 })], WEIGHT, meWith(), LOCALE)
    expect(row).toMatchObject({ age, percentile: "Percentile unavailable", point: null })
  })

  it("plots a measurement on day 730, WHO's last day, with its percentile", () => {
    const [row] = growthRows([measurement("m", at("2028-08-31", 10), { weightG: 12_000 })], WEIGHT, meWith(), LOCALE)
    expect(row).toMatchObject({
      age: "23 mo 30 d",
      percentile: "64th",
      point: { months: 730 / DAYS_PER_MONTH, value: 12 },
    })
  })

  it("keeps a boy's values and reads Percentile unavailable on his rows, as the page draws no chart for him", () => {
    const [row] = growthRows(MEASUREMENTS, WEIGHT, meWith({ child: { sex: "male" } }), LOCALE)
    expect(row?.percentile).toBe("Percentile unavailable")
    expect(row?.point).toEqual({ months: 35 / DAYS_PER_MONTH, value: 4.3 })
  })
})
