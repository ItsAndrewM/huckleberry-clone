import { createChartScene, renderChartSvg } from "@tanstack/charts"
import { describe, expect, it } from "vitest"
import { ageWindowFor, axisLabel, curvesFor, growthRows } from "../src/features/growth/chart-model.ts"
import {
  chartDescription,
  type GrowthChartModel,
  growthChartDefinition,
  plottedRows,
  pointSummary,
} from "../src/features/growth/growth-chart-definition.ts"
import { GROWTH_METRICS } from "../src/features/growth/metrics.ts"
import { at, LOCALE, MEASUREMENTS, measurement, meWith } from "./growth-fixtures.ts"

const [WEIGHT] = GROWTH_METRICS
const SIZE = { width: 358, height: 320 }
const THEME_PAINTS = ["currentColor", "none", "var(--background)", "var(--muted-foreground)", "var(--primary)"]

const weightRows = () => growthRows(MEASUREMENTS, WEIGHT, meWith(), LOCALE)

const extremeWeightRows = () =>
  growthRows(
    [
      ...MEASUREMENTS,
      measurement("below", at("2026-09-20", 10), { weightG: 2000 }),
      measurement("above", at("2026-09-25", 10), { weightG: 6500 }),
    ],
    WEIGHT,
    meWith(),
    LOCALE,
  )

const weightChart = (ageToday: number, rows = weightRows()) => {
  const ageWindow = ageWindowFor(ageToday)
  const curves = curvesFor("weightForAge", "female", ageWindow, "kg")
  if (curves === "unavailable") throw new Error("A girl's weight curves should be drawn")
  return { ageWindow, axisLabel: axisLabel(WEIGHT, "kg"), curves, plotted: plottedRows(rows) }
}

const svgOf = (model: GrowthChartModel) =>
  renderChartSvg(createChartScene(growthChartDefinition(model), SIZE), {
    ariaLabel: "Weight-for-age, girls, birth to 6 months",
  })

const captured = (svg: string, pattern: RegExp) => [...svg.matchAll(pattern)].map((match) => match.slice(1).join(":"))

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

describe("chartDescription", () => {
  it.each([
    [0, "0 measurements over WHO's 3rd, 15th, 50th, 85th and 97th percentile curves."],
    [1, "1 measurement over WHO's 3rd, 15th, 50th, 85th and 97th percentile curves."],
    [3, "3 measurements over WHO's 3rd, 15th, 50th, 85th and 97th percentile curves."],
  ])("tells a screen reader how many measurements the chart holds, singular for one: %i", (count, description) => {
    expect(chartDescription(count)).toBe(description)
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

  it("paints every mark in the theme's own colours, even for a weight below the 1st and one above the 99th", () => {
    const model = weightChart(38, extremeWeightRows())
    expect(model.plotted.map(({ row }) => row.percentile)).toEqual(["47th", "52nd", "<1st", ">99th", "47th"])
    const paints = captured(svgOf(model), /\s(?:fill|stroke)="([^"]*)"/g)
    expect(paints.length).toBeGreaterThan(0)
    expect(paints.filter((paint) => !THEME_PAINTS.includes(paint))).toEqual([])
  })

  it("draws the 3rd, 15th, 85th and 97th curves at 0.7 opacity and the 50th at 0.9", () => {
    const svg = svgOf(weightChart(38, extremeWeightRows()))
    expect(captured(svg, /data-ts-key="curve-(\d+):[^"]*"[^>]*stroke-opacity="([^"]+)"/g)).toEqual([
      "3:0.7",
      "15:0.7",
      "50:0.9",
      "85:0.7",
      "97:0.7",
    ])
  })
})
