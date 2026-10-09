import {
  Api,
  ComponentDelete,
  Feed,
  FeedConflict,
  FeedFinish,
  FeedMove,
  FeedResume,
  FeedStart,
  NewFeed,
  SegmentEdit,
  TimedAction,
  VersionedAction,
  VersionedPortion,
} from "@bt/contracts"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { deletePortion, deleteSegment, editPortion, editSegment } from "./core/feeds/components.ts"
import { deleteFeed, moveFeed, restoreFeed } from "./core/feeds/feed-edits.ts"
import { addBottle, finishFeed, pauseFeed, resumeFeed, startFeed, switchSide } from "./core/feeds/lifecycle.ts"
import { logFeed } from "./core/feeds/log.ts"
import { mutations, type Saved } from "./mutations.ts"

const asSavedFeed = Effect.map(({ record, changed }: Saved<Feed>) => ({ feed: record, changed }))

export const feedHandlers = (storage: DurableObjectStorage) => {
  const mutate = mutations(
    storage,
    Feed,
    (saved) => new FeedConflict({ code: "ACTION_REPLAY_MISMATCH", current: saved }),
  )
  const feeds = HttpApiBuilder.group(Api, "feeds", (handlers) =>
    handlers
      .handle("logFeed", ({ payload, request }) =>
        mutate(request, NewFeed, payload, (stamp) => logFeed(stamp, payload)).pipe(asSavedFeed),
      )
      .handle("startFeed", ({ payload, request }) =>
        mutate(request, FeedStart, payload, (stamp) => startFeed(stamp, payload)).pipe(asSavedFeed),
      )
      .handle("switchSide", ({ params, payload, request }) =>
        mutate(request, TimedAction, payload, (stamp) => switchSide(stamp, params.id, payload)).pipe(asSavedFeed),
      )
      .handle("pauseFeed", ({ params, payload, request }) =>
        mutate(request, TimedAction, payload, (stamp) => pauseFeed(stamp, params.id, payload)).pipe(asSavedFeed),
      )
      .handle("resumeFeed", ({ params, payload, request }) =>
        mutate(request, FeedResume, payload, (stamp) => resumeFeed(stamp, params.id, payload)).pipe(asSavedFeed),
      )
      .handle("addBottle", ({ params, payload, request }) =>
        mutate(request, VersionedPortion, payload, (stamp) => addBottle(stamp, params.id, payload)).pipe(asSavedFeed),
      )
      .handle("finishFeed", ({ params, payload, request }) =>
        mutate(request, FeedFinish, payload, (stamp) => finishFeed(stamp, params.id, payload)).pipe(asSavedFeed),
      )
      .handle("moveFeed", ({ params, payload, request }) =>
        mutate(request, FeedMove, payload, (stamp) => moveFeed(stamp, params.id, payload)).pipe(asSavedFeed),
      )
      .handle("deleteFeed", ({ params, payload, request }) =>
        mutate(request, VersionedAction, payload, (stamp) => deleteFeed(stamp, params.id, payload)).pipe(asSavedFeed),
      )
      .handle("restoreFeed", ({ params, payload, request }) =>
        mutate(request, VersionedAction, payload, (stamp) => restoreFeed(stamp, params.id, payload)).pipe(asSavedFeed),
      ),
  )
  const segments = HttpApiBuilder.group(Api, "segments", (handlers) =>
    handlers
      .handle("editSegment", ({ params, payload, request }) =>
        mutate(request, SegmentEdit, payload, (stamp) => editSegment(stamp, params.id, payload)).pipe(asSavedFeed),
      )
      .handle("deleteSegment", ({ params, payload, request }) =>
        mutate(request, ComponentDelete, payload, (stamp) => deleteSegment(stamp, params.id, payload)).pipe(
          asSavedFeed,
        ),
      ),
  )
  const portions = HttpApiBuilder.group(Api, "portions", (handlers) =>
    handlers
      .handle("editPortion", ({ params, payload, request }) =>
        mutate(request, VersionedPortion, payload, (stamp) => editPortion(stamp, params.id, payload)).pipe(asSavedFeed),
      )
      .handle("deletePortion", ({ params, payload, request }) =>
        mutate(request, ComponentDelete, payload, (stamp) => deletePortion(stamp, params.id, payload)).pipe(
          asSavedFeed,
        ),
      ),
  )
  return Layer.mergeAll(feeds, segments, portions)
}
