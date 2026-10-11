import type { Feed, NursingSegment, Side } from "@bt/contracts"
import type { FeedAction } from "../../api/actions.ts"
import { isPending, isSaving } from "../../api/pending.ts"
import type { Sending } from "../../sheets/sending.ts"

export type NursingState =
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | { readonly kind: "running"; readonly feed: Feed; readonly segment: NursingSegment }
  | { readonly kind: "paused"; readonly feed: Feed; readonly lastSide: Side | null }

const lastSideOf = (feed: Feed): Side | null =>
  feed.segments.toSorted((a, b) => a.startedAt - b.startedAt).at(-1)?.side ?? null

export const nursingState = (active: Feed | null): NursingState => {
  if (active === null) return { kind: "idle" }
  if (isPending(active.id)) return { kind: "starting" }
  const segment = active.segments.find((candidate) => candidate.endedAt === null)
  return segment === undefined
    ? { kind: "paused", feed: active, lastSide: lastSideOf(active) }
    : { kind: "running", feed: active, segment }
}

export const controlsWait = (busy: Sending | null, feed: Feed) => busy?.sheet === "nursing" || isSaving(feed)

export const timedAction = (kind: "switchSide" | "pauseFeed", feed: Feed, occurredAt: number): FeedAction => ({
  kind,
  id: feed.id,
  payload: { actionId: crypto.randomUUID(), version: feed.version, occurredAt },
})

export const resumeAction = (feed: Feed, side: Side, occurredAt: number): FeedAction => ({
  kind: "resumeFeed",
  id: feed.id,
  payload: { actionId: crypto.randomUUID(), version: feed.version, side, occurredAt },
})

export const finishAction = (feed: Feed, occurredAt: number, deleteIfEmpty: boolean): FeedAction => ({
  kind: "finishFeed",
  id: feed.id,
  payload: { actionId: crypto.randomUUID(), version: feed.version, occurredAt, deleteIfEmpty },
})
