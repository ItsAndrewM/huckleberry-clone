import type { Diaper, Feed, FeedStart, NewDiaper, NewFeed, VersionedPortion } from "@bt/contracts"
import { type Instant, sessionBounds } from "@bt/domain"

export interface Author {
  readonly by: string
  readonly now: Instant
}

const PENDING = "pending:"

export const pendingId = (actionId: string) => `${PENDING}${actionId}`

export const isPending = (id: string) => id.startsWith(PENDING)

const audit = ({ by, now }: Author) => ({
  version: 1,
  createdBy: by,
  createdAt: now,
  updatedBy: by,
  updatedAt: now,
  deletedAt: null,
})

export const pendingDiaper = ({ actionId, occurredAt, wet, dirty }: NewDiaper, author: Author): Diaper => ({
  id: pendingId(actionId),
  occurredAt,
  wet,
  dirty,
  ...audit(author),
})

export const pendingFeed = ({ actionId, segments, portions }: NewFeed, author: Author): Feed => {
  const id = pendingId(actionId)
  const parts = {
    segments: segments.map((segment, index) => ({ id: `${id}:segment:${index}`, ...segment })),
    portions: portions.map((portion, index) => ({ id: `${id}:portion:${index}`, ...portion })),
  }
  const bounds = sessionBounds(parts)
  const startedAt = bounds?.startedAt ?? author.now
  return { id, status: "completed", startedAt, endedAt: bounds?.endedAt ?? startedAt, ...parts, ...audit(author) }
}

export const startedFeed = ({ actionId, side, startedAt }: FeedStart, author: Author): Feed => {
  const id = pendingId(actionId)
  return {
    id,
    status: "active",
    startedAt,
    endedAt: null,
    segments: [{ id: `${id}:segment:0`, side, startedAt, endedAt: null }],
    portions: [],
    ...audit(author),
  }
}

export const withBottle = (feed: Feed, { actionId, occurredAt, breastMilkMl, formulaMl }: VersionedPortion): Feed => ({
  ...feed,
  portions: [...feed.portions, { id: pendingId(actionId), occurredAt, breastMilkMl, formulaMl }],
})
