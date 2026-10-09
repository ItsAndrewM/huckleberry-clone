import type { BottlePortion, Feed, FeedStatus, NursingSegment, PortionEntry, Side } from "@bt/contracts"
import { sessionBounds } from "@bt/domain"
import type { Stamp } from "../receipts.ts"

type FeedRow = {
  id: string
  status: FeedStatus
  started_at: number
  ended_at: number | null
  version: number
  created_by: string
  created_at: number
  updated_by: string
  updated_at: number
  deleted_at: number | null
}

type SegmentRow = { id: string; side: Side; started_at: number; ended_at: number | null }

type PortionRow = { id: string; occurred_at: number; breast_milk_ml: number; formula_ml: number }

export type SegmentTimes = Omit<NursingSegment, "id">

type FeedHeader = Pick<Feed, "id" | "status" | "deletedAt">

const FEED_COLUMNS =
  "id, status, started_at, ended_at, version, created_by, created_at, updated_by, updated_at, deleted_at"

const segmentsOf = (sql: SqlStorage, feedId: string): NursingSegment[] =>
  sql
    .exec<SegmentRow>(
      `SELECT id, side, started_at, ended_at FROM nursing_segments
       WHERE feed_id = ? AND deleted_at IS NULL ORDER BY started_at`,
      feedId,
    )
    .toArray()
    .map((row) => ({ id: row.id, side: row.side, startedAt: row.started_at, endedAt: row.ended_at }))

const portionsOf = (sql: SqlStorage, feedId: string): BottlePortion[] =>
  sql
    .exec<PortionRow>(
      `SELECT id, occurred_at, breast_milk_ml, formula_ml FROM bottle_portions
       WHERE feed_id = ? AND deleted_at IS NULL ORDER BY occurred_at, rowid`,
      feedId,
    )
    .toArray()
    .map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at,
      breastMilkMl: row.breast_milk_ml,
      formulaMl: row.formula_ml,
    }))

const feedFrom = (row: FeedRow, segments: NursingSegment[], portions: BottlePortion[]): Feed => ({
  id: row.id,
  status: row.status,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  segments,
  portions,
  version: row.version,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
})

export const loadFeed = (sql: SqlStorage, id: string): Feed | undefined => {
  const [row] = sql.exec<FeedRow>(`SELECT ${FEED_COLUMNS} FROM feeds WHERE id = ?`, id).toArray()
  return row === undefined ? undefined : feedFrom(row, segmentsOf(sql, id), portionsOf(sql, id))
}

export const insertSegment = (sql: SqlStorage, stamp: Stamp, feedId: string, segment: SegmentTimes): void => {
  sql.exec(
    `INSERT INTO nursing_segments (id, feed_id, side, started_at, ended_at, source, created_by, created_at, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, 'app', ?, ?, ?, ?)`,
    crypto.randomUUID(),
    feedId,
    segment.side,
    segment.startedAt,
    segment.endedAt,
    stamp.caregiverId,
    stamp.now,
    stamp.caregiverId,
    stamp.now,
  )
}

export const insertPortion = (sql: SqlStorage, stamp: Stamp, feedId: string, portion: PortionEntry): void => {
  sql.exec(
    `INSERT INTO bottle_portions (id, feed_id, occurred_at, breast_milk_ml, formula_ml, source, created_by, created_at, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, 'app', ?, ?, ?, ?)`,
    crypto.randomUUID(),
    feedId,
    portion.occurredAt,
    portion.breastMilkMl,
    portion.formulaMl,
    stamp.caregiverId,
    stamp.now,
    stamp.caregiverId,
    stamp.now,
  )
}

export const createFeed = (
  sql: SqlStorage,
  stamp: Stamp,
  status: FeedStatus,
  segments: ReadonlyArray<SegmentTimes>,
  portions: ReadonlyArray<PortionEntry>,
): Feed => {
  const bounds = sessionBounds({ segments, portions })
  if (bounds === null) throw new Error("A feed needs a nursing segment or a bottle")
  const row = sql
    .exec<FeedRow>(
      `INSERT INTO feeds (id, status, started_at, ended_at, version, source, created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, 1, 'app', ?, ?, ?, ?) RETURNING ${FEED_COLUMNS}`,
      crypto.randomUUID(),
      status,
      bounds.startedAt,
      bounds.endedAt,
      stamp.caregiverId,
      stamp.now,
      stamp.caregiverId,
      stamp.now,
    )
    .one()
  for (const segment of segments) insertSegment(sql, stamp, row.id, segment)
  for (const portion of portions) insertPortion(sql, stamp, row.id, portion)
  return feedFrom(row, segmentsOf(sql, row.id), portionsOf(sql, row.id))
}

export const saveFeed = (sql: SqlStorage, stamp: Stamp, header: FeedHeader): Feed => {
  const segments = segmentsOf(sql, header.id)
  const portions = portionsOf(sql, header.id)
  const bounds = sessionBounds({ segments, portions })
  if (bounds === null) throw new Error(`Feed ${header.id} would be left with no nursing segment or bottle`)
  const row = sql
    .exec<FeedRow>(
      `UPDATE feeds SET status = ?, started_at = ?, ended_at = ?, deleted_at = ?, version = version + 1, updated_by = ?, updated_at = ?
       WHERE id = ? RETURNING ${FEED_COLUMNS}`,
      header.status,
      bounds.startedAt,
      bounds.endedAt,
      header.deletedAt,
      stamp.caregiverId,
      stamp.now,
      header.id,
    )
    .one()
  return feedFrom(row, segments, portions)
}

export const closeSegment = (sql: SqlStorage, stamp: Stamp, segmentId: string, endedAt: number): void => {
  sql.exec(
    "UPDATE nursing_segments SET ended_at = ?, updated_by = ?, updated_at = ? WHERE id = ?",
    endedAt,
    stamp.caregiverId,
    stamp.now,
    segmentId,
  )
}

export const removeSegment = (sql: SqlStorage, stamp: Stamp, segmentId: string): void => {
  sql.exec(
    "UPDATE nursing_segments SET deleted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?",
    stamp.now,
    stamp.caregiverId,
    stamp.now,
    segmentId,
  )
}

export const updateSegment = (sql: SqlStorage, stamp: Stamp, segmentId: string, segment: SegmentTimes): void => {
  sql.exec(
    "UPDATE nursing_segments SET side = ?, started_at = ?, ended_at = ?, updated_by = ?, updated_at = ? WHERE id = ?",
    segment.side,
    segment.startedAt,
    segment.endedAt,
    stamp.caregiverId,
    stamp.now,
    segmentId,
  )
}

export const updatePortion = (sql: SqlStorage, stamp: Stamp, portionId: string, portion: PortionEntry): void => {
  sql.exec(
    `UPDATE bottle_portions SET occurred_at = ?, breast_milk_ml = ?, formula_ml = ?, updated_by = ?, updated_at = ?
     WHERE id = ?`,
    portion.occurredAt,
    portion.breastMilkMl,
    portion.formulaMl,
    stamp.caregiverId,
    stamp.now,
    portionId,
  )
}

export const removePortion = (sql: SqlStorage, stamp: Stamp, portionId: string): void => {
  sql.exec(
    "UPDATE bottle_portions SET deleted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?",
    stamp.now,
    stamp.caregiverId,
    stamp.now,
    portionId,
  )
}
