import {
  ComponentDelete,
  DiaperEdit,
  FeedFinish,
  FeedResume,
  FeedStart,
  MeasurementEdit,
  NewDiaper,
  NewFeed,
  NewMeasurement,
  Side,
  TimedAction,
  VersionedAction,
  VersionedPortion,
} from "@bt/contracts"
import { Schema } from "effect"

const onRecord = <const Kind extends string, Payload extends Schema.Top>(kind: Kind, payload: Payload) =>
  Schema.Struct({ kind: Schema.Literal(kind), id: Schema.String, payload })

const created = <const Kind extends string, Payload extends Schema.Top>(kind: Kind, payload: Payload) =>
  Schema.Struct({ kind: Schema.Literal(kind), payload })

const switching = Schema.Struct({
  kind: Schema.Literal("switchSide"),
  id: Schema.String,
  to: Schema.optionalKey(Side),
  payload: TimedAction,
})

export const DiaperAction = Schema.Union([
  created("logDiaper", NewDiaper),
  onRecord("editDiaper", DiaperEdit),
  onRecord("deleteDiaper", VersionedAction),
  onRecord("restoreDiaper", VersionedAction),
])
export type DiaperAction = typeof DiaperAction.Type

export const FeedAction = Schema.Union([
  created("logFeed", NewFeed),
  created("startFeed", FeedStart),
  switching,
  onRecord("pauseFeed", TimedAction),
  onRecord("resumeFeed", FeedResume),
  onRecord("addBottle", VersionedPortion),
  onRecord("finishFeed", FeedFinish),
  onRecord("deleteFeed", VersionedAction),
  onRecord("deletePortion", ComponentDelete),
  onRecord("editPortion", VersionedPortion),
  onRecord("restoreFeed", VersionedAction),
])
export type FeedAction = typeof FeedAction.Type

export const MeasurementAction = Schema.Union([
  created("logMeasurement", NewMeasurement),
  onRecord("editMeasurement", MeasurementEdit),
  onRecord("deleteMeasurement", VersionedAction),
  onRecord("restoreMeasurement", VersionedAction),
])
export type MeasurementAction = typeof MeasurementAction.Type

export const Action = Schema.Union([DiaperAction, FeedAction, MeasurementAction])
export type Action = typeof Action.Type

const DIAPER_KINDS = new Set<Action["kind"]>(["logDiaper", "editDiaper", "deleteDiaper", "restoreDiaper"])

const MEASUREMENT_KINDS = new Set<Action["kind"]>([
  "logMeasurement",
  "editMeasurement",
  "deleteMeasurement",
  "restoreMeasurement",
])

export const isDiaperAction = (action: Action): action is DiaperAction => DIAPER_KINDS.has(action.kind)

export const isMeasurementAction = (action: Action): action is MeasurementAction => MEASUREMENT_KINDS.has(action.kind)
