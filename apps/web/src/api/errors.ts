import { ServiceUnavailable, Unauthorized } from "@bt/contracts"
import { Data, Schema } from "effect"
import { HttpClientError } from "effect/http"
import type { Signal } from "./connectivity.ts"

export class AuthRequired extends Data.TaggedError("AuthRequired") {}

export class Offline extends Data.TaggedError("Offline") {}

export class Unexpected extends Data.TaggedError("Unexpected")<{ readonly status: number | null }> {}

const OPAQUE_REDIRECT = 0
const SERVICE_UNAVAILABLE = 503

const statusOf = ({ reason }: HttpClientError.HttpClientError): number | null => {
  switch (reason._tag) {
    case "StatusCodeError":
    case "DecodeError":
    case "EmptyBodyError":
      return reason.response.status
    default:
      return null
  }
}

const fromHttpClient = (error: HttpClientError.HttpClientError) => {
  if (error.reason._tag === "TransportError") return new Offline()
  const status = statusOf(error)
  if (status === OPAQUE_REDIRECT) return new AuthRequired()
  if (status === SERVICE_UNAVAILABLE) return new ServiceUnavailable()
  return new Unexpected({ status })
}

export const classify = <E>(error: E | HttpClientError.HttpClientError | Schema.SchemaError) => {
  if (error instanceof HttpClientError.HttpClientError) return fromHttpClient(error)
  if (error instanceof Schema.SchemaError) return new Unexpected({ status: null })
  return error
}

export const signalOf = <E>(error: E | AuthRequired | Offline | Unexpected): Signal | null => {
  if (error instanceof AuthRequired || error instanceof Unauthorized) return "signed-out"
  if (error instanceof Offline) return "unreachable"
  if (error instanceof Unexpected && error.status === null) return null
  return "reached"
}
