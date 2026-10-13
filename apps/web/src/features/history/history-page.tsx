import type { LocalDate, Me } from "@bt/contracts"
import { localDateOf } from "@bt/domain"
import { getRouteApi } from "@tanstack/react-router"
import { useDay, useMe } from "../../api/hooks.ts"
import { retryOf } from "../../api/retry.ts"
import { NotLoaded } from "../../shell/not-loaded.tsx"
import { Page } from "../../shell/page.tsx"
import { useMinute } from "../../timer/use-now.ts"
import { DayView } from "./day-view.tsx"
import { hiddenIn } from "./history-kinds.ts"
import { navigationOf, shownPeriod } from "./history-navigation.ts"
import { periodKey } from "./history-period.ts"
import { HistorySwitcher } from "./history-switcher.tsx"
import { HistoryViewSwitch } from "./history-view-switch.tsx"
import { WeekView } from "./week-view.tsx"

const route = getRouteApi("/history")

interface HistoryDayProps {
  readonly date: LocalDate
  readonly me: Me
  readonly now: number
}

const HistoryDay = ({ date, me, now }: HistoryDayProps) => {
  const dayQuery = useDay(date)
  return dayQuery.data === undefined ? (
    <NotLoaded failed={dayQuery.isError} message="This day couldn't be loaded." retry={retryOf(dayQuery)} />
  ) : (
    <DayView key={date} day={dayQuery.data} me={me} now={now} />
  )
}

const HistoryScreen = ({ me, now }: { readonly me: Me; readonly now: number }) => {
  const search = route.useSearch()
  const today = localDateOf(now, me.household.timeZone)
  const period = shownPeriod(search, today, me.child.birthDate)
  const hidden = hiddenIn(search.hide)
  return (
    <Page
      title="History"
      subtitle={me.child.name}
      action={<HistoryViewSwitch period={period} today={today} birthDate={me.child.birthDate} hidden={hidden} />}
    >
      <HistorySwitcher key={periodKey(period)} navigation={navigationOf(period, today, me.child.birthDate, hidden)} />
      {period.view === "day" ? (
        <HistoryDay date={period.date} me={me} now={now} />
      ) : (
        <WeekView key={period.week} week={period.week} me={me} now={now} today={today} hidden={hidden} />
      )}
    </Page>
  )
}

export const HistoryPage = () => {
  const meQuery = useMe()
  const now = useMinute()
  const { data: me } = meQuery
  return me === undefined ? (
    <Page title="History">
      <NotLoaded failed={meQuery.isError} message="History couldn't be loaded." retry={retryOf(meQuery)} />
    </Page>
  ) : (
    <HistoryScreen me={me} now={now} />
  )
}
