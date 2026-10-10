import { createChartScene, renderChartSvg } from "@tanstack/charts"
import { describe, expect, it } from "vitest"
import { ageWindowFor, axisLabel, curvesFor, growthRows } from "../src/features/growth/chart-model.ts"
import { growthChartDefinition, plottedRows, pointSummary } from "../src/features/growth/growth-chart-definition.ts"
import { GROWTH_METRICS } from "../src/features/growth/metrics.ts"
import { at, LOCALE, MEASUREMENTS, measurement, meWith } from "./growth-fixtures.ts"

const [WEIGHT] = GROWTH_METRICS
const SIZE = { width: 358, height: 320 }

const weightRows = () => growthRows(MEASUREMENTS, WEIGHT, meWith(), LOCALE)

const weightChart = (ageToday: number) => {
  const ageWindow = ageWindowFor(ageToday)
  const curves = curvesFor("weightForAge", "female", ageWindow, "kg")
  if (curves === "unavailable") throw new Error("A girl's weight curves should be drawn")
  return { ageWindow, axisLabel: axisLabel(WEIGHT, "kg"), curves, plotted: plottedRows(weightRows()) }
}

describe("plottedRows", () => {
  it("plots her measurements oldest first, so the line and the keyboard follow her age", () => {
    expect(plottedRows(weightRows()).map(({ id }) => id)).toEqual(["m1", "m2", "m3"])
  })

  it("leaves out a row the chart can't place", () => {
    const late = growthRows([measurement("late", at("2028-09-01", 10), { weightG: 12_000 })], WEIGHT, meWith(), LOCALE)
    expect(plottedRows(late)).toEqual([])
  })
})

describe("pointSummary", () => {
  it("reads a point as its date, age, value and percentile", () => {
    const [newest] = weightRows()
    expect(newest === undefined ? "" : pointSummary(newest)).toBe("Oct 6, 2026 · 1 mo 5 d · 4.30 kg · 47th")
  })
})

describe("growthChartDefinition", () => {
  it("lets only her measurements take focus and a tooltip, never the curves or their labels", () => {
    const scene = createChartScene(growthChartDefinition(weightChart(38)), SIZE)
    expect(scene.points.map(({ markId }) => markId)).toEqual(["her-points", "her-points", "her-points"])
  })

  it.each([
    [38, ["0", "1", "2", "3", "4", "5", "6"]],
    [400, ["0", "3", "6", "9", "12", "15", "18", "21", "24"]],
  ])("ticks the age axis in whole months on day %i", (ageToday, ticks) => {
    const scene = createChartScene(growthChartDefinition(weightChart(ageToday)), SIZE)
    expect(scene.scales["x"]?.ticks?.map(({ label }) => label)).toEqual(ticks)
  })

  it("draws an SVG that names itself to a screen reader", () => {
    const scene = createChartScene(growthChartDefinition(weightChart(38)), SIZE)
    const svg = renderChartSvg(scene, { ariaLabel: "Weight-for-age, girls, birth to 6 months" })
    expect(svg).toContain('role="img"')
    expect(svg).toContain('aria-label="Weight-for-age, girls, birth to 6 months"')
  })
})
