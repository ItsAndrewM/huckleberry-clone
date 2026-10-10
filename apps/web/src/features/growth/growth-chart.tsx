import { Chart } from "@tanstack/charts/react/tooltip"
import { useMemo } from "react"
import { type GrowthChartModel, growthChartDefinition } from "./growth-chart-definition.ts"
import { MeasurementTooltip } from "./measurement-tooltip.tsx"

const CHART_HEIGHT = 320

interface GrowthChartProps {
  readonly model: GrowthChartModel
  readonly standard: string
}

export const GrowthChart = ({ model, standard }: GrowthChartProps) => {
  const definition = useMemo(() => growthChartDefinition(model), [model])
  return (
    <Chart
      definition={definition}
      height={CHART_HEIGHT}
      ariaLabel={`${standard}, birth to ${model.ageWindow.months} months`}
      ariaDescription={`${model.plotted.length} measurements over WHO's 3rd, 15th, 50th, 85th and 97th percentile curves.`}
      className="[&_svg:focus:not(:focus-visible)]:outline-none"
      renderTooltipBody={({ primaryPoint }) =>
        primaryPoint === undefined ? null : <MeasurementTooltip row={primaryPoint.datum.row} />
      }
    />
  )
}
