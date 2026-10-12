import {
  type Diaper,
  DiaperConflict,
  type DiaperEdit,
  InvalidInput,
  type NewDiaper,
  NotFound,
  queryKeys,
  type VersionedAction,
} from "@bt/contracts"
import type { Instant, Interval } from "@bt/domain"
import { type Calendar, calendarOf, changedKeys, timeIssue } from "./calendar.ts"
import type { CoreResult, Stamp } from "./receipts.ts"

type DiaperRow = {
  id: string
  occurred_at: number
  wet: number
  dirty: number
  version: number
  created_by: string
  created_at: number
  updated_by: string
  updated_at: number
  deleted_at: number | null
}

type Found =
  | { readonly ok: true; readonly row: DiaperRow }
  | { readonly ok: false; readonly error: NotFound | DiaperConflict }

const COLUMNS = "id, occurred_at, wet, dirty, version, created_by, created_at, updated_by, updated_at, deleted_at"

const diaperOf = (row: DiaperRow): Diaper => ({
  id: row.id,
  occurredAt: row.occurred_at,
  wet: row.wet === 1,
  dirty: row.dirty === 1,
  version: row.version,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
})

export const liveDiapersSince = (sql: SqlStorage, from: Instant): Diaper[] =>
  sql
    .exec<DiaperRow>(
      `SELECT ${COLUMNS} FROM diapers WHERE deleted_at IS NULL AND occurred_at >= ? ORDER BY occurred_at, rowid`,
      from,
    )
    .toArray()
    .map(diaperOf)

export const liveDiapersIn = (sql: SqlStorage, period: Interval): Diaper[] =>
  sql
    .exec<DiaperRow>(
      `SELECT ${COLUMNS} FROM diapers WHERE deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ?
       ORDER BY occurred_at, rowid`,
      period.start,
      period.end,
    )
    .toArray()
    .map(diaperOf)

export const deletedDiapersSince = (sql: SqlStorage, since: Instant): Diaper[] =>
  sql
    .exec<DiaperRow>(`SELECT ${COLUMNS} FROM diapers WHERE deleted_at >= ? ORDER BY deleted_at DESC, rowid DESC`, since)
    .toArray()
    .map(diaperOf)

const moment = (at: Instant | null) => (at === null ? null : { start: at, end: at })

const invalidTime = (calendar: Calendar, occurredAt: Instant, now: Instant): InvalidInput | null => {
  const issue = timeIssue(calendar, occurredAt, now)
  return issue === null ? null : new InvalidInput({ fieldErrors: [{ path: "occurredAt", issue }] })
}

const diaperFor = (sql: SqlStorage, id: string, version: number, state: "live" | "deleted"): Found => {
  const [row] = sql.exec<DiaperRow>(`SELECT ${COLUMNS} FROM diapers WHERE id = ?`, id).toArray()
  if (row === undefined) return { ok: false, error: new NotFound() }
  if (row.version !== version) {
    return { ok: false, error: new DiaperConflict({ code: "STALE_VERSION", current: diaperOf(row) }) }
  }
  if ((row.deleted_at === null ? "live" : "deleted") !== state) return { ok: false, error: new NotFound() }
  return { ok: true, row }
}

export const logDiaper =
  (stamp: Stamp, diaper: NewDiaper) =>
  (sql: SqlStorage): CoreResult<Diaper, InvalidInput> => {
    const calendar = calendarOf(sql)
    const invalid = invalidTime(calendar, diaper.occurredAt, stamp.now)
    if (invalid !== null) return { ok: false, error: invalid }
    const row = sql
      .exec<DiaperRow>(
        `INSERT INTO diapers (id, occurred_at, wet, dirty, version, source, created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, 1, 'app', ?, ?, ?, ?) RETURNING ${COLUMNS}`,
        crypto.randomUUID(),
        diaper.occurredAt,
        Number(diaper.wet),
        Number(diaper.dirty),
        stamp.caregiverId,
        stamp.now,
        stamp.caregiverId,
        stamp.now,
      )
      .one()
    return { ok: true, response: diaperOf(row), changed: changedKeys(calendar, null, moment(row.occurred_at)) }
  }

export const editDiaper =
  (stamp: Stamp, id: string, edit: DiaperEdit) =>
  (sql: SqlStorage): CoreResult<Diaper, NotFound | InvalidInput | DiaperConflict> => {
    const found = diaperFor(sql, id, edit.version, "live")
    if (!found.ok) return found
    const calendar = calendarOf(sql)
    const invalid = invalidTime(calendar, edit.occurredAt, stamp.now)
    if (invalid !== null) return { ok: false, error: invalid }
    const row = sql
      .exec<DiaperRow>(
        `UPDATE diapers SET occurred_at = ?, wet = ?, dirty = ?, version = version + 1, updated_by = ?, updated_at = ?
         WHERE id = ? RETURNING ${COLUMNS}`,
        edit.occurredAt,
        Number(edit.wet),
        Number(edit.dirty),
        stamp.caregiverId,
        stamp.now,
        id,
      )
      .one()
    const changed = changedKeys(calendar, moment(found.row.occurred_at), moment(row.occurred_at))
    return { ok: true, response: diaperOf(row), changed }
  }

const setDeletedAt =
  (stamp: Stamp, id: string, action: VersionedAction, deletedAt: Instant | null) =>
  (sql: SqlStorage): CoreResult<Diaper, NotFound | DiaperConflict> => {
    const found = diaperFor(sql, id, action.version, deletedAt === null ? "deleted" : "live")
    if (!found.ok) return found
    const row = sql
      .exec<DiaperRow>(
        `UPDATE diapers SET deleted_at = ?, version = version + 1, updated_by = ?, updated_at = ?
         WHERE id = ? RETURNING ${COLUMNS}`,
        deletedAt,
        stamp.caregiverId,
        stamp.now,
        id,
      )
      .one()
    return {
      ok: true,
      response: diaperOf(row),
      changed: [...changedKeys(calendarOf(sql), moment(row.occurred_at), null), queryKeys.deleted],
    }
  }

export const deleteDiaper = (stamp: Stamp, id: string, action: VersionedAction) =>
  setDeletedAt(stamp, id, action, stamp.now)

export const restoreDiaper = (stamp: Stamp, id: string, action: VersionedAction) =>
  setDeletedAt(stamp, id, action, null)
