import {
  type Feed,
  FeedConflict,
  type FeedMove,
  type InvalidInput,
  type NotFound,
  queryKeys,
  type VersionedAction,
} from "@bt/contracts"
import { validateNotInFuture } from "@bt/domain"
import { calendarOf, timeIssue } from "../calendar.ts"
import type { CoreResult, Stamp } from "../receipts.ts"
import {
  activeFeed,
  deletedAsItStands,
  errorAt,
  feedChanges,
  feedFor,
  invalidUnless,
  latestOf,
  NO_EXCLUSION,
  overlapConflict,
  overlappedFeed,
  savedFeed,
} from "./rules.ts"
import { saveFeed, shiftFeed } from "./store.ts"

const shiftedSegments = (feed: Feed, offset: number) =>
  feed.segments.map((segment) => ({
    startedAt: segment.startedAt + offset,
    endedAt: segment.endedAt === null ? null : segment.endedAt + offset,
  }))

export const moveFeed =
  (stamp: Stamp, id: string, move: FeedMove) =>
  (sql: SqlStorage): CoreResult<Feed, InvalidInput | NotFound | FeedConflict> => {
    const found = feedFor(sql, id, move.version, "live")
    if (!found.ok) return found
    const { feed } = found
    const offset = move.startedAt - feed.startedAt
    const calendar = calendarOf(sql)
    const latest = latestOf(feed) + offset
    const issue = timeIssue(calendar, move.startedAt, stamp.now) ?? validateNotInFuture(latest, stamp.now)
    const invalid = invalidUnless(errorAt("startedAt", issue))
    if (invalid !== null) return { ok: false, error: invalid }
    const moved = shiftedSegments(feed, offset)
    const overlapped = overlappedFeed(sql, moved, stamp.now, { feedId: feed.id, segmentId: null })
    if (overlapped !== undefined) return { ok: false, error: overlapConflict(overlapped) }
    shiftFeed(sql, stamp, feed.id, offset)
    return savedFeed(calendar, feed, saveFeed(sql, stamp, feed), stamp.now)
  }

export const deleteFeed =
  (stamp: Stamp, id: string, action: VersionedAction) =>
  (sql: SqlStorage): CoreResult<Feed, NotFound | FeedConflict> => {
    const found = feedFor(sql, id, action.version, "live")
    if (!found.ok) return found
    return deletedAsItStands(sql, stamp, calendarOf(sql), found.feed)
  }

export const restoreFeed =
  (stamp: Stamp, id: string, action: VersionedAction) =>
  (sql: SqlStorage): CoreResult<Feed, InvalidInput | NotFound | FeedConflict> => {
    const found = feedFor(sql, id, action.version, "deleted")
    if (!found.ok) return found
    const { feed } = found
    const calendar = calendarOf(sql)
    const invalid = invalidUnless(errorAt("startedAt", timeIssue(calendar, feed.startedAt, stamp.now)))
    if (invalid !== null) return { ok: false, error: invalid }
    const active = feed.status === "active" ? activeFeed(sql) : undefined
    if (active !== undefined) {
      return { ok: false, error: new FeedConflict({ code: "FEED_ALREADY_ACTIVE", current: active }) }
    }
    const overlapped = overlappedFeed(sql, feed.segments, stamp.now, NO_EXCLUSION)
    if (overlapped !== undefined) return { ok: false, error: overlapConflict(overlapped) }
    const restored = saveFeed(sql, stamp, { ...feed, deletedAt: null })
    const changed = [...feedChanges(calendar, null, restored, stamp.now), queryKeys.deleted]
    return { ok: true, response: restored, changed }
  }
