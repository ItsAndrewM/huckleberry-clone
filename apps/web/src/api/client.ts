import { Api } from "@bt/contracts"
import { Effect, type Schema } from "effect"
import { FetchHttpClient, type HttpClientError } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import type { Signal } from "./connectivity.ts"
import { classify, signalOf } from "./errors.ts"

export type ApiClient = HttpApiClient.ForApi<typeof Api>

export interface ApiOptions {
  readonly report: (signal: Signal) => void
  readonly baseUrl?: string
  readonly fetch?: typeof globalThis.fetch
}

const REQUEST_INIT: RequestInit = { redirect: "manual", credentials: "same-origin" }

export const connectApi = ({ report, baseUrl, fetch }: ApiOptions) => {
  const reportSignal = (signal: Signal | null) =>
    Effect.sync(() => {
      if (signal !== null) report(signal)
    })
  const request = <A, E>(
    call: (client: ApiClient) => Effect.Effect<A, E | HttpClientError.HttpClientError | Schema.SchemaError>,
  ): Promise<A> => {
    const program = HttpApiClient.make(Api, { baseUrl }).pipe(
      Effect.flatMap(call),
      Effect.mapError(classify),
      Effect.tap(() => reportSignal("reached")),
      Effect.tapError((error) => reportSignal(signalOf(error))),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.RequestInit, REQUEST_INIT),
    )
    return Effect.runPromise(
      fetch === undefined ? program : Effect.provideService(program, FetchHttpClient.Fetch, fetch),
    )
  }
  return { request }
}

export type HouseholdApi = ReturnType<typeof connectApi>
