import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { ActionId } from "./action-id.ts"
import { Conflict, InvalidInput, NotFound } from "./errors.ts"
import { Changed } from "./query-keys.ts"
import { Instant } from "./time.ts"
import { Version, VersionedAction } from "./version.ts"

export const Diaper = Schema.Struct({
  id: Schema.String,
  occurredAt: Instant,
  wet: Schema.Boolean,
  dirty: Schema.Boolean,
  version: Version,
  createdBy: Schema.String,
  createdAt: Instant,
  updatedBy: Schema.String,
  updatedAt: Instant,
  deletedAt: Schema.NullOr(Instant),
})
export type Diaper = typeof Diaper.Type

const WET_OR_DIRTY = "a diaper that's wet, dirty or both"

const wetOrDirty = Schema.makeFilter(
  ({ wet, dirty }: { readonly wet: boolean; readonly dirty: boolean }) =>
    wet ||
    dirty || [
      { path: ["wet"], issue: WET_OR_DIRTY },
      { path: ["dirty"], issue: WET_OR_DIRTY },
    ],
  { expected: WET_OR_DIRTY },
)

const diaperFields = { occurredAt: Instant, wet: Schema.Boolean, dirty: Schema.Boolean }

export const NewDiaper = Schema.Struct({ actionId: ActionId, ...diaperFields }).check(wetOrDirty)
export type NewDiaper = typeof NewDiaper.Type

export const DiaperEdit = Schema.Struct({ actionId: ActionId, version: Version, ...diaperFields }).check(wetOrDirty)
export type DiaperEdit = typeof DiaperEdit.Type

export const SavedDiaper = Schema.Struct({ diaper: Diaper, changed: Changed })
export type SavedDiaper = typeof SavedDiaper.Type

export class DiaperConflict extends Conflict<DiaperConflict>()(
  "DiaperConflict",
  ["STALE_VERSION", "ACTION_REPLAY_MISMATCH"],
  Diaper,
) {}

const byId = { id: Schema.String }

export class DiapersGroup extends HttpApiGroup.make("diapers")
  .add(
    HttpApiEndpoint.post("logDiaper", "/diapers", {
      payload: NewDiaper,
      success: SavedDiaper.pipe(HttpApiSchema.status(201)),
      error: [InvalidInput, DiaperConflict],
    }),
  )
  .add(
    HttpApiEndpoint.patch("editDiaper", "/diapers/:id", {
      params: byId,
      payload: DiaperEdit,
      success: SavedDiaper,
      error: [InvalidInput, NotFound, DiaperConflict],
    }),
  )
  .add(
    HttpApiEndpoint.delete("deleteDiaper", "/diapers/:id", {
      params: byId,
      payload: VersionedAction,
      success: SavedDiaper,
      error: [InvalidInput, NotFound, DiaperConflict],
    }),
  )
  .add(
    HttpApiEndpoint.post("restoreDiaper", "/diapers/:id/restore", {
      params: byId,
      payload: VersionedAction,
      success: SavedDiaper,
      error: [InvalidInput, NotFound, DiaperConflict],
    }),
  ) {}
