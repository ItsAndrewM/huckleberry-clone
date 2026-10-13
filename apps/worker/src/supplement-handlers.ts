import { Api, NewSupplement, Supplement, SupplementConflict, SupplementEdit } from "@bt/contracts"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { addSupplement, editSupplement } from "./core/supplements/definitions.ts"
import { mutations, type Saved } from "./mutations.ts"
import type { Broadcast } from "./sockets.ts"

const asSavedSupplement = Effect.map(({ record, changed }: Saved<Supplement>) => ({ supplement: record, changed }))

export const supplementHandlers = (storage: DurableObjectStorage, broadcast: Broadcast) => {
  const mutate = mutations(
    storage,
    broadcast,
    Supplement,
    (saved) => new SupplementConflict({ code: "ACTION_REPLAY_MISMATCH", current: saved }),
  )
  return HttpApiBuilder.group(Api, "supplements", (handlers) =>
    handlers
      .handle("addSupplement", ({ payload, request }) =>
        mutate(request, NewSupplement, payload, (stamp) => addSupplement(stamp, payload)).pipe(asSavedSupplement),
      )
      .handle("editSupplement", ({ params, payload, request }) =>
        mutate(request, SupplementEdit, payload, (stamp) => editSupplement(stamp, params.id, payload)).pipe(
          asSavedSupplement,
        ),
      ),
  )
}
