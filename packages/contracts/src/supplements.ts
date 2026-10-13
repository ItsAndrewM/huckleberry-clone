import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { ActionId } from "./action-id.ts"
import { Conflict, InvalidInput, NotFound } from "./errors.ts"
import { Name } from "./household.ts"
import { Changed } from "./query-keys.ts"
import { Instant, LocalDate } from "./time.ts"
import { Version, VersionedAction } from "./version.ts"

export const MAX_DOSE_LENGTH = 40

export const DoseText = Schema.String.check(Schema.isTrimmed(), Schema.isMaxLength(MAX_DOSE_LENGTH))
export type DoseText = typeof DoseText.Type

export const Supplement = Schema.Struct({
  id: Schema.String,
  name: Name,
  dose: DoseText,
  stoppedAt: Schema.NullOr(Instant),
  version: Version,
  createdBy: Schema.NullOr(Schema.String),
  createdAt: Instant,
  updatedBy: Schema.NullOr(Schema.String),
  updatedAt: Instant,
})
export type Supplement = typeof Supplement.Type

export const NewSupplement = Schema.Struct({ actionId: ActionId, name: Name, dose: DoseText })
export type NewSupplement = typeof NewSupplement.Type

export const SupplementEdit = Schema.Struct({
  actionId: ActionId,
  version: Version,
  name: Name,
  dose: DoseText,
  stopped: Schema.Boolean,
})
export type SupplementEdit = typeof SupplementEdit.Type

export const SavedSupplement = Schema.Struct({ supplement: Supplement, changed: Changed })
export type SavedSupplement = typeof SavedSupplement.Type

export class SupplementConflict extends Conflict<SupplementConflict>()(
  "SupplementConflict",
  ["STALE_VERSION", "ACTION_REPLAY_MISMATCH"],
  Supplement,
) {}

export const Dose = Schema.Struct({
  id: Schema.String,
  supplementId: Schema.String,
  occurredAt: Instant,
  localDate: LocalDate,
  dose: DoseText,
  version: Version,
  createdBy: Schema.String,
  createdAt: Instant,
  updatedBy: Schema.String,
  updatedAt: Instant,
  deletedAt: Schema.NullOr(Instant),
})
export type Dose = typeof Dose.Type

export const NewDose = Schema.Struct({
  actionId: ActionId,
  supplementId: Schema.String,
  occurredAt: Instant,
  confirmedDuplicate: Schema.Boolean,
})
export type NewDose = typeof NewDose.Type

export const DoseEdit = Schema.Struct({ actionId: ActionId, version: Version, occurredAt: Instant })
export type DoseEdit = typeof DoseEdit.Type

export const SavedDose = Schema.Struct({ dose: Dose, changed: Changed })
export type SavedDose = typeof SavedDose.Type

export class DoseConflict extends Conflict<DoseConflict>()(
  "DoseConflict",
  ["SUPPLEMENT_DUPLICATE_DAY", "STALE_VERSION", "ACTION_REPLAY_MISMATCH"],
  Dose,
) {}

const byId = { id: Schema.String }

export class SupplementsGroup extends HttpApiGroup.make("supplements")
  .add(
    HttpApiEndpoint.post("addSupplement", "/supplements", {
      payload: NewSupplement,
      success: SavedSupplement.pipe(HttpApiSchema.status(201)),
      error: [InvalidInput, SupplementConflict],
    }),
  )
  .add(
    HttpApiEndpoint.patch("editSupplement", "/supplements/:id", {
      params: byId,
      payload: SupplementEdit,
      success: SavedSupplement,
      error: [InvalidInput, NotFound, SupplementConflict],
    }),
  ) {}

const onDose = { params: byId, success: SavedDose, error: [InvalidInput, NotFound, DoseConflict] }

export class DosesGroup extends HttpApiGroup.make("doses")
  .add(
    HttpApiEndpoint.post("logDose", "/doses", {
      payload: NewDose,
      success: SavedDose.pipe(HttpApiSchema.status(201)),
      error: [InvalidInput, NotFound, DoseConflict],
    }),
  )
  .add(HttpApiEndpoint.patch("editDose", "/doses/:id", { ...onDose, payload: DoseEdit }))
  .add(HttpApiEndpoint.delete("deleteDose", "/doses/:id", { ...onDose, payload: VersionedAction }))
  .add(HttpApiEndpoint.post("restoreDose", "/doses/:id/restore", { ...onDose, payload: VersionedAction })) {}
