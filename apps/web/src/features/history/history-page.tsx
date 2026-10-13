import type { Me } from "@bt/contracts"
import { localDateOf } from "@bt/domain"
import { getRouteApi } from "@tanstack/react-router"
import { useDay, useMe } from "../../api/hooks.ts"
import { retryOf } from "../../api/retry.ts"
import { NotLoaded } from "../../shell/not-loaded.tsx"
import { Page } from "../../shell/page.tsx"
import { useMinute } from "../../timer/use-now.ts"
import { DaySwitcher } from "./day-switcher.tsx"
import { DayView } from "./day-view.tsx"
import { navigationOf, shownDate } from "./history-date.ts"

const route = getRouteApi("/history")

const HistoryDay = ({ me, now }: { readonly me: Me; readonly now: number }) => {
  const { date: asked } = route.useSearch()
  const today = localDateOf(now, me.household.timeZone)
  const date = shownDate(asked, today)
  const dayQuery = useDay(date)
  return (
    <>
      <DaySwitcher navigation={navigationOf(date, today, me.child.birthDate)} />
      {dayQuery.data === undefined ? (
        <NotLoaded failed={dayQuery.isError} message="This day couldn't be loaded." retry={retryOf(dayQuery)} />
      ) : (
        <DayView key={date} day={dayQuery.data} me={me} now={now} />
      )}
    </>
  )
}

export const HistoryPage = () => {
  const meQuery = useMe()
  const now = useMinute()
  const { data: me } = meQuery
  return (
    <Page title="History" subtitle={me?.child.name}>
      {me === undefined ? (
        <NotLoaded failed={meQuery.isError} message="History couldn't be loaded." retry={retryOf(meQuery)} />
      ) : (
        <HistoryDay me={me} now={now} />
      )}
    </Page>
  )
}
