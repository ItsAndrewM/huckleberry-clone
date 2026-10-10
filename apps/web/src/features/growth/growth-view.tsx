import type { Measurement, Me } from "@bt/contracts"
import { useState } from "react"
import { GrowthFigure } from "./growth-figure.tsx"
import { MetricSwitch } from "./metric-switch.tsx"
import { GROWTH_METRICS, type GrowthMetricInfo } from "./metrics.ts"
import { useGrowthView } from "./use-growth-view.ts"

interface GrowthViewProps {
  readonly me: Me
  readonly measurements: ReadonlyArray<Measurement>
}

export const GrowthView = ({ me, measurements }: GrowthViewProps) => {
  const [info, setInfo] = useState<GrowthMetricInfo>(GROWTH_METRICS[0])
  const { rows, chart } = useGrowthView(me, measurements, info)
  return (
    <>
      <MetricSwitch info={info} onChange={setInfo} />
      <GrowthFigure info={info} chart={chart} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{`No ${info.name.toLowerCase()} measurements yet`}</p>
      ) : null}
    </>
  )
}
