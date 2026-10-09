import {
  type Changed,
  type Feed,
  FeedConflict,
  type FieldError,
  InvalidInput,
  MAX_SEGMENT_MS,
  type PortionEntry,
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
import { loadFeed } from "./store.ts"

interface Exclusion {
  readonly feedId: string | null
  readonly segmentId: string | null
}

export const NO_EXCLUSION: Exclusion = { feedId: null, segmentId: null }

export const errorAt = (path: string, issue: ValidationIssue | null): FieldError[] =>
  issue === null ? [] : [{ path, issue }]

export const invalidUnless = (errors: ReadonlyArray<FieldError>): InvalidInput | null =>
  errors.length === 0 ? null : new InvalidInput({ fieldErrors: errors })

const endIssue = (startedAt: Instant, endedAt: Instant, now: Instant): ValidationIssue | null =>
  validateEndAfterStart(startedAt, endedAt) ??
  validateNotInFuture(endedAt, now) ??
  (endedAt - startedAt > MAX_SEGMENT_MS ? "out_of_range" : null)

export const segmentErrors = (calendar: Calendar, segment: Span, now: Instant, prefix: string): FieldError[] => [
  ...errorAt(`${prefix}startedAt`, timeIssue(calendar, segment.startedAt, now)),
  ...errorAt(`${prefix}endedAt`, segment.endedAt === null ? null : endIssue(segment.startedAt, segment.endedAt, now)),
]

export const portionErrors = (calendar: Calendar, portion: PortionEntry, now: Instant, prefix: string): FieldError[] =>
  errorAt(`${prefix}occurredAt`, timeIssue(calendar, portion.occurredAt, now))

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

const spanOf = (feed: Feed, now: Instant): Interval => ({ start: feed.startedAt, end: feed.endedAt ?? now })

export const feedChanges = (calendar: Calendar, before: Feed | null, after: Feed | null, now: Instant): Changed =>
  changedKeys(calendar, before === null ? null : spanOf(before, now), after === null ? null : spanOf(after, now))
