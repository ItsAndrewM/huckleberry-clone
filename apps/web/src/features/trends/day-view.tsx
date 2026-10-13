import type { DayPeriod, LocalDate, Me } from "@bt/contracts"
import { type DayAverage, runningTotals, totalsIn } from "@bt/domain"
import { useMemo } from "react"
import { chartName } from "./chart-name.ts"
import { dayTicks, hourLabel } from "./day-ticks.ts"
import { HistoryLink } from "./history-link-view.tsx"
import { MetricSection } from "./metric-section.tsx"
import { TRENDS_METRICS } from "./metrics.ts"
import { runningChartModel } from "./running-chart-definition.ts"
import { RunningChart } from "./running-chart.tsx"
import { dayNumbers, trendDay, usualText } from "./trends-numbers.ts"

interface DayViewProps {
  readonly day: DayPeriod
  readonly usual: DayAverage | null | undefined
  readonly me: Me
  readonly now: number
  readonly today: LocalDate
}

export const DayView = ({ day, usual, me, now, today }: DayViewProps) => {
  const zone = me.household.timeZone
  const { volume } = me.household.units
  const { birthDate } = me.child
  const { shown, charts } = useMemo(() => {
    const totals = totalsIn(day.bounds, day, now)
    const trend = trendDay({ date: day.date, totals }, today, birthDate)
    const input = {
      running: runningTotals(day.bounds, day.feeds, day.diapers, now),
      status: trend.status,
      usual,
      bounds: day.bounds,
      ticks: dayTicks(day.date, day.bounds, zone),
      tickLabel: hourLabel(zone),
    }
    const models = TRENDS_METRICS.map((metric) => ({ metric, model: runningChartModel(metric, volume, input) }))
    return { shown: trend, charts: models }
  }, [day, now, today, birthDate, usual, zone, volume])
  return (
    <>
      <HistoryLink date={day.date} today={today} />
      {charts.map(({ metric, model }) => (
        <MetricSection
          key={metric.id}
          metric={metric}
          numbers={dayNumbers(metric, shown, volume)}
          note={usualText(metric, usual, volume)}
        >
          <RunningChart model={model} label={chartName(metric, volume, "through the day")} />
        </MetricSection>
      ))}
    </>
  )
}
