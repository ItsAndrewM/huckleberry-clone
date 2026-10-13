import { SLEEP_KINDS } from "@bt/domain"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { ActionId } from "./action-id.ts"
import { Conflict, InvalidInput, NotFound } from "./errors.ts"
import { TimedAction } from "./feeds.ts"
import { Changed } from "./query-keys.ts"
import { Instant } from "./time.ts"
import { Version, VersionedAction } from "./version.ts"

export const MAX_SLEEP_MS = 24 * 60 * 60 * 1000

export const SleepKind = Schema.Literals(SLEEP_KINDS)
export type SleepKind = typeof SleepKind.Type

export const Sleep = Schema.Struct({
  id: Schema.String,
  kind: SleepKind,
  startedAt: Instant,
  endedAt: Schema.NullOr(Instant),
  version: Version,
  createdBy: Schema.String,
  createdAt: Instant,
  updatedBy: Schema.String,
  updatedAt: Instant,
  deletedAt: Schema.NullOr(Instant),
})
export type Sleep = typeof Sleep.Type

export const NewSleep = Schema.Struct({ actionId: ActionId, kind: SleepKind, startedAt: Instant, endedAt: Instant })
export type NewSleep = typeof NewSleep.Type

export const SleepStart = Schema.Struct({ actionId: ActionId, kind: SleepKind, startedAt: Instant })
export type SleepStart = typeof SleepStart.Type

export const SleepEdit = Schema.Struct({
  actionId: ActionId,
  version: Version,
  kind: SleepKind,
  startedAt: Instant,
  endedAt: Schema.NullOr(Instant),
})
export type SleepEdit = typeof SleepEdit.Type

export const SavedSleep = Schema.Struct({ sleep: Sleep, changed: Changed })
export type SavedSleep = typeof SavedSleep.Type

export class SleepConflict extends Conflict<SleepConflict>()(
  "SleepConflict",
  ["SLEEP_ALREADY_ACTIVE", "SLEEP_OVERLAP", "STALE_VERSION", "ACTION_REPLAY_MISMATCH"],
  Sleep,
) {}

const byId = { id: Schema.String }
const created = SavedSleep.pipe(HttpApiSchema.status(201))
const onSleep = { params: byId, success: SavedSleep, error: [InvalidInput, NotFound, SleepConflict] }

export class SleepsGroup extends HttpApiGroup.make("sleeps")
  .add(
    HttpApiEndpoint.post("logSleep", "/sleeps", {
      payload: NewSleep,
      success: created,
      error: [InvalidInput, SleepConflict],
    }),
  )
  .add(
    HttpApiEndpoint.post("startSleep", "/sleeps/start", {
      payload: SleepStart,
      success: created,
      error: [InvalidInput, SleepConflict],
    }),
  )
  .add(HttpApiEndpoint.post("wakeSleep", "/sleeps/:id/wake", { ...onSleep, payload: TimedAction }))
  .add(HttpApiEndpoint.patch("editSleep", "/sleeps/:id", { ...onSleep, payload: SleepEdit }))
  .add(HttpApiEndpoint.delete("deleteSleep", "/sleeps/:id", { ...onSleep, payload: VersionedAction }))
  .add(HttpApiEndpoint.post("restoreSleep", "/sleeps/:id/restore", { ...onSleep, payload: VersionedAction })) {}
