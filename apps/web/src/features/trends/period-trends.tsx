import type { DayTotals, IsoWeek, LocalDate, Me, YearMonth } from "@bt/contracts"
import { useMonth, useWeek } from "../../api/hooks.ts"
import { type Retry, retryOf } from "../../api/retry.ts"
import { NotLoaded } from "../../shell/not-loaded.tsx"
import { PeriodView } from "./period-view.tsx"
import type { TrendsPeriod } from "./trends-period.ts"

interface Shown {
  readonly me: Me
  readonly today: LocalDate
  readonly picked: LocalDate | null
  readonly onPick: (date: LocalDate | null) => void
}

interface LoadedProps extends Shown {
  readonly days: ReadonlyArray<DayTotals> | undefined
  readonly failed: boolean
  readonly retry: Retry
  readonly message: string
}

const Loaded = ({ days, failed, retry, message, ...shown }: LoadedProps) =>
  days === undefined ? (
    <NotLoaded failed={failed} message={message} retry={retry} />
  ) : (
    <PeriodView days={days} {...shown} />
  )

const WeekTrends = ({ week, ...shown }: Shown & { readonly week: IsoWeek }) => {
  const query = useWeek(week)
  return (
    <Loaded
      days={query.data?.days}
      failed={query.isError}
      retry={retryOf(query)}
      message="This week couldn't be loaded."
      {...shown}
    />
  )
}

const MonthTrends = ({ month, ...shown }: Shown & { readonly month: YearMonth }) => {
  const query = useMonth(month)
  return (
    <Loaded
      days={query.data?.days}
      failed={query.isError}
      retry={retryOf(query)}
      message="This month couldn't be loaded."
      {...shown}
    />
  )
}

type WeekOrMonth = Exclude<TrendsPeriod, { readonly view: "day" }>

export const PeriodTrends = ({ period, ...shown }: Shown & { readonly period: WeekOrMonth }) =>
  period.view === "week" ? (
    <WeekTrends week={period.week} {...shown} />
  ) : (
    <MonthTrends month={period.month} {...shown} />
  )
