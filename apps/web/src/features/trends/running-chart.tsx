import { Chart } from "@tanstack/charts/react"
import { useMemo } from "react"
import { type RunningChartModel, runningChartDefinition } from "./running-chart-definition.ts"

const CHART_HEIGHT = 150

interface RunningChartProps {
  readonly model: RunningChartModel
  readonly label: string
}

export const RunningChart = ({ model, label }: RunningChartProps) => {
  const definition = useMemo(() => runningChartDefinition(model), [model])
  return (
    <Chart
      definition={definition}
      height={CHART_HEIGHT}
      ariaLabel={label}
      ariaDescription={
        model.usual === null
          ? "A line that climbs through the day."
          : "A line that climbs through the day, and a dashed line at her usual day."
      }
    />
  )
}
