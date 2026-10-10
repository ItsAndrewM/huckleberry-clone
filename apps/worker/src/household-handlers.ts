import { Api, Child, ChildConflict, ChildEdit, Household, HouseholdConflict, HouseholdEdit } from "@bt/contracts"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { editChild, editHousehold } from "./core/household-edits.ts"
import { mutations, type Saved } from "./mutations.ts"
import type { Broadcast } from "./sockets.ts"

const asSavedHousehold = Effect.map(({ record, changed }: Saved<Household>) => ({ household: record, changed }))

const asSavedChild = Effect.map(({ record, changed }: Saved<Child>) => ({ child: record, changed }))

export const householdHandlers = (storage: DurableObjectStorage, broadcast: Broadcast) => {
  const mutateHousehold = mutations(
    storage,
    broadcast,
    Household,
    (saved) => new HouseholdConflict({ code: "ACTION_REPLAY_MISMATCH", current: saved }),
  )
  const mutateChild = mutations(
    storage,
    broadcast,
    Child,
    (saved) => new ChildConflict({ code: "ACTION_REPLAY_MISMATCH", current: saved }),
  )
  const household = HttpApiBuilder.group(Api, "household", (handlers) =>
    handlers.handle("editHousehold", ({ payload, request }) =>
      mutateHousehold(request, HouseholdEdit, payload, (stamp) => editHousehold(stamp, payload)).pipe(asSavedHousehold),
    ),
  )
  const child = HttpApiBuilder.group(Api, "child", (handlers) =>
    handlers.handle("editChild", ({ payload, request }) =>
      mutateChild(request, ChildEdit, payload, (stamp) => editChild(stamp, payload)).pipe(asSavedChild),
    ),
  )
  return Layer.mergeAll(household, child)
}
