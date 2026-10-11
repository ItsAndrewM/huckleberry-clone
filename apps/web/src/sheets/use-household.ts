import { useMe } from "../api/hooks.ts"
import type { Household } from "./failure.ts"

export const useHousehold = (): Household | null => {
  const { data: me } = useMe()
  if (me === undefined) return null
  return { caregivers: me.household.caregivers, timeZone: me.household.timeZone, childName: me.child.name }
}
