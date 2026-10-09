import {
  type Feed,
  FeedConflict,
  type FeedFinish,
  type FeedResume,
  type FeedStart,
  type InvalidInput,
  type NotFound,
  type NursingSegment,
  type TimedAction,
  type VersionedPortion,
} from "@bt/contracts"
import { type Instant, type ValidationIssue, validateEndAfterStart, validateNotInFuture } from "@bt/domain"
import { type Calendar, calendarOf, timeIssue } from "../calendar.ts"
import type { CoreResult, Stamp } from "../receipts.ts"
import {
  activeFeed,
  errorAt,
  feedFor,
  invalidUnless,
  NO_EXCLUSION,
  onlyComponent,
  overlapConflict,
  overlappedFeed,
  portionErrors,
  runningFeedFor,
  runningSegment,
  savedFeed,
  whenEmptied,
} from "./rules.ts"
import { closeSegment, createFeed, insertPortion, insertSegment, removeSegment, saveFeed } from "./store.ts"

type Failure = InvalidInput | NotFound | FeedConflict

const OTHER_SIDE = { left: "right", right: "left" } as const

const closeIssue = (open: NursingSegment, at: Instant, now: Instant): ValidationIssue | null =>
  validateEndAfterStart(open.startedAt, at) ?? validateNotInFuture(at, now)

const finishIssue = (open: NursingSegment, at: Instant, now: Instant): ValidationIssue | null =>
  at < open.startedAt ? "end_not_after_start" : validateNotInFuture(at, now)

export const startFeed =
  (stamp: Stamp, start: FeedStart) =>
  (sql: SqlStorage): CoreResult<Feed, InvalidInput | FeedConflict> => {
    const calendar = calendarOf(sql)
    const invalid = invalidUnless(errorAt("startedAt", timeIssue(calendar, start.startedAt, stamp.now)))
    if (invalid !== null) return { ok: false, error: invalid }
    const active = activeFeed(sql)
    if (active !== undefined) {
      return { ok: false, error: new FeedConflict({ code: "FEED_ALREADY_ACTIVE", current: active }) }
    }
    const opened = { side: start.side, startedAt: start.startedAt, endedAt: null }
    const overlapped = overlappedFeed(sql, [opened], stamp.now, NO_EXCLUSION)
    if (overlapped !== undefined) return { ok: false, error: overlapConflict(overlapped) }
    return savedFeed(calendar, null, createFeed(sql, stamp, "active", [opened], []), stamp.now)
  }

export const switchSide =
  (stamp: Stamp, id: string, action: TimedAction) =>
  (sql: SqlStorage): CoreResult<Feed, Failure> => {
    const found = runningFeedFor(sql, id, action.version)
    if (!found.ok) return found
    const { feed, open } = found
    const invalid = invalidUnless(errorAt("occurredAt", closeIssue(open, action.occurredAt, stamp.now)))
    if (invalid !== null) return { ok: false, error: invalid }
    const opened = { side: OTHER_SIDE[open.side], startedAt: action.occurredAt, endedAt: null }
    const overlapped = overlappedFeed(sql, [opened], stamp.now, { feedId: null, segmentId: open.id })
    if (overlapped !== undefined) return { ok: false, error: overlapConflict(overlapped) }
    closeSegment(sql, stamp, open.id, action.occurredAt)
    insertSegment(sql, stamp, feed.id, opened)
    return savedFeed(calendarOf(sql), feed, saveFeed(sql, stamp, feed), stamp.now)
  }

export const pauseFeed =
  (stamp: Stamp, id: string, action: TimedAction) =>
  (sql: SqlStorage): CoreResult<Feed, Failure> => {
    const found = runningFeedFor(sql, id, action.version)
    if (!found.ok) return found
    const invalid = invalidUnless(errorAt("occurredAt", closeIssue(found.open, action.occurredAt, stamp.now)))
    if (invalid !== null) return { ok: false, error: invalid }
    closeSegment(sql, stamp, found.open.id, action.occurredAt)
    return savedFeed(calendarOf(sql), found.feed, saveFeed(sql, stamp, found.feed), stamp.now)
  }

export const resumeFeed =
  (stamp: Stamp, id: string, action: FeedResume) =>
  (sql: SqlStorage): CoreResult<Feed, Failure> => {
    const found = feedFor(sql, id, action.version, "paused")
    if (!found.ok) return found
    const calendar = calendarOf(sql)
    const invalid = invalidUnless(errorAt("occurredAt", timeIssue(calendar, action.occurredAt, stamp.now)))
    if (invalid !== null) return { ok: false, error: invalid }
    const opened = { side: action.side, startedAt: action.occurredAt, endedAt: null }
    const overlapped = overlappedFeed(sql, [opened], stamp.now, NO_EXCLUSION)
    if (overlapped !== undefined) return { ok: false, error: overlapConflict(overlapped) }
    insertSegment(sql, stamp, found.feed.id, opened)
    return savedFeed(calendar, found.feed, saveFeed(sql, stamp, found.feed), stamp.now)
  }

export const addBottle =
  (stamp: Stamp, id: string, portion: VersionedPortion) =>
  (sql: SqlStorage): CoreResult<Feed, Failure> => {
    const found = feedFor(sql, id, portion.version, "active")
    if (!found.ok) return found
    const calendar = calendarOf(sql)
    const invalid = invalidUnless(portionErrors(calendar, portion, stamp.now, ""))
    if (invalid !== null) return { ok: false, error: invalid }
    insertPortion(sql, stamp, found.feed.id, portion)
    return savedFeed(calendar, found.feed, saveFeed(sql, stamp, found.feed), stamp.now)
  }

const completed = (sql: SqlStorage, stamp: Stamp, calendar: Calendar, feed: Feed) =>
  savedFeed(calendar, feed, saveFeed(sql, stamp, { ...feed, status: "completed" }), stamp.now)

const finishRunning = (
  sql: SqlStorage,
  stamp: Stamp,
  calendar: Calendar,
  feed: Feed,
  open: NursingSegment,
  finish: FeedFinish,
): CoreResult<Feed, Failure> => {
  const invalid = invalidUnless(errorAt("occurredAt", finishIssue(open, finish.occurredAt, stamp.now)))
  if (invalid !== null) return { ok: false, error: invalid }
  if (finish.occurredAt > open.startedAt) closeSegment(sql, stamp, open.id, finish.occurredAt)
  else if (onlyComponent(feed)) return whenEmptied(sql, stamp, calendar, feed, finish.deleteIfEmpty)
  else removeSegment(sql, stamp, open.id)
  return completed(sql, stamp, calendar, feed)
}

export const finishFeed =
  (stamp: Stamp, id: string, finish: FeedFinish) =>
  (sql: SqlStorage): CoreResult<Feed, Failure> => {
    const found = feedFor(sql, id, finish.version, "active")
    if (!found.ok) return found
    const calendar = calendarOf(sql)
    const open = runningSegment(found.feed)
    if (open === undefined) return completed(sql, stamp, calendar, found.feed)
    return finishRunning(sql, stamp, calendar, found.feed, open, finish)
  }
