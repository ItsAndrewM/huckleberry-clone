import type { LocalDate, Me } from "@bt/contracts"
import { localDateOf } from "@bt/domain"
import { getRouteApi } from "@tanstack/react-router"
import { useState } from "react"
import { useMe } from "../../api/hooks.ts"
import { retryOf } from "../../api/retry.ts"
import { NotLoaded } from "../../shell/not-loaded.tsx"
import { Page } from "../../shell/page.tsx"
import { useMinute } from "../../timer/use-now.ts"
import { DayTrends } from "./day-trends.tsx"
import { PeriodSwitcher } from "./period-switcher.tsx"
import { PeriodTrends } from "./period-trends.tsx"
import { periodId } from "./trends-period.ts"
import { navigationOf, shownPeriod } from "./trends-search.ts"
import { ViewSwitch } from "./view-switch.tsx"

const route = getRouteApi("/trends")

interface Picked {
  readonly period: string
  readonly date: LocalDate
}

const TrendsBody = ({ me, now }: { readonly me: Me; readonly now: number }) => {
  const search = route.useSearch()
  const [pick, setPick] = useState<Picked | null>(null)
  const today = localDateOf(now, me.household.timeZone)
  const period = shownPeriod(search, today, me.child.birthDate)
  const id = periodId(period)
  if (pick !== null && pick.period !== id) setPick(null)
  const picked = pick?.date ?? null
  return (
    <>
      <ViewSwitch period={period} today={today} birthDate={me.child.birthDate} picked={picked} />
      <PeriodSwitcher navigation={navigationOf(period, today, me.child.birthDate)} />
      {period.view === "day" ? (
        <DayTrends key={id} date={period.date} me={me} now={now} today={today} />
      ) : (
        <PeriodTrends
          key={id}
          period={period}
          me={me}
          today={today}
          picked={picked}
          onPick={(date) => setPick(date === null ? null : { period: id, date })}
        />
      )}
    </>
  )
}

export const TrendsPage = () => {
  const meQuery = useMe()
  const now = useMinute()
  const { data: me } = meQuery
  return (
    <Page title="Trends" subtitle={me?.child.name}>
      {me === undefined ? (
        <NotLoaded failed={meQuery.isError} message="Trends couldn't be loaded." retry={retryOf(meQuery)} />
      ) : (
        <TrendsBody me={me} now={now} />
      )}
    </Page>
  )
}
