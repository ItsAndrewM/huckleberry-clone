import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { ActionId } from "./action-id.ts"
import { Conflict, InvalidInput, NotFound } from "./errors.ts"
import { Changed } from "./query-keys.ts"
import { Instant } from "./time.ts"
import { Version, VersionedAction } from "./version.ts"

export const MIN_WEIGHT_G = 200
export const MAX_WEIGHT_G = 40_000
export const MIN_LENGTH_CM = 20
export const MAX_LENGTH_CM = 150
export const MIN_HEAD_CM = 15
export const MAX_HEAD_CM = 70

const metricBetween = (minimum: number, maximum: number) =>
  Schema.NullOr(Schema.Finite.check(Schema.isBetween({ minimum, maximum })))

const metricFields = {
  weightG: metricBetween(MIN_WEIGHT_G, MAX_WEIGHT_G),
  lengthCm: metricBetween(MIN_LENGTH_CM, MAX_LENGTH_CM),
  headCm: metricBetween(MIN_HEAD_CM, MAX_HEAD_CM),
}

export const Measurement = Schema.Struct({
  id: Schema.String,
  measuredAt: Instant,
  ...metricFields,
  version: Version,
  createdBy: Schema.String,
  createdAt: Instant,
  updatedBy: Schema.String,
  updatedAt: Instant,
  deletedAt: Schema.NullOr(Instant),
})
export type Measurement = typeof Measurement.Type

const SOME_METRIC = "a weight, a length or a head circumference"

interface Metrics {
  readonly weightG: number | null
  readonly lengthCm: number | null
  readonly headCm: number | null
}

const someMetric = Schema.makeFilter(
  ({ weightG, lengthCm, headCm }: Metrics) =>
    weightG !== null ||
    lengthCm !== null ||
    headCm !== null || [
      { path: ["weightG"], issue: SOME_METRIC },
      { path: ["lengthCm"], issue: SOME_METRIC },
      { path: ["headCm"], issue: SOME_METRIC },
    ],
  { expected: SOME_METRIC },
)

const measurementFields = { measuredAt: Instant, ...metricFields }

export const NewMeasurement = Schema.Struct({ actionId: ActionId, ...measurementFields }).check(someMetric)
export type NewMeasurement = typeof NewMeasurement.Type

export const MeasurementEdit = Schema.Struct({ actionId: ActionId, version: Version, ...measurementFields }).check(
  someMetric,
)
export type MeasurementEdit = typeof MeasurementEdit.Type

export const SavedMeasurement = Schema.Struct({ measurement: Measurement, changed: Changed })
export type SavedMeasurement = typeof SavedMeasurement.Type

export const Growth = Schema.Struct({ measurements: Schema.Array(Measurement) })
export type Growth = typeof Growth.Type

export class MeasurementConflict extends Conflict<MeasurementConflict>()(
  "MeasurementConflict",
  ["STALE_VERSION", "ACTION_REPLAY_MISMATCH"],
  Measurement,
) {}

const byId = { id: Schema.String }

export class GrowthGroup extends HttpApiGroup.make("growth")
  .add(HttpApiEndpoint.get("growth", "/growth", { success: Growth }))
  .add(
    HttpApiEndpoint.post("logMeasurement", "/growth", {
      payload: NewMeasurement,
      success: SavedMeasurement.pipe(HttpApiSchema.status(201)),
      error: [InvalidInput, MeasurementConflict],
    }),
  )
  .add(
    HttpApiEndpoint.patch("editMeasurement", "/growth/:id", {
      params: byId,
      payload: MeasurementEdit,
      success: SavedMeasurement,
      error: [InvalidInput, NotFound, MeasurementConflict],
    }),
  )
  .add(
    HttpApiEndpoint.delete("deleteMeasurement", "/growth/:id", {
      params: byId,
      payload: VersionedAction,
      success: SavedMeasurement,
      error: [InvalidInput, NotFound, MeasurementConflict],
    }),
  )
  .add(
    HttpApiEndpoint.post("restoreMeasurement", "/growth/:id/restore", {
      params: byId,
      payload: VersionedAction,
      success: SavedMeasurement,
      error: [InvalidInput, NotFound, MeasurementConflict],
    }),
  ) {}
