import type { LocalDate, VolumeUnit } from "@bt/contracts"
import { Chart } from "@tanstack/charts/react"
import { useMemo, useState } from "react"
import { barChartDefinition, barChartModel } from "./bar-chart-definition.ts"
import { chartName } from "./chart-name.ts"
import type { TrendsMetric } from "./metrics.ts"
import { barAnnouncement, type TrendDay } from "./trends-numbers.ts"

const CHART_HEIGHT = 150

interface BarChartProps {
  readonly metric: TrendsMetric
  readonly days: ReadonlyArray<TrendDay>
  readonly volume: VolumeUnit
  readonly picked: LocalDate | null
  readonly onPick: (date: LocalDate) => void
}

export const BarChart = ({ metric, days, volume, picked, onPick }: BarChartProps) => {
  const [focused, setFocused] = useState<LocalDate | null>(null)
  const definition = useMemo(
    () => barChartDefinition(barChartModel(metric, days, volume, picked)),
    [metric, days, volume, picked],
  )
  const focusedDay = days.find(({ date }) => date === focused)
  return (
    <>
      <Chart
        definition={definition}
        height={CHART_HEIGHT}
        ariaLabel={chartName(metric, volume, "each day")}
        ariaDescription="Pick a day to see its numbers. Show as a table lists every day."
        className="[&_svg:focus:not(:focus-visible)]:outline-none"
        onFocusChange={(point) => setFocused(point === null ? null : point.datum.date)}
        onSelect={(point) => {
          if (point !== null) onPick(point.datum.date)
        }}
      />
      <output className="sr-only">{focusedDay === undefined ? "" : barAnnouncement(metric, focusedDay, volume)}</output>
    </>
  )
}
