import type { Me, Today, Totals } from "@bt/contracts"
import { useLast24h, useMe, useToday } from "../../api/hooks.ts"
import { Page } from "../../shell/page.tsx"
import { useNow } from "../../timer/use-now.ts"
import { displayOf } from "./display.ts"
import { FeedCard } from "./feed-card.tsx"
import { TotalsCard } from "./totals-card.tsx"

interface TodayCardsProps {
  readonly today: Today
  readonly last24h: Totals | undefined
  readonly last24hFailed: boolean
  readonly household: Me["household"]
}

const TodayCards = ({ today, last24h, last24hFailed, household }: TodayCardsProps) => {
  const now = useNow()
  const display = displayOf(household)
  return (
    <>
      <FeedCard today={today} display={display} now={now} />
      <TotalsCard today={today.totals} last24h={last24h} last24hFailed={last24hFailed} volume={display.volume} />
    </>
  )
}

export const TodayPage = () => {
  const { data: me } = useMe()
  const { data: today, isError } = useToday()
  const { data: last24h, isError: last24hFailed } = useLast24h()
  return (
    <Page title="Today" subtitle={me?.child.name}>
      {today === undefined || me === undefined ? (
        <output className="text-muted-foreground">{isError ? "Today couldn't be loaded." : "Loading…"}</output>
      ) : (
        <TodayCards today={today} last24h={last24h?.totals} last24hFailed={last24hFailed} household={me.household} />
      )}
    </Page>
  )
}
