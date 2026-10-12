import type { VolumeUnit } from "@bt/contracts"
import { Chart } from "@tanstack/charts/react"
import { useMemo } from "react"
import { barChartDefinition, barChartModel } from "./bar-chart-definition.ts"
import type { TrendsMetric } from "./metrics.ts"
import type { TrendDay } from "./trends-numbers.ts"

const CHART_HEIGHT = 150

interface BarChartProps {
  readonly metric: TrendsMetric
  readonly days: ReadonlyArray<TrendDay>
  readonly volume: VolumeUnit
}

export const BarChart = ({ metric, days, volume }: BarChartProps) => {
  const definition = useMemo(
    () => barChartDefinition(barChartModel(metric, days, volume, null)),
    [metric, days, volume],
  )
  return (
    <Chart
      definition={definition}
      height={CHART_HEIGHT}
      ariaLabel={`${metric.title} each day, in ${metric.axis(volume)}`}
      ariaDescription="Show as a table lists every day."
      className="[&_svg:focus:not(:focus-visible)]:outline-none"
    />
  )
}
