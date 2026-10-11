import { useMe, useToday } from "../../api/hooks.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { BottleForm } from "./bottle-form.tsx"

const BottleContent = () => {
  const { data: me } = useMe()
  const { data: today } = useToday()
  if (me === undefined || today === undefined) return null
  return (
    <BottleForm
      prefill={today.prefill}
      active={today.activeFeed}
      unit={me.household.units.volume}
      zone={me.household.timeZone}
    />
  )
}

export const BottleSheet = () => (
  <Sheet sheet="bottle" title="Bottle">
    <BottleContent />
  </Sheet>
)
