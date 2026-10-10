import { Api, Household, HouseholdConflict, HouseholdEdit } from "@bt/contracts"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { editHousehold } from "./core/household-edits.ts"
import { mutations, type Saved } from "./mutations.ts"
import type { Broadcast } from "./sockets.ts"

const asSavedHousehold = Effect.map(({ record, changed }: Saved<Household>) => ({ household: record, changed }))

export const householdHandlers = (storage: DurableObjectStorage, broadcast: Broadcast) => {
  const mutateHousehold = mutations(
    storage,
    broadcast,
    Household,
    (saved) => new HouseholdConflict({ code: "ACTION_REPLAY_MISMATCH", current: saved }),
  )
  return HttpApiBuilder.group(Api, "household", (handlers) =>
    handlers.handle("editHousehold", ({ payload, request }) =>
      mutateHousehold(request, HouseholdEdit, payload, (stamp) => editHousehold(stamp, payload)).pipe(asSavedHousehold),
    ),
  )
}
