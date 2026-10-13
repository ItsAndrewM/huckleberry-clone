import type { DayPeriod, LocalDate, Me } from "@bt/contracts"
import { type DayAverage, runningTotals, totalsIn } from "@bt/domain"
import { dayTicks, hourLabel } from "./day-ticks.ts"
import { HistoryLink } from "./history-link-view.tsx"
import { MetricSection } from "./metric-section.tsx"
import { TRENDS_METRICS } from "./metrics.ts"
import { runningChartModel } from "./running-chart-definition.ts"
import { RunningChart } from "./running-chart.tsx"
import { dayNumbers, trendDays, usualText } from "./trends-numbers.ts"

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
  const totals = totalsIn(day.bounds, day.feeds, day.diapers, now)
  const [shown] = trendDays([{ date: day.date, totals }], today, me.child.birthDate)
  const input = {
    running: runningTotals(day.bounds, day.feeds, day.diapers, now),
    usual,
    bounds: day.bounds,
    ticks: dayTicks(day.date, day.bounds, zone),
    tickLabel: hourLabel(zone),
  }
  return (
    <>
      <HistoryLink date={day.date} today={today} />
      {shown === undefined
        ? null
        : TRENDS_METRICS.map((metric) => (
            <MetricSection
              key={metric.id}
              metric={metric}
              numbers={dayNumbers(metric, shown, volume)}
              note={usualText(metric, usual, volume)}
            >
              <RunningChart
                model={runningChartModel(metric, volume, input)}
                label={`${metric.title} through the day`}
              />
            </MetricSection>
          ))}
    </>
  )
}
