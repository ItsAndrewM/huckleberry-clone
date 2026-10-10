import { Api, Measurement, MeasurementConflict, MeasurementEdit, NewMeasurement, VersionedAction } from "@bt/contracts"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { deleteMeasurement, editMeasurement, growthOf, logMeasurement, restoreMeasurement } from "./core/growth.ts"
import { mutations, type Saved } from "./mutations.ts"
import type { Broadcast } from "./sockets.ts"

const asSavedMeasurement = Effect.map(({ record, changed }: Saved<Measurement>) => ({ measurement: record, changed }))

export const growthHandlers = (storage: DurableObjectStorage, broadcast: Broadcast) => {
  const mutate = mutations(
    storage,
    broadcast,
    Measurement,
    (saved) => new MeasurementConflict({ code: "ACTION_REPLAY_MISMATCH", current: saved }),
  )
  return HttpApiBuilder.group(Api, "growth", (handlers) =>
    handlers
      .handle("growth", () => Effect.sync(() => growthOf(storage.sql)))
      .handle("logMeasurement", ({ payload, request }) =>
        mutate(request, NewMeasurement, payload, (stamp) => logMeasurement(stamp, payload)).pipe(asSavedMeasurement),
      )
      .handle("editMeasurement", ({ params, payload, request }) =>
        mutate(request, MeasurementEdit, payload, (stamp) => editMeasurement(stamp, params.id, payload)).pipe(
          asSavedMeasurement,
        ),
      )
      .handle("deleteMeasurement", ({ params, payload, request }) =>
        mutate(request, VersionedAction, payload, (stamp) => deleteMeasurement(stamp, params.id, payload)).pipe(
          asSavedMeasurement,
        ),
      )
      .handle("restoreMeasurement", ({ params, payload, request }) =>
        mutate(request, VersionedAction, payload, (stamp) => restoreMeasurement(stamp, params.id, payload)).pipe(
          asSavedMeasurement,
        ),
      ),
  )
}
