import type { DayTotals, LocalDate, Me } from "@bt/contracts"
import { averageDay } from "@bt/domain"
import { useMemo, useRef } from "react"
import { BarChart } from "./bar-chart.tsx"
import { MetricSection } from "./metric-section.tsx"
import { TRENDS_METRICS } from "./metrics.ts"
import { PickedDay } from "./picked-day.tsx"
import { averageNumbers, dayNumbers, trendDays } from "./trends-numbers.ts"
import { TrendsTable } from "./trends-table.tsx"

interface PeriodViewProps {
  readonly days: ReadonlyArray<DayTotals>
  readonly me: Me
  readonly today: LocalDate
  readonly picked: LocalDate | null
  readonly onPick: (date: LocalDate | null) => void
}

export const PeriodView = ({ days, me, today, picked, onPick }: PeriodViewProps) => {
  const { birthDate } = me.child
  const { volume } = me.household.units
  const trend = useMemo(() => trendDays(days, today, birthDate), [days, today, birthDate])
  const average = averageDay(days, today, birthDate)
  const isCurrent = trend.some(({ status }) => status === "today")
  const pickedDay = trend.find(({ date }) => date === picked)
  const charts = useRef<HTMLDivElement>(null)
  const backToAverages = () => {
    charts.current?.querySelector<SVGElement>("svg[tabindex]")?.focus()
    onPick(null)
  }
  return (
    <>
      <PickedDay date={pickedDay?.date ?? null} today={today} onClear={backToAverages} />
      <div ref={charts} className="contents">
        {TRENDS_METRICS.map((metric) => (
          <MetricSection
            key={metric.id}
            metric={metric}
            numbers={
              pickedDay === undefined
                ? averageNumbers(metric, average, volume, isCurrent)
                : dayNumbers(metric, pickedDay, volume)
            }
          >
            <BarChart
              metric={metric}
              days={trend}
              volume={volume}
              picked={picked}
              onPick={(date) => onPick(date === picked ? null : date)}
            />
          </MetricSection>
        ))}
      </div>
      <TrendsTable days={trend} volume={volume} today={today} />
    </>
  )
}
