import { useMe } from "../../api/hooks.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { PastFeedForm } from "./past-feed-form.tsx"

const PastFeedContent = () => {
  const { data: me } = useMe()
  if (me === undefined) return null
  return <PastFeedForm unit={me.household.units.volume} zone={me.household.timeZone} />
}

export const PastFeedSheet = () => (
  <Sheet sheet="pastFeed" title="Past feed" description="The sides run one after the other from the start.">
    <PastFeedContent />
  </Sheet>
)
