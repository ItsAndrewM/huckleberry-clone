import { useMe, useToday } from "../../api/hooks.ts"
import { DrawerDescription } from "../../components/ui/drawer.tsx"
import { clockOf } from "../../sheets/clock.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { BottleForm } from "./bottle-form.tsx"

const BottleContent = () => {
  const { data: me } = useMe()
  const { data: today } = useToday()
  if (me === undefined) return null
  const zone = me.household.timeZone
  const active = today?.activeFeed ?? null
  return (
    <>
      {active === null ? null : (
        <DrawerDescription className="-mt-3">
          Adds to the feed that started at {clockOf(active.startedAt, zone)}.
        </DrawerDescription>
      )}
      <BottleForm prefill={today?.prefill} active={active} unit={me.household.units.volume} zone={zone} />
    </>
  )
}

export const BottleSheet = () => (
  <Sheet sheet="bottle" title="Bottle">
    <BottleContent />
  </Sheet>
)
