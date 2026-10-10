import {
  type Changed,
  type Child,
  ChildConflict,
  type ChildEdit,
  type Household,
  HouseholdConflict,
  type HouseholdEdit,
  type Me,
  queryKeys,
  type SavedChild,
  type SavedHousehold,
  type Units,
} from "@bt/contracts"
import type { QueryClient } from "@tanstack/react-query"
import type { HouseholdApi } from "./client.ts"

export interface HouseholdChange {
  readonly timeZone?: string
  readonly units?: Partial<Units>
}

export const householdEdit = (household: Household, change: HouseholdChange): HouseholdEdit => ({
  actionId: crypto.randomUUID(),
  version: household.version,
  timeZone: change.timeZone ?? household.timeZone,
  units: { ...household.units, ...change.units },
})

export const saveHousehold = async (
  api: HouseholdApi,
  household: Household,
  change: HouseholdChange,
): Promise<SavedHousehold> => {
  const send = (latest: Household) =>
    api.request((client) => client.household.editHousehold({ payload: householdEdit(latest, change) }))
  try {
    return await send(household)
  } catch (error) {
    if (error instanceof HouseholdConflict && error.code === "STALE_VERSION") return send(error.current)
    throw error
  }
}

export const rememberSaved = (queryClient: QueryClient, update: (me: Me) => Me, changed: Changed) => {
  queryClient.setQueryData<Me>(queryKeys.me, (me) => (me === undefined ? me : update(me)))
  for (const queryKey of changed) {
    if (queryKey[0] !== queryKeys.me[0]) void queryClient.invalidateQueries({ queryKey })
  }
}

export type ChildFields = Pick<Child, "name" | "birthDate" | "sex" | "gestationalAgeDays">

export const childEdit = (latest: Child, shown: Child, fields: ChildFields): ChildEdit => ({
  actionId: crypto.randomUUID(),
  version: latest.version,
  name: fields.name === shown.name ? latest.name : fields.name,
  birthDate: fields.birthDate === shown.birthDate ? latest.birthDate : fields.birthDate,
  sex: fields.sex === shown.sex ? latest.sex : fields.sex,
  gestationalAgeDays:
    fields.gestationalAgeDays === shown.gestationalAgeDays ? latest.gestationalAgeDays : fields.gestationalAgeDays,
})

export const saveChild = async (api: HouseholdApi, shown: Child, fields: ChildFields): Promise<SavedChild> => {
  const send = (latest: Child) =>
    api.request((client) => client.child.editChild({ payload: childEdit(latest, shown, fields) }))
  try {
    return await send(shown)
  } catch (error) {
    if (error instanceof ChildConflict && error.code === "STALE_VERSION") return send(error.current)
    throw error
  }
}
