import { type ActionId, type Changed, CurrentCaregiver, InvalidInput } from "@bt/contracts"
import { Effect, type Schema } from "effect"
import type { HttpServerRequest } from "effect/http"
import { type CoreResult, type Outcome, requestHash, type Stamp, withReceipt } from "./core/receipts.ts"

export interface Saved<A> {
  readonly record: A
  readonly changed: Changed
}

const settle = <A, E, C>(outcome: Outcome<A, E>, replayMismatch: (saved: A) => C) => {
  switch (outcome.kind) {
    case "applied":
    case "replayed":
      return Effect.succeed<Saved<A>>({ record: outcome.response, changed: outcome.changed })
    case "replay-mismatch":
      return Effect.fail(replayMismatch(outcome.saved))
    case "other-route":
      return Effect.fail(new InvalidInput({ fieldErrors: [{ path: "actionId", issue: "invalid" }] }))
    case "rejected":
      return Effect.fail(outcome.error)
  }
}

export const mutations =
  <A, C>(storage: DurableObjectStorage, record: Schema.Codec<A, Schema.Json>, replayMismatch: (saved: A) => C) =>
  <P extends { readonly actionId: ActionId }, E>(
    request: HttpServerRequest.HttpServerRequest,
    payload: Schema.Codec<P, Schema.Json>,
    value: P,
    core: (stamp: Stamp) => (sql: SqlStorage) => CoreResult<A, E>,
  ) =>
    Effect.gen(function* () {
      const caregiver = yield* Effect.service(CurrentCaregiver)
      const route = `${request.method} ${new URL(request.originalUrl).pathname}`
      const hash = yield* Effect.promise(() => requestHash(route, payload, value))
      const stamp = { caregiverId: caregiver.id, now: Date.now() }
      const mutation = { ...stamp, route, actionId: value.actionId, requestHash: hash }
      return yield* settle(withReceipt(storage, mutation, record, core(stamp)), replayMismatch)
    })
