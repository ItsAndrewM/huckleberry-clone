import {
  Api,
  Dose,
  DoseConflict,
  DoseEdit,
  NewDose,
  NewSupplement,
  Supplement,
  SupplementConflict,
  SupplementEdit,
  VersionedAction,
} from "@bt/contracts"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { addSupplement, editSupplement } from "./core/supplements/definitions.ts"
import { deleteDose, editDose, logDose, restoreDose } from "./core/supplements/dose-writes.ts"
import { mutations, type Saved } from "./mutations.ts"
import type { Broadcast } from "./sockets.ts"

const asSavedSupplement = Effect.map(({ record, changed }: Saved<Supplement>) => ({ supplement: record, changed }))

const asSavedDose = Effect.map(({ record, changed }: Saved<Dose>) => ({ dose: record, changed }))

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

export const doseHandlers = (storage: DurableObjectStorage, broadcast: Broadcast) => {
  const mutate = mutations(
    storage,
    broadcast,
    Dose,
    (saved) => new DoseConflict({ code: "ACTION_REPLAY_MISMATCH", current: saved }),
  )
  return HttpApiBuilder.group(Api, "doses", (handlers) =>
    handlers
      .handle("logDose", ({ payload, request }) =>
        mutate(request, NewDose, payload, (stamp) => logDose(stamp, payload)).pipe(asSavedDose),
      )
      .handle("editDose", ({ params, payload, request }) =>
        mutate(request, DoseEdit, payload, (stamp) => editDose(stamp, params.id, payload)).pipe(asSavedDose),
      )
      .handle("deleteDose", ({ params, payload, request }) =>
        mutate(request, VersionedAction, payload, (stamp) => deleteDose(stamp, params.id, payload)).pipe(asSavedDose),
      )
      .handle("restoreDose", ({ params, payload, request }) =>
        mutate(request, VersionedAction, payload, (stamp) => restoreDose(stamp, params.id, payload)).pipe(asSavedDose),
      ),
  )
}
