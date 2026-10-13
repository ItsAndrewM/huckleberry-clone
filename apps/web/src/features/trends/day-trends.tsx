import type { LocalDate, Me } from "@bt/contracts"
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
  const usual = usualDay([earlierWeek.data?.days, laterWeek.data?.days], date, today, me.child.birthDate)
  return dayQuery.data === undefined ? (
    <NotLoaded failed={dayQuery.isError} message="This day couldn't be loaded." retry={retryOf(dayQuery)} />
  ) : (
    <DayView day={dayQuery.data} usual={usual} me={me} now={now} today={today} />
  )
}
