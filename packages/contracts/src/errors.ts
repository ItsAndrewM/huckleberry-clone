import { VALIDATION_ISSUES } from "@bt/domain"
import { Schema } from "effect"

export const FieldIssue = Schema.Literals([...VALIDATION_ISSUES, "invalid"])
export type FieldIssue = typeof FieldIssue.Type

export const FieldError = Schema.Struct({ path: Schema.String, issue: FieldIssue })
export type FieldError = typeof FieldError.Type

export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}, { httpApiStatus: 401 }) {}

export class InvalidInput extends Schema.TaggedError<InvalidInput>()(
  "InvalidInput",
  { fieldErrors: Schema.Array(FieldError) },
  { httpApiStatus: 400 },
) {}

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}, { httpApiStatus: 404 }) {}

export class RateLimited extends Schema.TaggedError<RateLimited>()("RateLimited", {}, { httpApiStatus: 429 }) {}

export class ServiceUnavailable extends Schema.TaggedError<ServiceUnavailable>()(
  "ServiceUnavailable",
  {},
  { httpApiStatus: 503 },
) {}

export const ConflictCode = Schema.Literals([
  "FEED_ALREADY_ACTIVE",
  "SLEEP_ALREADY_ACTIVE",
  "SLEEP_OVERLAP",
  "SEGMENT_OVERLAP",
  "STALE_VERSION",
  "SUPPLEMENT_DUPLICATE_DAY",
  "FEED_EMPTY",
  "ACTION_REPLAY_MISMATCH",
])
export type ConflictCode = typeof ConflictCode.Type

export const Conflict =
  <Self>() =>
  <const Codes extends readonly [ConflictCode, ...ConflictCode[]], Current extends Schema.Top>(
    codes: Codes,
    current: Current,
  ) =>
    Schema.TaggedError<Self>()("Conflict", { code: Schema.Literals(codes), current }, { httpApiStatus: 409 })
