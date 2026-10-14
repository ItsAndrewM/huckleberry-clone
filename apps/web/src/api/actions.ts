import {
  ComponentDelete,
  DiaperEdit,
  DoseEdit,
  FeedEdit,
  FeedFinish,
  FeedResume,
  FeedStart,
  MeasurementEdit,
  NewDiaper,
  NewDose,
  NewFeed,
  NewMeasurement,
  NewSleep,
  SegmentEdit,
  Side,
  SleepEdit,
  SleepStart,
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
  onRecord("editFeed", FeedEdit),
  onRecord("editSegment", SegmentEdit),
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

export const SleepAction = Schema.Union([
  created("logSleep", NewSleep),
  created("startSleep", SleepStart),
  onRecord("wakeSleep", TimedAction),
  onRecord("editSleep", SleepEdit),
  onRecord("deleteSleep", VersionedAction),
  onRecord("restoreSleep", VersionedAction),
])
export type SleepAction = typeof SleepAction.Type

export const DoseAction = Schema.Union([
  created("logDose", NewDose),
  onRecord("editDose", DoseEdit),
  onRecord("deleteDose", VersionedAction),
  onRecord("restoreDose", VersionedAction),
])
export type DoseAction = typeof DoseAction.Type

export const Action = Schema.Union([DiaperAction, FeedAction, MeasurementAction, SleepAction, DoseAction])
export type Action = typeof Action.Type

const DOSE_KINDS = new Set<Action["kind"]>(["logDose", "editDose", "deleteDose", "restoreDose"])

export const isDoseAction = (action: Action): action is DoseAction => DOSE_KINDS.has(action.kind)

const DIAPER_KINDS = new Set<Action["kind"]>(["logDiaper", "editDiaper", "deleteDiaper", "restoreDiaper"])

const MEASUREMENT_KINDS = new Set<Action["kind"]>([
  "logMeasurement",
  "editMeasurement",
  "deleteMeasurement",
  "restoreMeasurement",
])

export const isDiaperAction = (action: Action): action is DiaperAction => DIAPER_KINDS.has(action.kind)

export const isMeasurementAction = (action: Action): action is MeasurementAction => MEASUREMENT_KINDS.has(action.kind)

const SLEEP_KINDS = new Set<Action["kind"]>([
  "logSleep",
  "startSleep",
  "wakeSleep",
  "editSleep",
  "deleteSleep",
  "restoreSleep",
])

export const isSleepAction = (action: Action): action is SleepAction => SLEEP_KINDS.has(action.kind)
