import {
  Api,
  Authorization,
  CurrentCaregiver,
  InvalidInputs,
  invalidInputFrom,
  NotFound,
  Unauthorized,
} from "@bt/contracts"
import { Cause, Effect, ErrorReporter, Layer } from "effect"
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http"
import { HttpApiBuilder, HttpApiMiddleware } from "effect/http-api"
import { activeCaregiver } from "./core/caregivers.ts"
import { meOf } from "./core/household.ts"
import { errorResponse } from "./error-response.ts"

export const invalidInputs = HttpApiMiddleware.layerSchemaErrorTransform(InvalidInputs, (error) =>
  Effect.fail(invalidInputFrom(error.cause.issue)),
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

export const householdApi = (sql: SqlStorage) => {
  const me = HttpApiBuilder.group(Api, "me", (handlers) =>
    handlers.handle("me", () => Effect.map(Effect.service(CurrentCaregiver), (caregiver) => meOf(sql, caregiver))),
  )
  return HttpRouter.toWebHandler(
    Layer.mergeAll(
      HttpApiBuilder.layer(Api).pipe(Layer.provide(me.pipe(Layer.provide([authorization(sql), invalidInputs])))),
      unknownRoute,
      logDefects,
    ).pipe(Layer.provide(HttpServer.layerServices)),
    { disableLogger: true },
  )
}
