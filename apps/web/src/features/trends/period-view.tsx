import type { DayTotals, LocalDate, Me } from "@bt/contracts"
import { averageDay } from "@bt/domain"
import { BarChart } from "./bar-chart.tsx"
import { MetricSection } from "./metric-section.tsx"
import { TRENDS_METRICS } from "./metrics.ts"
import { averageNumbers, trendDays } from "./trends-numbers.ts"
import { TrendsTable } from "./trends-table.tsx"

interface PeriodViewProps {
  readonly days: ReadonlyArray<DayTotals>
  readonly me: Me
  readonly today: LocalDate
}

export const PeriodView = ({ days, me, today }: PeriodViewProps) => {
  const { birthDate } = me.child
  const { volume } = me.household.units
  const trend = trendDays(days, today, birthDate)
  const average = averageDay(days, today, birthDate)
  const isCurrent = trend.some(({ status }) => status === "today")
  return (
    <>
      {TRENDS_METRICS.map((metric) => (
        <MetricSection key={metric.id} metric={metric} numbers={averageNumbers(metric, average, volume, isCurrent)}>
          <BarChart metric={metric} days={trend} volume={volume} />
        </MetricSection>
      ))}
      <TrendsTable days={trend} volume={volume} />
    </>
  )
}
