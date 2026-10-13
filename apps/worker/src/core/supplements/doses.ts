import type { Dose } from "@bt/contracts"
import type { Instant } from "@bt/domain"

export type DoseRow = {
  id: string
  supplement_id: string
  occurred_at: number
  local_date: string
  dose: string
  version: number
  created_by: string
  created_at: number
  updated_by: string
  updated_at: number
  deleted_at: number | null
}

export const DOSE_COLUMNS =
  "id, supplement_id, occurred_at, local_date, dose, version, created_by, created_at, updated_by, updated_at, deleted_at"

export const doseOf = (row: DoseRow): Dose => ({
  id: row.id,
  supplementId: row.supplement_id,
  occurredAt: row.occurred_at,
  localDate: row.local_date,
  dose: row.dose,
  version: row.version,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
})

export const liveDosesSince = (sql: SqlStorage, from: Instant): Dose[] =>
  sql
    .exec<DoseRow>(
      `SELECT ${DOSE_COLUMNS} FROM supplement_logs WHERE deleted_at IS NULL AND occurred_at >= ?
       ORDER BY occurred_at, rowid`,
      from,
    )
    .toArray()
    .map(doseOf)
