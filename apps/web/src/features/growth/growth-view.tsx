import type { Measurement, Me } from "@bt/contracts"
import { useState } from "react"
import { GrowthFigure } from "./growth-figure.tsx"
import { GrowthTable } from "./growth-table.tsx"
import { LatestTiles } from "./latest-tiles.tsx"
import { MeasurementCards } from "./measurement-cards.tsx"
import { GROWTH_METRICS, type GrowthMetricInfo } from "./metrics.ts"
import { useGrowthView } from "./use-growth-view.ts"

interface GrowthViewProps {
  readonly me: Me
  readonly measurements: ReadonlyArray<Measurement>
}

export const GrowthView = ({ me, measurements }: GrowthViewProps) => {
  const [info, setInfo] = useState<GrowthMetricInfo>(GROWTH_METRICS[0])
  const { rows, chart, tiles, cards } = useGrowthView(me, measurements, info)
  return (
    <>
      <LatestTiles tiles={tiles} info={info} onChange={setInfo} />
      <GrowthFigure info={info} chart={chart} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{`No ${info.name.toLowerCase()} measurements yet`}</p>
      ) : (
        <GrowthTable info={info} rows={rows} />
      )}
      {cards.length === 0 ? null : <MeasurementCards cards={cards} />}
    </>
  )
}
