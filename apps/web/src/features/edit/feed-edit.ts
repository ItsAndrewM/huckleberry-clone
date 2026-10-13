import type { Feed, RecentEntry } from "@bt/contracts"
import type { FeedAction } from "../../api/actions.ts"
import type { Failed } from "../../sheets/sending.ts"
import type { Target } from "./diaper-edit.ts"
import { draftOf, type FeedDraft, type Parts, partsOf } from "./feed-draft.ts"

export interface FeedEditSession {
  readonly actionId: string
  readonly target: Target
  readonly draft: FeedDraft
}

export const feedEditSession = (failed: Failed | null, feed: Feed, zone: string): FeedEditSession => {
  const action = failed?.sending.action
  if (action?.kind === "editFeed") {
    const { actionId, version } = action.payload
    return { actionId, target: { id: action.id, version }, draft: draftOf(action.payload, zone) }
  }
  const target = { id: feed.id, version: feed.version }
  return { actionId: crypto.randomUUID(), target, draft: draftOf(partsOf(feed), zone) }
}

export const feedEdit = ({ actionId, target }: FeedEditSession, parts: Parts): FeedAction => ({
  kind: "editFeed",
  id: target.id,
  payload: { actionId, version: target.version, segments: parts.segments, portions: parts.portions },
})

export const feedDelete = ({ id, version }: Target): FeedAction => ({
  kind: "deleteFeed",
  id,
  payload: { actionId: crypto.randomUUID(), version },
})

export const feedNoun = (feed: Feed) => (feed.segments.length === 0 && feed.portions.length === 1 ? "bottle" : "feed")

export const editFeedTitle = (entry: RecentEntry | null) =>
  entry?.kind === "feed" && feedNoun(entry.feed) === "bottle" ? "Edit bottle" : "Edit feed"
