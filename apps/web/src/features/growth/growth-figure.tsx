import type { GrowthChartModel } from "./growth-chart-definition.ts"
import { GrowthChart } from "./growth-chart.tsx"
import type { GrowthMetricInfo } from "./metrics.ts"

interface GrowthFigureProps {
  readonly info: GrowthMetricInfo
  readonly chart: GrowthChartModel | null
}

export const GrowthFigure = ({ info, chart }: GrowthFigureProps) => {
  const standard = `${info.indicator}, girls`
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-col gap-0.5">
        <h2 className="font-medium">WHO Child Growth Standards</h2>
        <p className="text-sm text-muted-foreground">{standard}</p>
      </figcaption>
      {chart === null ? (
        <p className="text-sm text-muted-foreground">
          WHO's curves here are for girls, so there are no curves or percentiles to show.
        </p>
      ) : (
        <GrowthChart model={chart} standard={standard} />
      )}
    </figure>
  )
}
