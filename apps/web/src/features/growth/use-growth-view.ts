import type { Measurement, Me } from "@bt/contracts"
import { ageInDays, localDateOf } from "@bt/domain"
import { useMemo } from "react"
import { useMinute } from "../../timer/use-now.ts"
import { ageWindowFor, axisLabel, axisUnitOf, curvesFor, growthRows } from "./chart-model.ts"
import { plottedRows } from "./growth-chart-definition.ts"
import type { GrowthMetricInfo } from "./metrics.ts"

export const useGrowthView = (me: Me, measurements: ReadonlyArray<Measurement>, info: GrowthMetricInfo) => {
  const now = useMinute()
  const ageWindow = ageWindowFor(ageInDays(localDateOf(now, me.household.timeZone), me.child.birthDate))
  return useMemo(() => {
    const unit = axisUnitOf(info.metric, me.household.units)
    const rows = growthRows(measurements, info, me)
    const curves = curvesFor(info.metric, me.child.sex, ageWindow, unit)
    const chart =
      curves === "unavailable"
        ? null
        : { ageWindow, axisLabel: axisLabel(info, unit), curves, plotted: plottedRows(rows) }
    return { rows, chart }
  }, [me, measurements, info, ageWindow])
}
