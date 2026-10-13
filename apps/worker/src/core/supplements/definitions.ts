import {
  type Changed,
  type NewSupplement,
  NotFound,
  queryKeys,
  type Supplement,
  SupplementConflict,
  type SupplementEdit,
} from "@bt/contracts"
import type { CoreResult, Stamp } from "../receipts.ts"

type SupplementRow = {
  id: string
  name: string
  dose: string
  stopped_at: number | null
  version: number
  created_by: string | null
  created_at: number
  updated_by: string | null
  updated_at: number
}

const COLUMNS = "id, name, dose, stopped_at, version, created_by, created_at, updated_by, updated_at"

const CHANGED: Changed = [queryKeys.me]

const supplementOf = (row: SupplementRow): Supplement => ({
  id: row.id,
  name: row.name,
  dose: row.dose,
  stoppedAt: row.stopped_at,
  version: row.version,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
})

export const supplementsOf = (sql: SqlStorage): Supplement[] =>
  sql.exec<SupplementRow>(`SELECT ${COLUMNS} FROM supplements ORDER BY rowid`).toArray().map(supplementOf)

export const seedVitaminD = (sql: SqlStorage, now: number) =>
  sql.exec(
    "INSERT INTO supplements (id, name, dose, version, created_at, updated_at) VALUES (?, 'Vitamin D', '400 IU', 1, ?, ?)",
    crypto.randomUUID(),
    now,
    now,
  )

export const addSupplement =
  (stamp: Stamp, entry: NewSupplement) =>
  (sql: SqlStorage): CoreResult<Supplement, never> => {
    const row = sql
      .exec<SupplementRow>(
        `INSERT INTO supplements (id, name, dose, version, created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
        crypto.randomUUID(),
        entry.name,
        entry.dose,
        stamp.caregiverId,
        stamp.now,
        stamp.caregiverId,
        stamp.now,
      )
      .one()
    return { ok: true, response: supplementOf(row), changed: CHANGED }
  }

const stoppedAt = (row: SupplementRow, stopped: boolean, now: number) => (stopped ? (row.stopped_at ?? now) : null)

export const editSupplement =
  (stamp: Stamp, id: string, edit: SupplementEdit) =>
  (sql: SqlStorage): CoreResult<Supplement, NotFound | SupplementConflict> => {
    const [current] = sql.exec<SupplementRow>(`SELECT ${COLUMNS} FROM supplements WHERE id = ?`, id).toArray()
    if (current === undefined) return { ok: false, error: new NotFound() }
    if (current.version !== edit.version) {
      return { ok: false, error: new SupplementConflict({ code: "STALE_VERSION", current: supplementOf(current) }) }
    }
    const row = sql
      .exec<SupplementRow>(
        `UPDATE supplements SET name = ?, dose = ?, stopped_at = ?, version = version + 1, updated_by = ?, updated_at = ?
         WHERE id = ? RETURNING ${COLUMNS}`,
        edit.name,
        edit.dose,
        stoppedAt(current, edit.stopped, stamp.now),
        stamp.caregiverId,
        stamp.now,
        id,
      )
      .one()
    return { ok: true, response: supplementOf(row), changed: CHANGED }
  }
