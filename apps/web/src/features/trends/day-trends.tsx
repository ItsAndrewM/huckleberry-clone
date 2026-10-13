import type { LocalDate, Me } from "@bt/contracts"
import { useMemo } from "react"
import { useDay, useWeek } from "../../api/hooks.ts"
import { retryOf } from "../../api/retry.ts"
import { NotLoaded } from "../../shell/not-loaded.tsx"
import { DayView } from "./day-view.tsx"
import { usualDay, usualWeeks } from "./usual-day.ts"

interface DayTrendsProps {
  readonly date: LocalDate
  readonly me: Me
  readonly now: number
  readonly today: LocalDate
}

export const DayTrends = ({ date, me, now, today }: DayTrendsProps) => {
  const dayQuery = useDay(date)
  const [earlier, later] = usualWeeks(date)
  const earlierWeek = useWeek(earlier)
  const laterWeek = useWeek(later)
  const { birthDate } = me.child
  const usual = useMemo(
    () => usualDay([earlierWeek.data?.days, laterWeek.data?.days], date, today, birthDate),
    [earlierWeek.data, laterWeek.data, date, today, birthDate],
  )
  const usualFailed = [earlierWeek, laterWeek].some((week) => week.isError && week.data === undefined)
  return dayQuery.data === undefined ? (
    <NotLoaded
      failed={dayQuery.isError}
      message="This day couldn't be loaded."
      retry={retryOf(dayQuery, earlierWeek, laterWeek)}
    />
  ) : (
    <>
      {usualFailed ? (
        <NotLoaded failed message="Her usual day couldn't be loaded." retry={retryOf(earlierWeek, laterWeek)} />
      ) : null}
      <DayView day={dayQuery.data} usual={usual} me={me} now={now} today={today} />
    </>
  )
}
