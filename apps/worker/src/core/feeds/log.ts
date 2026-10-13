import { type Feed, type FeedConflict, InvalidInput, type NewFeed, type SegmentEntry } from "@bt/contracts"
import { type Instant, overlaps } from "@bt/domain"
import { type Calendar, calendarOf } from "../calendar.ts"
import type { CoreResult, Stamp } from "../receipts.ts"
import {
  feedChanges,
  invalidUnless,
  NO_EXCLUSION,
  overlapConflict,
  overlappedFeed,
  portionErrors,
  segmentErrors,
} from "./rules.ts"
import { createFeed } from "./store.ts"

const intervalOf = (segment: SegmentEntry) => ({ start: segment.startedAt, end: segment.endedAt })

const overlapEachOther = (segments: ReadonlyArray<SegmentEntry>) =>
  segments.some((first, index) =>
    segments.slice(index + 1).some((second) => overlaps(intervalOf(first), intervalOf(second))),
  )

export const invalidParts = (
  calendar: Calendar,
  entry: Pick<NewFeed, "segments" | "portions">,
  now: Instant,
): InvalidInput | null => {
  const invalid = invalidUnless([
    ...entry.segments.flatMap((segment, index) => segmentErrors(calendar, segment, now, `segments.${index}.`)),
    ...entry.portions.flatMap((portion, index) => portionErrors(calendar, portion, now, `portions.${index}.`)),
  ])
  if (invalid !== null || !overlapEachOther(entry.segments)) return invalid
  return new InvalidInput({ fieldErrors: [{ path: "segments", issue: "invalid" }] })
}

export const logFeed =
  (stamp: Stamp, entry: NewFeed) =>
  (sql: SqlStorage): CoreResult<Feed, InvalidInput | FeedConflict> => {
    const calendar = calendarOf(sql)
    const invalid = invalidParts(calendar, entry, stamp.now)
    if (invalid !== null) return { ok: false, error: invalid }
    const overlapped = overlappedFeed(sql, entry.segments, stamp.now, NO_EXCLUSION)
    if (overlapped !== undefined) return { ok: false, error: overlapConflict(overlapped) }
    const feed = createFeed(sql, stamp, "completed", entry.segments, entry.portions)
    return { ok: true, response: feed, changed: feedChanges(calendar, null, feed, stamp.now) }
  }
