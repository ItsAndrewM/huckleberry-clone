import {
  Api,
  Authorization,
  CurrentCaregiver,
  Diaper,
  DiaperConflict,
  DiaperEdit,
  InvalidInputs,
  invalidInputFrom,
  NewDiaper,
  NotFound,
  Unauthorized,
  VersionedAction,
} from "@bt/contracts"
import { Cause, Effect, ErrorReporter, Layer } from "effect"
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http"
import { HttpApiBuilder, HttpApiMiddleware } from "effect/http-api"
import { activeCaregiver } from "./core/caregivers.ts"
import { deleteDiaper, editDiaper, logDiaper, restoreDiaper } from "./core/diapers.ts"
import { meOf } from "./core/household.ts"
import { errorResponse } from "./error-response.ts"
import { mutations, type Saved } from "./mutations.ts"

export const invalidInputs = HttpApiMiddleware.layerSchemaErrorTransform(InvalidInputs, (error) =>
  error.kind === "Body" || error.kind === "ResponseHeaders"
    ? Effect.die(error.cause)
    : Effect.fail(invalidInputFrom(error.cause.issue)),
)

export const authorization = (sql: SqlStorage) =>
  Layer.succeed(Authorization, (handler) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const caregiver = activeCaregiver(sql, request.headers["x-bt-email"])
      if (caregiver === undefined) return yield* new Unauthorized()
      return yield* Effect.provideService(handler, CurrentCaregiver, caregiver)
    }),
  )

const unknownRoute = HttpRouter.add("*", "/*", () =>
  Effect.sync(() => HttpServerResponse.fromWeb(errorResponse(new NotFound()))),
)

const logDefects = ErrorReporter.layer([
  ErrorReporter.make(({ cause, error }) => {
    if (Cause.hasDies(cause)) console.error(error)
  }),
])

const asSavedDiaper = Effect.map(({ record, changed }: Saved<Diaper>) => ({ diaper: record, changed }))

const diaperHandlers = (storage: DurableObjectStorage) => {
  const mutate = mutations(
    storage,
    Diaper,
    (saved) => new DiaperConflict({ code: "ACTION_REPLAY_MISMATCH", current: saved }),
  )
  return HttpApiBuilder.group(Api, "diapers", (handlers) =>
    handlers
      .handle("logDiaper", ({ payload, request }) =>
        mutate(request, NewDiaper, payload, (stamp) => logDiaper(stamp, payload)).pipe(asSavedDiaper),
      )
      .handle("editDiaper", ({ params, payload, request }) =>
        mutate(request, DiaperEdit, payload, (stamp) => editDiaper(stamp, params.id, payload)).pipe(asSavedDiaper),
      )
      .handle("deleteDiaper", ({ params, payload, request }) =>
        mutate(request, VersionedAction, payload, (stamp) => deleteDiaper(stamp, params.id, payload)).pipe(
          asSavedDiaper,
        ),
      )
      .handle("restoreDiaper", ({ params, payload, request }) =>
        mutate(request, VersionedAction, payload, (stamp) => restoreDiaper(stamp, params.id, payload)).pipe(
          asSavedDiaper,
        ),
      ),
  )
}

export const householdApi = (storage: DurableObjectStorage) => {
  const me = HttpApiBuilder.group(Api, "me", (handlers) =>
    handlers.handle("me", () =>
      Effect.map(Effect.service(CurrentCaregiver), (caregiver) => meOf(storage.sql, caregiver)),
    ),
  )
  const groups = Layer.mergeAll(me, diaperHandlers(storage))
  return HttpRouter.toWebHandler(
    Layer.mergeAll(
      HttpApiBuilder.layer(Api).pipe(
        Layer.provide(groups.pipe(Layer.provide([authorization(storage.sql), invalidInputs]))),
      ),
      unknownRoute,
      logDefects,
    ).pipe(Layer.provide(HttpServer.layerServices)),
    { disableLogger: true },
  )
}
