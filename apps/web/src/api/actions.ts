import {
  ComponentDelete,
  FeedFinish,
  FeedResume,
  FeedStart,
  MeasurementEdit,
  NewDiaper,
  NewFeed,
  NewMeasurement,
  TimedAction,
  VersionedAction,
  VersionedPortion,
} from "@bt/contracts"
import { Schema } from "effect"

const onRecord = <const Kind extends string, Payload extends Schema.Top>(kind: Kind, payload: Payload) =>
  Schema.Struct({ kind: Schema.Literal(kind), id: Schema.String, payload })

const created = <const Kind extends string, Payload extends Schema.Top>(kind: Kind, payload: Payload) =>
  Schema.Struct({ kind: Schema.Literal(kind), payload })

export const DiaperAction = Schema.Union([created("logDiaper", NewDiaper), onRecord("deleteDiaper", VersionedAction)])
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
])
export type FeedAction = typeof FeedAction.Type

export const MeasurementAction = Schema.Union([
  created("logMeasurement", NewMeasurement),
  onRecord("editMeasurement", MeasurementEdit),
  onRecord("deleteMeasurement", VersionedAction),
])
export type MeasurementAction = typeof MeasurementAction.Type

export const Action = Schema.Union([DiaperAction, FeedAction, MeasurementAction])
export type Action = typeof Action.Type

export const isDiaperAction = (action: Action): action is DiaperAction =>
  action.kind === "logDiaper" || action.kind === "deleteDiaper"

export const isMeasurementAction = (action: Action): action is MeasurementAction =>
  action.kind === "logMeasurement" || action.kind === "editMeasurement" || action.kind === "deleteMeasurement"
