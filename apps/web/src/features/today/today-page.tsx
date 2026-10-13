import type { Me, Today } from "@bt/contracts"
import { useLast24h, useMe, useToday } from "../../api/hooks.ts"
import { retryOf } from "../../api/retry.ts"
import { useSheets } from "../../sheets/sheets-context.ts"
import { NotLoaded } from "../../shell/not-loaded.tsx"
import { Page } from "../../shell/page.tsx"
import { useNow } from "../../timer/use-now.ts"
import { displayOf } from "./display.ts"
import { FeedCard } from "./feed-card.tsx"
import { QuickActions } from "./quick-actions.tsx"
import { RecentList } from "./recent-list.tsx"
import { recentRows } from "./recent-rows.ts"
import { SleepCard } from "./sleep-card.tsx"
import { type Last24h, TotalsCard } from "./totals-card.tsx"

interface TodayCardsProps {
  readonly today: Today
  readonly last24h: Last24h
  readonly household: Me["household"]
}

const TodayCards = ({ today, last24h, household }: TodayCardsProps) => {
  const sheets = useSheets()
  const now = useNow()
  const display = displayOf(household)
  return (
    <>
      <FeedCard today={today} display={display} now={now} />
      <SleepCard today={today} display={display} now={now} />
      <TotalsCard today={today.totals} last24h={last24h} volume={display.volume} />
      <RecentList
        rows={recentRows(today.recent, display, now)}
        onOpen={({ opens, id }) => opens !== null && sheets.show(opens, id)}
      />
    </>
  )
}

export const TodayPage = () => {
  const meQuery = useMe()
  const todayQuery = useToday()
  const last24hQuery = useLast24h()
  const { data: me } = meQuery
  const { data: today } = todayQuery
  const last24h = { totals: last24hQuery.data?.totals, failed: last24hQuery.isError, retry: retryOf(last24hQuery) }
  return (
    <div className="pb-16">
      <Page title="Today" subtitle={me?.child.name}>
        {today === undefined || me === undefined ? (
          <NotLoaded
            failed={todayQuery.isError || meQuery.isError}
            message="Today couldn't be loaded."
            retry={retryOf(meQuery, todayQuery)}
          />
        ) : (
          <TodayCards today={today} last24h={last24h} household={me.household} />
        )}
      </Page>
      <QuickActions />
    </div>
  )
}
