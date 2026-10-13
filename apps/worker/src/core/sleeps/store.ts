import type { Sleep, SleepKind } from "@bt/contracts"
import type { Stamp } from "../receipts.ts"

type SleepRow = {
  id: string
  kind: SleepKind
  started_at: number
  ended_at: number | null
  version: number
  created_by: string
  created_at: number
  updated_by: string
  updated_at: number
  deleted_at: number | null
}

export type SleepTimes = Pick<Sleep, "kind" | "startedAt" | "endedAt">

type SleepState = Pick<Sleep, "id" | "kind" | "startedAt" | "endedAt" | "deletedAt">

const COLUMNS = "id, kind, started_at, ended_at, version, created_by, created_at, updated_by, updated_at, deleted_at"

const sleepOf = (row: SleepRow): Sleep => ({
  id: row.id,
  kind: row.kind,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  version: row.version,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
})

export const sleepsWhere = (sql: SqlStorage, condition: string, ...bindings: SqlStorageValue[]): Sleep[] =>
  sql
    .exec<SleepRow>(`SELECT ${COLUMNS} FROM sleeps ${condition}`, ...bindings)
    .toArray()
    .map(sleepOf)

export const loadSleep = (sql: SqlStorage, id: string): Sleep | undefined => sleepsWhere(sql, "WHERE id = ?", id)[0]

export const createSleep = (sql: SqlStorage, stamp: Stamp, times: SleepTimes): Sleep =>
  sleepOf(
    sql
      .exec<SleepRow>(
        `INSERT INTO sleeps (id, kind, started_at, ended_at, version, created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
        crypto.randomUUID(),
        times.kind,
        times.startedAt,
        times.endedAt,
        stamp.caregiverId,
        stamp.now,
        stamp.caregiverId,
        stamp.now,
      )
      .one(),
  )

export const saveSleep = (sql: SqlStorage, stamp: Stamp, sleep: SleepState): Sleep =>
  sleepOf(
    sql
      .exec<SleepRow>(
        `UPDATE sleeps SET kind = ?, started_at = ?, ended_at = ?, deleted_at = ?, version = version + 1, updated_by = ?, updated_at = ?
         WHERE id = ? RETURNING ${COLUMNS}`,
        sleep.kind,
        sleep.startedAt,
        sleep.endedAt,
        sleep.deletedAt,
        stamp.caregiverId,
        stamp.now,
        sleep.id,
      )
      .one(),
  )
