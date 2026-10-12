import type { Me } from "@bt/contracts"
import { localDateOf } from "@bt/domain"
import { getRouteApi } from "@tanstack/react-router"
import { useMe } from "../../api/hooks.ts"
import { retryOf } from "../../api/retry.ts"
import { NotLoaded } from "../../shell/not-loaded.tsx"
import { Page } from "../../shell/page.tsx"
import { useMinute } from "../../timer/use-now.ts"
import { PeriodSwitcher } from "./period-switcher.tsx"
import { PeriodTrends } from "./period-trends.tsx"
import { periodId } from "./trends-period.ts"
import { navigationOf, shownPeriod } from "./trends-search.ts"
import { ViewSwitch } from "./view-switch.tsx"

const route = getRouteApi("/trends")

const TrendsBody = ({ me, now }: { readonly me: Me; readonly now: number }) => {
  const search = route.useSearch()
  const today = localDateOf(now, me.household.timeZone)
  const period = shownPeriod(search, today, me.child.birthDate)
  return (
    <>
      <ViewSwitch period={period} today={today} birthDate={me.child.birthDate} />
      <PeriodSwitcher navigation={navigationOf(period, today, me.child.birthDate)} />
      <PeriodTrends key={periodId(period)} period={period} me={me} today={today} />
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
