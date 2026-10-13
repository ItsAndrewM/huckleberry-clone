import type { VolumeUnit } from "@bt/contracts"
import type { TrendsMetric } from "./metrics.ts"

export const chartName = (metric: TrendsMetric, volume: VolumeUnit, span: "each day" | "through the day") => {
  const unit = metric.unit(volume)
  return unit === null ? `${metric.title} ${span}` : `${metric.title} ${span}, in ${unit}`
}
