import { NotFound, ServiceUnavailable, Unauthorized } from "@bt/contracts"
import { Schema } from "effect"

const WorkerError = Schema.Union([Unauthorized, NotFound, ServiceUnavailable])
type WorkerError = typeof WorkerError.Type

const STATUS = { Unauthorized: 401, NotFound: 404, ServiceUnavailable: 503 } as const

const encode = Schema.encodeSync(Schema.toCodecJson(WorkerError))

export const errorResponse = (error: WorkerError): Response =>
  Response.json(encode(error), { status: STATUS[error._tag], headers: { "cache-control": "no-store" } })
