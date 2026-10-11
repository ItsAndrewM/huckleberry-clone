import {
  ComponentDelete,
  DiaperEdit,
  FeedFinish,
  FeedResume,
  FeedStart,
  NewDiaper,
  NewFeed,
  TimedAction,
  VersionedAction,
  VersionedPortion,
} from "@bt/contracts"
import { Schema } from "effect"

const onRecord = <const Kind extends string, Payload extends Schema.Top>(kind: Kind, payload: Payload) =>
  Schema.Struct({ kind: Schema.Literal(kind), id: Schema.String, payload })

const created = <const Kind extends string, Payload extends Schema.Top>(kind: Kind, payload: Payload) =>
  Schema.Struct({ kind: Schema.Literal(kind), payload })

export const DiaperAction = Schema.Union([
  created("logDiaper", NewDiaper),
  onRecord("editDiaper", DiaperEdit),
  onRecord("deleteDiaper", VersionedAction),
])
export type DiaperAction = typeof DiaperAction.Type

export const FeedAction = Schema.Union([
  created("logFeed", NewFeed),
  created("startFeed", FeedStart),
  onRecord("switchSide", TimedAction),
  onRecord("pauseFeed", TimedAction),
  onRecord("resumeFeed", FeedResume),
  onRecord("addBottle", VersionedPortion),
  onRecord("finishFeed", FeedFinish),
  onRecord("deleteFeed", VersionedAction),
  onRecord("deletePortion", ComponentDelete),
  onRecord("editPortion", VersionedPortion),
])
export type FeedAction = typeof FeedAction.Type

export const Action = Schema.Union([DiaperAction, FeedAction])
export type Action = typeof Action.Type

export const isDiaperAction = (action: Action): action is DiaperAction =>
  action.kind === "logDiaper" || action.kind === "editDiaper" || action.kind === "deleteDiaper"
