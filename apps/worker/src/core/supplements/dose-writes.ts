import {
  type Dose,
  DoseConflict,
  type DoseEdit,
  InvalidInput,
  type NewDose,
  NotFound,
  queryKeys,
  type VersionedAction,
} from "@bt/contracts"
import { type Instant, localDateOf, type TimeZone } from "@bt/domain"
import { type Calendar, calendarOf, changedKeys, timeIssue } from "../calendar.ts"
import type { CoreResult, Stamp } from "../receipts.ts"
import { DOSE_COLUMNS, type DoseRow, doseOf } from "./doses.ts"

type Found =
  | { readonly ok: true; readonly row: DoseRow }
  | { readonly ok: false; readonly error: NotFound | DoseConflict }

const moment = (at: Instant | null) => (at === null ? null : { start: at, end: at })

const invalidTime = (calendar: Calendar, occurredAt: Instant, now: Instant): InvalidInput | null => {
  const issue = timeIssue(calendar, occurredAt, now)
  return issue === null ? null : new InvalidInput({ fieldErrors: [{ path: "occurredAt", issue }] })
}

const doseFor = (sql: SqlStorage, id: string, version: number, state: "live" | "deleted"): Found => {
  const [row] = sql.exec<DoseRow>(`SELECT ${DOSE_COLUMNS} FROM supplement_logs WHERE id = ?`, id).toArray()
  if (row === undefined) return { ok: false, error: new NotFound() }
  if (row.version !== version) {
    return { ok: false, error: new DoseConflict({ code: "STALE_VERSION", current: doseOf(row) }) }
  }
  if ((row.deleted_at === null ? "live" : "deleted") !== state) return { ok: false, error: new NotFound() }
  return { ok: true, row }
}

const doseThatDay = (sql: SqlStorage, supplementId: string, localDate: string): DoseRow | undefined =>
  sql
    .exec<DoseRow>(
      `SELECT ${DOSE_COLUMNS} FROM supplement_logs
       WHERE local_date = ? AND supplement_id = ? AND deleted_at IS NULL
       ORDER BY occurred_at DESC, rowid DESC LIMIT 1`,
      localDate,
      supplementId,
    )
    .toArray()[0]

const supplementDose = (sql: SqlStorage, id: string): string | undefined =>
  sql.exec<{ dose: string }>("SELECT dose FROM supplements WHERE id = ?", id).toArray()[0]?.dose

export const logDose =
  (stamp: Stamp, entry: NewDose) =>
  (sql: SqlStorage): CoreResult<Dose, NotFound | InvalidInput | DoseConflict> => {
    const dose = supplementDose(sql, entry.supplementId)
    if (dose === undefined) return { ok: false, error: new NotFound() }
    const calendar = calendarOf(sql)
    const invalid = invalidTime(calendar, entry.occurredAt, stamp.now)
    if (invalid !== null) return { ok: false, error: invalid }
    const localDate = localDateOf(entry.occurredAt, calendar.zone)
    const already = entry.confirmedDuplicate ? undefined : doseThatDay(sql, entry.supplementId, localDate)
    if (already !== undefined) {
      return { ok: false, error: new DoseConflict({ code: "SUPPLEMENT_DUPLICATE_DAY", current: doseOf(already) }) }
    }
    const row = sql
      .exec<DoseRow>(
        `INSERT INTO supplement_logs
           (id, supplement_id, occurred_at, local_date, dose, version, created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?) RETURNING ${DOSE_COLUMNS}`,
        crypto.randomUUID(),
        entry.supplementId,
        entry.occurredAt,
        localDate,
        dose,
        stamp.caregiverId,
        stamp.now,
        stamp.caregiverId,
        stamp.now,
      )
      .one()
    return { ok: true, response: doseOf(row), changed: changedKeys(calendar, null, moment(row.occurred_at)) }
  }

export const editDose =
  (stamp: Stamp, id: string, edit: DoseEdit) =>
  (sql: SqlStorage): CoreResult<Dose, NotFound | InvalidInput | DoseConflict> => {
    const found = doseFor(sql, id, edit.version, "live")
    if (!found.ok) return found
    const calendar = calendarOf(sql)
    const kept = edit.occurredAt === found.row.occurred_at
    const invalid = kept ? null : invalidTime(calendar, edit.occurredAt, stamp.now)
    if (invalid !== null) return { ok: false, error: invalid }
    const row = sql
      .exec<DoseRow>(
        `UPDATE supplement_logs SET occurred_at = ?, local_date = ?, version = version + 1, updated_by = ?, updated_at = ?
         WHERE id = ? RETURNING ${DOSE_COLUMNS}`,
        edit.occurredAt,
        localDateOf(edit.occurredAt, calendar.zone),
        stamp.caregiverId,
        stamp.now,
        id,
      )
      .one()
    const changed = changedKeys(calendar, moment(found.row.occurred_at), moment(row.occurred_at))
    return { ok: true, response: doseOf(row), changed }
  }

const setDeletedAt =
  (stamp: Stamp, id: string, action: VersionedAction, deletedAt: Instant | null) =>
  (sql: SqlStorage): CoreResult<Dose, NotFound | InvalidInput | DoseConflict> => {
    const found = doseFor(sql, id, action.version, deletedAt === null ? "deleted" : "live")
    if (!found.ok) return found
    const calendar = calendarOf(sql)
    const invalid = deletedAt === null ? invalidTime(calendar, found.row.occurred_at, stamp.now) : null
    if (invalid !== null) return { ok: false, error: invalid }
    const row = sql
      .exec<DoseRow>(
        `UPDATE supplement_logs SET deleted_at = ?, version = version + 1, updated_by = ?, updated_at = ?
         WHERE id = ? RETURNING ${DOSE_COLUMNS}`,
        deletedAt,
        stamp.caregiverId,
        stamp.now,
        id,
      )
      .one()
    return {
      ok: true,
      response: doseOf(row),
      changed: [...changedKeys(calendar, moment(row.occurred_at), null), queryKeys.deleted],
    }
  }

export const deleteDose = (stamp: Stamp, id: string, action: VersionedAction) =>
  setDeletedAt(stamp, id, action, stamp.now)

export const restoreDose = (stamp: Stamp, id: string, action: VersionedAction) => setDeletedAt(stamp, id, action, null)

export const refileDoses = (sql: SqlStorage, zone: TimeZone) => {
  const rows = sql.exec<{ id: string; occurred_at: number }>("SELECT id, occurred_at FROM supplement_logs").toArray()
  for (const { id, occurred_at } of rows) {
    sql.exec("UPDATE supplement_logs SET local_date = ? WHERE id = ?", localDateOf(occurred_at, zone), id)
  }
}
