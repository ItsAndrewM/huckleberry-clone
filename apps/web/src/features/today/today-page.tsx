import type { Me, Today } from "@bt/contracts"
import { useMe, useToday } from "../../api/hooks.ts"
import { Page } from "../../shell/page.tsx"
import { useNow } from "../../timer/use-now.ts"
import { displayOf } from "./display.ts"
import { FeedCard } from "./feed-card.tsx"

interface TodayCardsProps {
  readonly today: Today
  readonly household: Me["household"]
}

const TodayCards = ({ today, household }: TodayCardsProps) => {
  const now = useNow()
  return <FeedCard today={today} display={displayOf(household)} now={now} />
}

export const TodayPage = () => {
  const { data: me } = useMe()
  const { data: today, isError } = useToday()
  return (
    <Page title="Today" subtitle={me?.child.name}>
      {today === undefined || me === undefined ? (
        <output className="text-muted-foreground">{isError ? "Today couldn't be loaded." : "Loading…"}</output>
      ) : (
        <TodayCards today={today} household={me.household} />
      )}
    </Page>
  )
}
