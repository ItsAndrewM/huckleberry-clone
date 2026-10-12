import type { VolumeUnit } from "@bt/contracts"
import type { DayAverage, Interval, RunningPoint, RunningTotals } from "@bt/domain"
import { defineChart, lineY, ruleY } from "@tanstack/charts"
import { decorative } from "@tanstack/charts/mark/decorative"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import type { TrendsMetric } from "./metrics.ts"
import { PLOT_LEFT_MARGIN } from "./plot-margin.ts"

export interface RunningChartModel {
  readonly bounds: Interval
  readonly points: ReadonlyArray<RunningPoint>
  readonly usual: number | null
  readonly ticks: ReadonlyArray<number>
  readonly tickLabel: (at: number) => string
  readonly top: number
}

const ACCENT = "var(--primary)"
const MUTED = "var(--muted-foreground)"

const axisNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

export interface RunningInput {
  readonly running: RunningTotals
  readonly usual: DayAverage | null | undefined
  readonly bounds: Interval
  readonly ticks: ReadonlyArray<number>
  readonly tickLabel: (at: number) => string
}

export const runningChartModel = (metric: TrendsMetric, volume: VolumeUnit, input: RunningInput): RunningChartModel => {
  const points = metric.running(input.running).map(({ at, value }) => ({ at, value: metric.plotted(value, volume) }))
  const average = input.usual ?? null
  const usual = average === null ? null : metric.plotted(metric.total(average.totals), volume)
  return {
    bounds: input.bounds,
    points,
    usual,
    ticks: input.ticks,
    tickLabel: input.tickLabel,
    top: Math.max(points.at(-1)?.value ?? 0, usual ?? 0, metric.axisFloor(volume)),
  }
}

export const runningChartDefinition = ({ bounds, points, usual, ticks, tickLabel, top }: RunningChartModel) =>
  defineChart({
    marks: [
      ...(usual === null
        ? []
        : [decorative(ruleY([usual], { id: "usual", stroke: MUTED, strokeWidth: 1.5, strokeDasharray: "4 4" }))]),
      decorative(
        lineY(points, {
          id: "so-far",
          x: "at",
          y: "value",
          key: (_point, { index }) => index,
          stroke: ACCENT,
          strokeWidth: 2,
        }),
      ),
    ],
    margin: { left: PLOT_LEFT_MARGIN },
    scales: {
      x: {
        scale: scaleLinear().domain([bounds.start, bounds.end]),
        axis: { ticks: { values: [...ticks], size: 0, format: tickLabel } },
      },
      y: {
        scale: scaleLinear().domain([0, top]),
        nice: true,
        grid: true,
        axis: { line: false, ticks: { count: 3, size: 0, format: (value) => axisNumber.format(value) } },
      },
    },
    keyboard: false,
  })
