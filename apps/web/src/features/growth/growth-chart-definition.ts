import { defineChart, dot, lineY, text } from "@tanstack/charts"
import { decorative } from "@tanstack/charts/mark/decorative"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { tooltip } from "@tanstack/charts/tooltip"
import { type AgeWindow, type Curve, curveEnds, type GrowthRow, monthTicks } from "./chart-model.ts"

const CURVE_PAINT = "var(--muted-foreground)"
const ACCENT = "var(--primary)"
const SURFACE = "var(--background)"

const tickNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

export interface PlottedRow {
  readonly id: string
  readonly months: number
  readonly value: number
  readonly row: GrowthRow
}

export interface GrowthChartModel {
  readonly ageWindow: AgeWindow
  readonly axisLabel: string
  readonly curves: ReadonlyArray<Curve>
  readonly plotted: ReadonlyArray<PlottedRow>
}

export const plottedRows = (rows: ReadonlyArray<GrowthRow>): ReadonlyArray<PlottedRow> =>
  rows
    .flatMap((row) => (row.point === null ? [] : [{ id: row.id, ...row.point, row }]))
    .toSorted((a, b) => a.months - b.months)

export const pointSummary = ({ measuredOn, age, value, percentile }: GrowthRow) =>
  [measuredOn, age, value, percentile].join(" · ")

const CURVES_NAMED = "WHO's 3rd, 15th, 50th, 85th and 97th percentile curves"

export const chartDescription = (count: number) =>
  `${count} ${count === 1 ? "measurement" : "measurements"} over ${CURVES_NAMED}.`

const curveMark = ({ percentile, points }: Curve) => {
  const median = percentile === 50
  return decorative(
    lineY(points, {
      id: `curve-${percentile}`,
      x: "months",
      y: "value",
      stroke: CURVE_PAINT,
      strokeWidth: median ? 1.5 : 1,
      strokeOpacity: median ? 0.9 : 0.7,
    }),
  )
}

export const growthChartDefinition = ({ ageWindow, axisLabel, curves, plotted }: GrowthChartModel) =>
  defineChart({
    marks: [
      ...curves.map(curveMark),
      decorative(
        text(curveEnds(curves), {
          id: "curve-labels",
          x: "months",
          y: "value",
          text: "label",
          anchor: "start",
          dx: 6,
          fill: CURVE_PAINT,
          fontSize: 11,
        }),
      ),
      decorative(lineY(plotted, { id: "her-line", x: "months", y: "value", stroke: ACCENT, strokeWidth: 2 })),
      dot(plotted, {
        id: "her-points",
        x: "months",
        y: "value",
        key: "id",
        r: 4,
        fill: ACCENT,
        stroke: SURFACE,
        strokeWidth: 2,
      }),
    ],
    scales: {
      x: {
        scale: scaleLinear().domain([0, ageWindow.months]),
        grid: true,
        axis: { label: "Age (months)", ticks: { values: [...monthTicks(ageWindow)], format: (month) => `${month}` } },
      },
      y: {
        scale: scaleLinear,
        nice: 10,
        grid: true,
        axis: { label: axisLabel, ticks: { format: (value) => tickNumber.format(value) } },
      },
    },
    focusRing: { radius: 7, fill: "none", stroke: ACCENT, strokeWidth: 2 },
    tooltip: {
      use: tooltip,
      format: (point) => pointSummary(point.datum.row),
      placement: ["top", "bottom"],
      offset: 12,
    },
  })
