import {
  type Changed,
  type Feed,
  FeedConflict,
  type FieldError,
  MAX_SEGMENT_MS,
  NotFound,
  type NursingSegment,
  type PortionEntry,
  queryKeys,
} from "@bt/contracts"
import {
  FUTURE_TOLERANCE_MS,
  type Instant,
  type Interval,
  type Span,
  type ValidationIssue,
  validateEndAfterStart,
  validateNotInFuture,
} from "@bt/domain"
import { type Calendar, changedKeys, timeIssue } from "../calendar.ts"
import { errorAt } from "../fields.ts"
import type { CoreResult, Stamp } from "../receipts.ts"
import { loadFeed, saveFeed } from "./store.ts"

type FeedState = "live" | "active" | "paused" | "completed" | "deleted"

type Found =
  | { readonly ok: true; readonly feed: Feed }
  | { readonly ok: false; readonly error: NotFound | FeedConflict }

type Running =
  | { readonly ok: true; readonly feed: Feed; readonly open: NursingSegment }
  | { readonly ok: false; readonly error: NotFound | FeedConflict }

interface Exclusion {
  readonly feedId: string | null
  readonly segmentId: string | null
}

export const NO_EXCLUSION: Exclusion = { feedId: null, segmentId: null }

const endIssue = (startedAt: Instant, endedAt: Instant, now: Instant): ValidationIssue | null =>
  validateEndAfterStart(startedAt, endedAt) ??
  validateNotInFuture(endedAt, now) ??
  (endedAt - startedAt > MAX_SEGMENT_MS ? "out_of_range" : null)

const NO_KEPT_TIMES: ReadonlySet<Instant> = new Set()

const newTimeIssue = (calendar: Calendar, at: Instant, now: Instant, kept: ReadonlySet<Instant>) =>
  kept.has(at) ? null : timeIssue(calendar, at, now)

export const segmentErrors = (
  calendar: Calendar,
  segment: Span,
  now: Instant,
  prefix: string,
  kept = NO_KEPT_TIMES,
): FieldError[] => [
  ...errorAt(`${prefix}startedAt`, newTimeIssue(calendar, segment.startedAt, now, kept)),
  ...errorAt(`${prefix}endedAt`, segment.endedAt === null ? null : endIssue(segment.startedAt, segment.endedAt, now)),
]

export const portionErrors = (
  calendar: Calendar,
  portion: PortionEntry,
  now: Instant,
  prefix: string,
  kept = NO_KEPT_TIMES,
): FieldError[] => errorAt(`${prefix}occurredAt`, newTimeIssue(calendar, portion.occurredAt, now, kept))

export const timesOf = (feed: Feed): ReadonlySet<Instant> =>
  new Set([...feed.segments.map(({ startedAt }) => startedAt), ...feed.portions.map(({ occurredAt }) => occurredAt)])

export const runningSegment = (feed: Feed) => feed.segments.find((segment) => segment.endedAt === null)

const isIn = (feed: Feed, wanted: FeedState): boolean => {
  if (wanted === "deleted") return feed.deletedAt !== null
  if (feed.deletedAt !== null) return false
  if (wanted === "live") return true
  if (wanted === "completed") return feed.status === "completed"
  if (feed.status !== "active") return false
  return wanted === "active" || runningSegment(feed) === undefined
}

export const feedFor = (sql: SqlStorage, id: string, version: number, wanted: FeedState): Found => {
  const feed = loadFeed(sql, id)
  if (feed === undefined) return { ok: false, error: new NotFound() }
  if (feed.version !== version) return { ok: false, error: new FeedConflict({ code: "STALE_VERSION", current: feed }) }
  return isIn(feed, wanted) ? { ok: true, feed } : { ok: false, error: new NotFound() }
}

export const runningFeedFor = (sql: SqlStorage, id: string, version: number): Running => {
  const found = feedFor(sql, id, version, "active")
  if (!found.ok) return found
  const open = runningSegment(found.feed)
  return open === undefined ? { ok: false, error: new NotFound() } : { ok: true, feed: found.feed, open }
}

export const activeFeed = (sql: SqlStorage): Feed | undefined => {
  const [row] = sql
    .exec<{ id: string }>("SELECT id FROM feeds WHERE status = 'active' AND deleted_at IS NULL")
    .toArray()
  return row === undefined ? undefined : loadFeed(sql, row.id)
}

export const overlappedFeed = (
  sql: SqlStorage,
  segments: ReadonlyArray<Span>,
  now: Instant,
  except: Exclusion,
): Feed | undefined => {
  const runningUntil = now + FUTURE_TOLERANCE_MS
  for (const segment of segments) {
    const [hit] = sql
      .exec<{ feed_id: string }>(
        `SELECT s.feed_id FROM nursing_segments s JOIN feeds f ON f.id = s.feed_id
         WHERE s.deleted_at IS NULL AND f.deleted_at IS NULL AND f.id IS NOT ? AND s.id IS NOT ?
           AND s.started_at < ? AND COALESCE(s.ended_at, ?) > ?
         ORDER BY s.started_at LIMIT 1`,
        except.feedId,
        except.segmentId,
        segment.endedAt ?? runningUntil,
        runningUntil,
        segment.startedAt,
      )
      .toArray()
    if (hit !== undefined) return loadFeed(sql, hit.feed_id)
  }
  return undefined
}

export const overlapConflict = (feed: Feed) => new FeedConflict({ code: "SEGMENT_OVERLAP", current: feed })

export const latestOf = (feed: Feed): Instant => {
  const times = [
    ...feed.segments.map((segment) => segment.endedAt ?? segment.startedAt),
    ...feed.portions.map((portion) => portion.occurredAt),
  ]
  if (times.length === 0) throw new Error(`Feed ${feed.id} has no nursing segment or bottle`)
  return Math.max(...times)
}

const spanIncludingItsEnd = (feed: Feed, now: Instant): Interval => ({
  start: feed.startedAt,
  end: (feed.endedAt ?? Math.max(now, latestOf(feed))) + 1,
})

export const feedChanges = (calendar: Calendar, before: Feed | null, after: Feed | null, now: Instant): Changed =>
  changedKeys(
    calendar,
    before === null ? null : spanIncludingItsEnd(before, now),
    after === null ? null : spanIncludingItsEnd(after, now),
  )

export const savedFeed = (
  calendar: Calendar,
  before: Feed | null,
  after: Feed,
  now: Instant,
): CoreResult<Feed, never> => ({
  ok: true,
  response: after,
  changed: feedChanges(calendar, before, after, now),
})

export const onlyComponent = (feed: Feed) => feed.segments.length + feed.portions.length === 1

export const deletedAsItStands = (
  sql: SqlStorage,
  stamp: Stamp,
  calendar: Calendar,
  feed: Feed,
): CoreResult<Feed, never> => ({
  ok: true,
  response: saveFeed(sql, stamp, { ...feed, deletedAt: stamp.now }),
  changed: [...feedChanges(calendar, feed, null, stamp.now), queryKeys.deleted],
})

export const whenEmptied = (
  sql: SqlStorage,
  stamp: Stamp,
  calendar: Calendar,
  feed: Feed,
  deleteIfEmpty: boolean,
): CoreResult<Feed, FeedConflict> =>
  deleteIfEmpty
    ? deletedAsItStands(sql, stamp, calendar, feed)
    : { ok: false, error: new FeedConflict({ code: "FEED_EMPTY", current: feed }) }
