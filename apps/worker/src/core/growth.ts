import {
  type Changed,
  type Growth,
  InvalidInput,
  type Measurement,
  MeasurementConflict,
  type MeasurementEdit,
  type NewMeasurement,
  NotFound,
  queryKeys,
  type VersionedAction,
} from "@bt/contracts"
import type { Instant } from "@bt/domain"
import { type Calendar, calendarOf, changedKeys, timeIssue } from "./calendar.ts"
import type { CoreResult, Stamp } from "./receipts.ts"

type MeasurementRow = {
  id: string
  measured_at: number
  weight_g: number | null
  length_cm: number | null
  head_cm: number | null
  version: number
  created_by: string
  created_at: number
  updated_by: string
  updated_at: number
  deleted_at: number | null
}

type Found =
  | { readonly ok: true; readonly row: MeasurementRow }
  | { readonly ok: false; readonly error: NotFound | MeasurementConflict }

const COLUMNS =
  "id, measured_at, weight_g, length_cm, head_cm, version, created_by, created_at, updated_by, updated_at, deleted_at"

const measurementOf = (row: MeasurementRow): Measurement => ({
  id: row.id,
  measuredAt: row.measured_at,
  weightG: row.weight_g,
  lengthCm: row.length_cm,
  headCm: row.head_cm,
  version: row.version,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
})

export const growthOf = (sql: SqlStorage): Growth => ({
  measurements: sql
    .exec<MeasurementRow>(
      `SELECT ${COLUMNS} FROM growth_measurements WHERE deleted_at IS NULL ORDER BY measured_at DESC, rowid DESC`,
    )
    .toArray()
    .map(measurementOf),
})

const moment = (at: Instant | null) => (at === null ? null : { start: at, end: at })

const changedFrom = (calendar: Calendar, before: Instant | null, after: Instant | null): Changed => [
  ...changedKeys(calendar, moment(before), moment(after)),
  queryKeys.growth,
]

const invalidTime = (calendar: Calendar, measuredAt: Instant, now: Instant): InvalidInput | null => {
  const issue = timeIssue(calendar, measuredAt, now)
  return issue === null ? null : new InvalidInput({ fieldErrors: [{ path: "measuredAt", issue }] })
}

const measurementFor = (sql: SqlStorage, id: string, version: number, state: "live" | "deleted"): Found => {
  const [row] = sql.exec<MeasurementRow>(`SELECT ${COLUMNS} FROM growth_measurements WHERE id = ?`, id).toArray()
  if (row === undefined) return { ok: false, error: new NotFound() }
  if (row.version !== version) {
    return { ok: false, error: new MeasurementConflict({ code: "STALE_VERSION", current: measurementOf(row) }) }
  }
  if ((row.deleted_at === null ? "live" : "deleted") !== state) return { ok: false, error: new NotFound() }
  return { ok: true, row }
}

export const logMeasurement =
  (stamp: Stamp, measurement: NewMeasurement) =>
  (sql: SqlStorage): CoreResult<Measurement, InvalidInput> => {
    const calendar = calendarOf(sql)
    const invalid = invalidTime(calendar, measurement.measuredAt, stamp.now)
    if (invalid !== null) return { ok: false, error: invalid }
    const row = sql
      .exec<MeasurementRow>(
        `INSERT INTO growth_measurements
           (id, measured_at, weight_g, length_cm, head_cm, version, source, created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, 'app', ?, ?, ?, ?) RETURNING ${COLUMNS}`,
        crypto.randomUUID(),
        measurement.measuredAt,
        measurement.weightG,
        measurement.lengthCm,
        measurement.headCm,
        stamp.caregiverId,
        stamp.now,
        stamp.caregiverId,
        stamp.now,
      )
      .one()
    return { ok: true, response: measurementOf(row), changed: changedFrom(calendar, null, row.measured_at) }
  }

export const editMeasurement =
  (stamp: Stamp, id: string, edit: MeasurementEdit) =>
  (sql: SqlStorage): CoreResult<Measurement, NotFound | InvalidInput | MeasurementConflict> => {
    const found = measurementFor(sql, id, edit.version, "live")
    if (!found.ok) return found
    const calendar = calendarOf(sql)
    const invalid = invalidTime(calendar, edit.measuredAt, stamp.now)
    if (invalid !== null) return { ok: false, error: invalid }
    const row = sql
      .exec<MeasurementRow>(
        `UPDATE growth_measurements
         SET measured_at = ?, weight_g = ?, length_cm = ?, head_cm = ?, version = version + 1, updated_by = ?, updated_at = ?
         WHERE id = ? RETURNING ${COLUMNS}`,
        edit.measuredAt,
        edit.weightG,
        edit.lengthCm,
        edit.headCm,
        stamp.caregiverId,
        stamp.now,
        id,
      )
      .one()
    return {
      ok: true,
      response: measurementOf(row),
      changed: changedFrom(calendar, found.row.measured_at, row.measured_at),
    }
  }

const setDeletedAt =
  (stamp: Stamp, id: string, action: VersionedAction, deletedAt: Instant | null) =>
  (sql: SqlStorage): CoreResult<Measurement, NotFound | MeasurementConflict> => {
    const found = measurementFor(sql, id, action.version, deletedAt === null ? "deleted" : "live")
    if (!found.ok) return found
    const row = sql
      .exec<MeasurementRow>(
        `UPDATE growth_measurements SET deleted_at = ?, version = version + 1, updated_by = ?, updated_at = ?
         WHERE id = ? RETURNING ${COLUMNS}`,
        deletedAt,
        stamp.caregiverId,
        stamp.now,
        id,
      )
      .one()
    return {
      ok: true,
      response: measurementOf(row),
      changed: [...changedFrom(calendarOf(sql), row.measured_at, null), queryKeys.deleted],
    }
  }

export const deleteMeasurement = (stamp: Stamp, id: string, action: VersionedAction) =>
  setDeletedAt(stamp, id, action, stamp.now)

export const restoreMeasurement = (stamp: Stamp, id: string, action: VersionedAction) =>
  setDeletedAt(stamp, id, action, null)
