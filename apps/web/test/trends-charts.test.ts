import { datesBetween, type DayStatus, runningTotals, zonedDayBounds } from "@bt/domain"
import { type ChartScene, createChartScene, renderChartSvg } from "@tanstack/charts"
import { describe, expect, it, vi } from "vitest"
import { barChartDefinition, barChartModel } from "../src/features/trends/bar-chart-definition.ts"
import { chartName } from "../src/features/trends/chart-name.ts"
import { dayTicks, hourLabel } from "../src/features/trends/day-ticks.ts"
import { TRENDS_METRICS } from "../src/features/trends/metrics.ts"
import { PLOT_LEFT_MARGIN } from "../src/features/trends/plot-margin.ts"
import {
  runningChartDefinition,
  runningChartDescription,
  runningChartModel,
} from "../src/features/trends/running-chart-definition.ts"
import { trendDays } from "../src/features/trends/trends-numbers.ts"
import { diaperAt, feedAt, nursedFor, ZONE } from "./today-fixtures.ts"
import { BIRTH, dated, LOCALE, MONDAY, TODAY, WEEK } from "./trends-fixtures.ts"

const [FEEDS, NURSING, BOTTLES, DIAPERS] = TRENDS_METRICS
const SIZE = { width: 358, height: 150 }
const DAYS = trendDays(WEEK, TODAY, BIRTH)
const THEME_PAINT =
  /^(?:currentColor|none|var\(--[a-z-]+\)|color-mix\(in oklab, var\(--primary\) \d+%, var\(--background\)\))$/u

const captured = (svg: string, pattern: RegExp) => [...svg.matchAll(pattern)].map((match) => match.slice(1).join(":"))

const widestYLabel = ({ scales }: Pick<ChartScene, "scales">) =>
  Math.max(...(scales["y"]?.ticks ?? []).map(({ label }) => label.length))

const OCTOBER = trendDays(
  datesBetween("2026-10-01", "2026-10-31").map((date) => dated(date, date < TODAY ? MONDAY : undefined)),
  TODAY,
  BIRTH,
)

describe("chartName", () => {
  it("names each chart by what it shows, with a unit in lower case only where the values have one", () => {
    expect(TRENDS_METRICS.map((metric) => chartName(metric, "ml", "each day"))).toEqual([
      "Feeds started each day",
      "Nursing each day, in minutes",
      "Bottles each day, in mL",
      "Diapers each day",
    ])
    expect(TRENDS_METRICS.map((metric) => chartName(metric, "fl_oz", "through the day"))).toEqual([
      "Feeds started through the day",
      "Nursing through the day, in minutes",
      "Bottles through the day, in fl oz",
      "Diapers through the day",
    ])
  })
})

describe("barChartModel", () => {
  it("lays a week out Monday to Sunday, each day labelled by its weekday", () => {
    const model = barChartModel(FEEDS, DAYS, "ml", null, LOCALE)
    expect(model.dates).toEqual(WEEK.map(({ date }) => date))
    expect(model.ticks.map(model.tickLabel)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
  })

  it("lays a month out day by day, labelling the 1st, 8th, 15th, 22nd and 29th", () => {
    const model = barChartModel(FEEDS, OCTOBER, "ml", null, LOCALE)
    expect(model.dates).toHaveLength(31)
    expect(model.ticks.map(model.tickLabel)).toEqual(["1", "8", "15", "22", "29"])
  })

  it("keeps each chart tall enough to read on a quiet day, and taller for the tallest day", () => {
    const quiet = trendDays([dated("2026-10-12")], TODAY, BIRTH)
    expect(TRENDS_METRICS.map((metric) => barChartModel(metric, quiet, "ml", null).top)).toEqual([4, 60, 100, 4])
    expect(barChartModel(BOTTLES, DAYS, "fl_oz", null).top).toBeCloseTo(610 / 29.5735295625, 6)
  })
})

describe("barChartDefinition", () => {
  it("lets each day up to today be picked, and no day still to come", () => {
    const scene = createChartScene(barChartDefinition(barChartModel(NURSING, DAYS, "ml", null)), SIZE)
    expect(new Set(scene.points.map(({ markId }) => markId))).toEqual(new Set(["days", "day-target"]))
    expect(new Set(scene.points.map(({ datum }) => datum.date))).toEqual(new Set(["2026-10-12", "2026-10-13", TODAY]))
  })

  it("lets a day with nothing logged be picked, though it draws no bar", () => {
    const empty = trendDays([dated("2026-10-12"), dated("2026-10-13", MONDAY)], TODAY, BIRTH)
    const scene = createChartScene(barChartDefinition(barChartModel(DIAPERS, empty, "ml", null)), SIZE)
    const picks = scene.points.map(({ markId, datum }) => `${markId}:${datum.date}`)
    expect(picks.toSorted()).toEqual(["day-target:2026-10-12", "day-target:2026-10-13", "days:2026-10-13"])
  })

  it("outlines today's bars, which are so far, and bolds the picked day's label", () => {
    const scene = createChartScene(barChartDefinition(barChartModel(FEEDS, DAYS, "ml", "2026-10-13", LOCALE)), SIZE)
    const svg = renderChartSvg(scene, { ariaLabel: "Feeds started" })
    const dashed = captured(svg, /data-ts-key="days:[^"]*:([\d-]+):feeds"[^>]*stroke-dasharray="([^"]+)"/gu)
    expect(dashed.filter((bar) => !bar.endsWith(":none"))).toEqual([`${TODAY}:3 2`])
    expect(captured(svg, /data-ts-key="x-tick-label:string:10:([\d-]+)"[^>]*font-weight="700"/gu)).toEqual([
      "2026-10-13",
    ])
  })

  it("paints with the theme's own colours, picked or not", () => {
    for (const picked of [null, "2026-10-13"]) {
      const scene = createChartScene(barChartDefinition(barChartModel(BOTTLES, DAYS, "ml", picked)), SIZE)
      const paints = captured(renderChartSvg(scene, { ariaLabel: "Bottles" }), /\s(?:fill|stroke)="([^"]*)"/gu)
      expect(paints.filter((paint) => !THEME_PAINT.test(paint))).toEqual([])
    }
  })

  it("starts every chart's plot at the same x, however wide its y labels are", () => {
    const scenes = TRENDS_METRICS.map((metric) =>
      createChartScene(barChartDefinition(barChartModel(metric, DAYS, "ml", null)), SIZE),
    )
    expect(new Set(scenes.map(widestYLabel)).size).toBeGreaterThan(1)
    expect(scenes.map(({ chart }) => chart.x)).toEqual(scenes.map(() => PLOT_LEFT_MARGIN))
  })
})

const DAY = zonedDayBounds("2026-10-09", ZONE)
const at = (time: string) => Date.parse(`2026-10-09T${time}:00-07:00`)
const FED = [nursedFor(feedAt(at("01:05")), "left", 14), nursedFor(feedAt(at("05:00")), "right", 20)]
const RUNNING = runningTotals(DAY, FED, [diaperAt(at("02:10"))], at("09:30"))

const runningInput = (
  usual: Parameters<typeof runningChartModel>[2]["usual"],
  status: DayStatus = "today",
  running = RUNNING,
) => ({
  running,
  status,
  usual,
  bounds: DAY,
  ticks: dayTicks("2026-10-09", DAY, ZONE),
  tickLabel: hourLabel(ZONE, LOCALE),
})

const USUAL = { days: 6, totals: { ...MONDAY, nursingSeconds: 5940 } }
const NOTHING_LOGGED = runningTotals(DAY, [], [], DAY.end)

describe("runningChartDefinition", () => {
  it("climbs in minutes for nursing, up to now", () => {
    const model = runningChartModel(NURSING, "ml", runningInput(undefined))
    expect(model.points.at(-1)).toEqual({ at: at("09:30"), value: 34 })
    expect(model.usual).toBeNull()
  })

  it("draws her usual day as a dashed line, and takes no focus", () => {
    const model = runningChartModel(NURSING, "ml", runningInput(USUAL))
    const scene = createChartScene(runningChartDefinition(model), SIZE)
    const svg = renderChartSvg(scene, { ariaLabel: "Nursing through the day" })
    expect(model.usual).toBe(99)
    expect(scene.points).toEqual([])
    expect(captured(svg, /data-ts-key="(usual)[^"]*"[^>]*stroke-dasharray="([^"]+)"/gu)).toEqual(["usual:4 4"])
  })

  it("draws no line through a finished day with nothing logged, but keeps her usual day", () => {
    const model = runningChartModel(BOTTLES, "ml", runningInput(USUAL, "no-entries", NOTHING_LOGGED))
    const svg = renderChartSvg(createChartScene(runningChartDefinition(model), SIZE), { ariaLabel: "Bottles" })
    expect(model.points).toEqual([])
    expect(svg).not.toContain('data-ts-key="so-far')
    expect(captured(svg, /data-ts-key="(usual)[^"]*"[^>]*stroke-dasharray="([^"]+)"/gu)).toEqual(["usual:4 4"])
  })

  it("still draws today's line along zero up to now before anything is logged", () => {
    const sinceMidnight = runningTotals(DAY, [], [], at("09:30"))
    const model = runningChartModel(BOTTLES, "ml", runningInput(null, "today", sinceMidnight))
    expect(model.points).toEqual([
      { at: DAY.start, value: 0 },
      { at: at("09:30"), value: 0 },
    ])
    const svg = renderChartSvg(createChartScene(runningChartDefinition(model), SIZE), { ariaLabel: "Bottles" })
    expect(svg).toContain('data-ts-key="so-far')
  })

  it("describes only the lines it draws", () => {
    const described = [
      runningInput(USUAL),
      runningInput(null),
      runningInput(USUAL, "no-entries", NOTHING_LOGGED),
      runningInput(null, "no-entries", NOTHING_LOGGED),
    ].map((input) => runningChartDescription(runningChartModel(BOTTLES, "ml", input)))
    expect(described).toEqual([
      "A line that climbs through the day, and a dashed line at her usual day.",
      "A line that climbs through the day.",
      "Only a dashed line at her usual day, as nothing was logged.",
      "No line, as nothing was logged.",
    ])
  })

  it("leaves the dashed line out while she has no usual day", () => {
    const svg = renderChartSvg(
      createChartScene(runningChartDefinition(runningChartModel(FEEDS, "ml", runningInput(null))), SIZE),
      {
        ariaLabel: "Feeds started through the day",
      },
    )
    expect(svg).not.toContain('data-ts-key="usual')
  })

  it("ticks the day at 12 AM, 6 AM, 12 PM, 6 PM and the next 12 AM", () => {
    const scene = createChartScene(runningChartDefinition(runningChartModel(DIAPERS, "ml", runningInput(null))), SIZE)
    expect(scene.scales["x"]?.ticks?.map(({ label }) => label)).toEqual(["12 AM", "6 AM", "12 PM", "6 PM", "12 AM"])
  })

  it("draws the climbing line without asking for a key, even where steps repeat a time", () => {
    const model = runningChartModel(FEEDS, "ml", runningInput(null))
    expect(new Set(model.points.map((point) => point.at)).size).toBeLessThan(model.points.length)
    const warn = vi.spyOn(console, "warn")
    try {
      createChartScene(runningChartDefinition(model), SIZE)
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it("starts every running chart's plot at the same x, however wide its y labels are", () => {
    const scenes = TRENDS_METRICS.map((metric) =>
      createChartScene(runningChartDefinition(runningChartModel(metric, "ml", runningInput(null))), SIZE),
    )
    expect(new Set(scenes.map(widestYLabel)).size).toBeGreaterThan(1)
    expect(scenes.map(({ chart }) => chart.x)).toEqual(scenes.map(() => PLOT_LEFT_MARGIN))
  })
})
