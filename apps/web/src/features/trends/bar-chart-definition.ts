import type { LocalDate, VolumeUnit } from "@bt/contracts"
import { barY, crosshair, defineChart, dot } from "@tanstack/charts"
import { scaleBand } from "@tanstack/charts/scales/band"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { type BarRow, barRows, type DayTarget, dayTargets, tallestDay } from "./bar-rows.ts"
import type { TrendsMetric } from "./metrics.ts"
import { PLOT_LEFT_MARGIN } from "./plot-margin.ts"
import type { TrendDay } from "./trends-numbers.ts"
import { weekdayOf } from "./trends-titles.ts"

export interface BarChartModel {
  readonly dates: ReadonlyArray<LocalDate>
  readonly ticks: ReadonlyArray<LocalDate>
  readonly tickLabel: (date: LocalDate) => string
  readonly rows: ReadonlyArray<BarRow>
  readonly targets: ReadonlyArray<DayTarget>
  readonly picked: LocalDate | null
  readonly top: number
}

const ACCENT = "var(--primary)"
const MONTH_TICKS = new Set(["01", "08", "15", "22", "29"])
const DAYS_IN_A_WEEK = 7
const HALF_A_WEEKDAY_COLUMN = 24

const axisNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

const dayOfMonth = (date: LocalDate) => String(Number(date.slice(8)))

export const barChartModel = (
  metric: TrendsMetric,
  days: ReadonlyArray<TrendDay>,
  volume: VolumeUnit,
  picked: LocalDate | null,
  locale?: string,
): BarChartModel => {
  const dates = days.map(({ date }) => date)
  const rows = barRows(metric, days, volume, picked)
  const isWeek = dates.length === DAYS_IN_A_WEEK
  return {
    dates,
    ticks: isWeek ? dates : dates.filter((date) => MONTH_TICKS.has(date.slice(8))),
    tickLabel: isWeek ? (date) => weekdayOf(date, locale) : dayOfMonth,
    rows,
    targets: dayTargets(days),
    picked,
    top: Math.max(tallestDay(rows), metric.axisFloor(volume)),
  }
}

export const barChartDefinition = ({ dates, ticks, tickLabel, rows, targets, picked, top }: BarChartModel) =>
  defineChart({
    marks: [
      crosshair({ id: "focused-day", x: { band: { fill: ACCENT, fillOpacity: 0.12, radius: 4 } }, y: false }),
      dot(targets, { id: "day-target", x: "date", y: () => 0, r: 0, key: "date", fill: "none" }),
      barY(rows, {
        id: "days",
        x: "date",
        y: "value",
        key: "key",
        fill: (row) => row.fill,
        stroke: (row) => (row.soFar ? ACCENT : "none"),
        strokeDasharray: (row) => (row.soFar ? "3 2" : "none"),
        radius: { end: 3 },
      }),
    ],
    margin: { left: PLOT_LEFT_MARGIN },
    scales: {
      x: {
        scale: scaleBand<LocalDate>()
          .domain([...dates])
          .padding(0.25),
        axis: {
          ticks: { values: [...ticks], size: 0, format: tickLabel },
          tickLabels: { fontWeight: ({ value }) => (value === picked ? 700 : undefined) },
        },
      },
      y: {
        scale: scaleLinear().domain([0, top]),
        nice: true,
        grid: true,
        axis: { line: false, ticks: { count: 3, size: 0, format: (value) => axisNumber.format(value) } },
      },
    },
    focus: "group-x",
    maxFocusDistance: HALF_A_WEEKDAY_COLUMN,
    focusRing: false,
  })
