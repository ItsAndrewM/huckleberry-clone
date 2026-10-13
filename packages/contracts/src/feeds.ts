import { validateVolumeMl } from "@bt/domain"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { ActionId } from "./action-id.ts"
import { Conflict, InvalidInput, NotFound } from "./errors.ts"
import { Changed } from "./query-keys.ts"
import { Instant } from "./time.ts"
import { Version, VersionedAction } from "./version.ts"

export const MAX_BOTTLE_ML = 500
export const MAX_SEGMENT_MS = 4 * 60 * 60 * 1000
export const MAX_FEED_COMPONENTS = 20

export const Side = Schema.Literals(["left", "right"])
export type Side = typeof Side.Type

const inTenths = Schema.makeFilter((ml: number) => ml === 0 || validateVolumeMl(ml) === null, {
  expected: "a volume in mL with at most one decimal",
})

export const Millilitres = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: MAX_BOTTLE_ML }), inTenths)

export const NursingSegment = Schema.Struct({
  id: Schema.String,
  side: Side,
  startedAt: Instant,
  endedAt: Schema.NullOr(Instant),
})
export type NursingSegment = typeof NursingSegment.Type

export const BottlePortion = Schema.Struct({
  id: Schema.String,
  occurredAt: Instant,
  breastMilkMl: Millilitres,
  formulaMl: Millilitres,
})
export type BottlePortion = typeof BottlePortion.Type

export const FeedStatus = Schema.Literals(["active", "completed"])
export type FeedStatus = typeof FeedStatus.Type

export const Feed = Schema.Struct({
  id: Schema.String,
  status: FeedStatus,
  startedAt: Instant,
  endedAt: Schema.NullOr(Instant),
  segments: Schema.Array(NursingSegment),
  portions: Schema.Array(BottlePortion),
  version: Version,
  createdBy: Schema.String,
  createdAt: Instant,
  updatedBy: Schema.String,
  updatedAt: Instant,
  deletedAt: Schema.NullOr(Instant),
})
export type Feed = typeof Feed.Type

const SOME_MILK = "a bottle with some breast milk or formula in it"

const someMilk = Schema.makeFilter(
  ({ breastMilkMl, formulaMl }: { readonly breastMilkMl: number; readonly formulaMl: number }) =>
    breastMilkMl + formulaMl > 0 || [
      { path: ["breastMilkMl"], issue: SOME_MILK },
      { path: ["formulaMl"], issue: SOME_MILK },
    ],
  { expected: SOME_MILK },
)

const portionFields = { occurredAt: Instant, breastMilkMl: Millilitres, formulaMl: Millilitres }

export const SegmentEntry = Schema.Struct({ side: Side, startedAt: Instant, endedAt: Instant })
export type SegmentEntry = typeof SegmentEntry.Type

export const PortionEntry = Schema.Struct(portionFields).check(someMilk)
export type PortionEntry = typeof PortionEntry.Type

const SOME_COMPONENT = "a feed with at least one nursing segment or bottle"

interface Components {
  readonly segments: ReadonlyArray<SegmentEntry>
  readonly portions: ReadonlyArray<PortionEntry>
}

const someComponent = Schema.makeFilter(
  ({ segments, portions }: Components) =>
    segments.length + portions.length > 0 || [
      { path: ["segments"], issue: SOME_COMPONENT },
      { path: ["portions"], issue: SOME_COMPONENT },
    ],
  { expected: SOME_COMPONENT },
)

const components = {
  segments: Schema.Array(SegmentEntry).check(Schema.isMaxLength(MAX_FEED_COMPONENTS)),
  portions: Schema.Array(PortionEntry).check(Schema.isMaxLength(MAX_FEED_COMPONENTS)),
}

export const NewFeed = Schema.Struct({ actionId: ActionId, ...components }).check(someComponent)
export type NewFeed = typeof NewFeed.Type

export const FeedEdit = Schema.Struct({ actionId: ActionId, version: Version, ...components }).check(someComponent)
export type FeedEdit = typeof FeedEdit.Type

export const FeedStart = Schema.Struct({ actionId: ActionId, side: Side, startedAt: Instant })
export type FeedStart = typeof FeedStart.Type

export const TimedAction = Schema.Struct({ actionId: ActionId, version: Version, occurredAt: Instant })
export type TimedAction = typeof TimedAction.Type

export const FeedResume = Schema.Struct({ actionId: ActionId, version: Version, side: Side, occurredAt: Instant })
export type FeedResume = typeof FeedResume.Type

export const FeedFinish = Schema.Struct({
  actionId: ActionId,
  version: Version,
  occurredAt: Instant,
  deleteIfEmpty: Schema.Boolean,
})
export type FeedFinish = typeof FeedFinish.Type

export const VersionedPortion = Schema.Struct({ actionId: ActionId, version: Version, ...portionFields }).check(
  someMilk,
)
export type VersionedPortion = typeof VersionedPortion.Type

export const FeedMove = Schema.Struct({ actionId: ActionId, version: Version, startedAt: Instant })
export type FeedMove = typeof FeedMove.Type

export const SegmentEdit = Schema.Struct({
  actionId: ActionId,
  version: Version,
  side: Side,
  startedAt: Instant,
  endedAt: Schema.NullOr(Instant),
})
export type SegmentEdit = typeof SegmentEdit.Type

export const ComponentDelete = Schema.Struct({ actionId: ActionId, version: Version, deleteIfEmpty: Schema.Boolean })
export type ComponentDelete = typeof ComponentDelete.Type

export const SavedFeed = Schema.Struct({ feed: Feed, changed: Changed })
export type SavedFeed = typeof SavedFeed.Type

export class FeedConflict extends Conflict<FeedConflict>()(
  "FeedConflict",
  ["FEED_ALREADY_ACTIVE", "SEGMENT_OVERLAP", "FEED_EMPTY", "STALE_VERSION", "ACTION_REPLAY_MISMATCH"],
  Feed,
) {}

const byId = { id: Schema.String }
const created = SavedFeed.pipe(HttpApiSchema.status(201))
const onFeed = { params: byId, success: SavedFeed, error: [InvalidInput, NotFound, FeedConflict] }

export class FeedsGroup extends HttpApiGroup.make("feeds")
  .add(
    HttpApiEndpoint.post("logFeed", "/feeds", {
      payload: NewFeed,
      success: created,
      error: [InvalidInput, FeedConflict],
    }),
  )
  .add(
    HttpApiEndpoint.post("startFeed", "/feeds/start", {
      payload: FeedStart,
      success: created,
      error: [InvalidInput, FeedConflict],
    }),
  )
  .add(HttpApiEndpoint.post("switchSide", "/feeds/:id/switch", { ...onFeed, payload: TimedAction }))
  .add(HttpApiEndpoint.post("pauseFeed", "/feeds/:id/pause", { ...onFeed, payload: TimedAction }))
  .add(HttpApiEndpoint.post("resumeFeed", "/feeds/:id/resume", { ...onFeed, payload: FeedResume }))
  .add(HttpApiEndpoint.post("addBottle", "/feeds/:id/bottle", { ...onFeed, payload: VersionedPortion }))
  .add(HttpApiEndpoint.post("finishFeed", "/feeds/:id/finish", { ...onFeed, payload: FeedFinish }))
  .add(HttpApiEndpoint.patch("moveFeed", "/feeds/:id", { ...onFeed, payload: FeedMove }))
  .add(HttpApiEndpoint.put("editFeed", "/feeds/:id", { ...onFeed, payload: FeedEdit }))
  .add(HttpApiEndpoint.delete("deleteFeed", "/feeds/:id", { ...onFeed, payload: VersionedAction }))
  .add(HttpApiEndpoint.post("restoreFeed", "/feeds/:id/restore", { ...onFeed, payload: VersionedAction })) {}

export class SegmentsGroup extends HttpApiGroup.make("segments")
  .add(HttpApiEndpoint.patch("editSegment", "/segments/:id", { ...onFeed, payload: SegmentEdit }))
  .add(HttpApiEndpoint.delete("deleteSegment", "/segments/:id", { ...onFeed, payload: ComponentDelete })) {}

export class PortionsGroup extends HttpApiGroup.make("portions")
  .add(HttpApiEndpoint.patch("editPortion", "/portions/:id", { ...onFeed, payload: VersionedPortion }))
  .add(HttpApiEndpoint.delete("deletePortion", "/portions/:id", { ...onFeed, payload: ComponentDelete })) {}
