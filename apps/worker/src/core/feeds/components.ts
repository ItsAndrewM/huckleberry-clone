import {
  type ComponentDelete,
  type Feed,
  type FeedConflict,
  type FieldError,
  type InvalidInput,
  NotFound,
  type NursingSegment,
  type SegmentEdit,
  type VersionedPortion,
} from "@bt/contracts"
import { calendarOf } from "../calendar.ts"
import { invalidUnless } from "../fields.ts"
import type { CoreResult, Stamp } from "../receipts.ts"
import {
  feedFor,
  onlyComponent,
  overlapConflict,
  overlappedFeed,
  portionErrors,
  savedFeed,
  segmentErrors,
  whenEmptied,
} from "./rules.ts"
import { removePortion, removeSegment, saveFeed, updatePortion, updateSegment } from "./store.ts"

type Table = "nursing_segments" | "bottle_portions"

type Located<C> =
  | { readonly ok: true; readonly feed: Feed; readonly component: C }
  | { readonly ok: false; readonly error: NotFound | FeedConflict }

const locate = <C extends { readonly id: string }>(
  sql: SqlStorage,
  table: Table,
  id: string,
  version: number,
  componentsOf: (feed: Feed) => ReadonlyArray<C>,
): Located<C> => {
  const [row] = sql.exec<{ feed_id: string }>(`SELECT feed_id FROM ${table} WHERE id = ?`, id).toArray()
  if (row === undefined) return { ok: false, error: new NotFound() }
  const found = feedFor(sql, row.feed_id, version, "live")
  if (!found.ok) return found
  const component = componentsOf(found.feed).find((one) => one.id === id)
  return component === undefined ? { ok: false, error: new NotFound() } : { ok: true, feed: found.feed, component }
}

const segmentsOf = (feed: Feed) => feed.segments

const portionsOf = (feed: Feed) => feed.portions

const runningChanged = (current: NursingSegment, edit: SegmentEdit): FieldError[] =>
  (current.endedAt === null) === (edit.endedAt === null) ? [] : [{ path: "endedAt", issue: "invalid" }]

export const editSegment =
  (stamp: Stamp, id: string, edit: SegmentEdit) =>
  (sql: SqlStorage): CoreResult<Feed, InvalidInput | NotFound | FeedConflict> => {
    const found = locate(sql, "nursing_segments", id, edit.version, segmentsOf)
    if (!found.ok) return found
    const calendar = calendarOf(sql)
    const errors = [...runningChanged(found.component, edit), ...segmentErrors(calendar, edit, stamp.now, "")]
    const invalid = invalidUnless(errors)
    if (invalid !== null) return { ok: false, error: invalid }
    const overlapped = overlappedFeed(sql, [edit], stamp.now, { feedId: null, segmentId: id })
    if (overlapped !== undefined) return { ok: false, error: overlapConflict(overlapped) }
    updateSegment(sql, stamp, id, edit)
    return savedFeed(calendar, found.feed, saveFeed(sql, stamp, found.feed), stamp.now)
  }

export const editPortion =
  (stamp: Stamp, id: string, edit: VersionedPortion) =>
  (sql: SqlStorage): CoreResult<Feed, InvalidInput | NotFound | FeedConflict> => {
    const found = locate(sql, "bottle_portions", id, edit.version, portionsOf)
    if (!found.ok) return found
    const calendar = calendarOf(sql)
    const invalid = invalidUnless(portionErrors(calendar, edit, stamp.now, ""))
    if (invalid !== null) return { ok: false, error: invalid }
    updatePortion(sql, stamp, id, edit)
    return savedFeed(calendar, found.feed, saveFeed(sql, stamp, found.feed), stamp.now)
  }

const deleteComponent =
  <C extends { readonly id: string }>(
    table: Table,
    componentsOf: (feed: Feed) => ReadonlyArray<C>,
    remove: (sql: SqlStorage, stamp: Stamp, id: string) => void,
  ) =>
  (stamp: Stamp, id: string, action: ComponentDelete) =>
  (sql: SqlStorage): CoreResult<Feed, NotFound | FeedConflict> => {
    const found = locate(sql, table, id, action.version, componentsOf)
    if (!found.ok) return found
    const calendar = calendarOf(sql)
    if (onlyComponent(found.feed)) return whenEmptied(sql, stamp, calendar, found.feed, action.deleteIfEmpty)
    remove(sql, stamp, id)
    return savedFeed(calendar, found.feed, saveFeed(sql, stamp, found.feed), stamp.now)
  }

export const deleteSegment = deleteComponent("nursing_segments", segmentsOf, removeSegment)

export const deletePortion = deleteComponent("bottle_portions", portionsOf, removePortion)
