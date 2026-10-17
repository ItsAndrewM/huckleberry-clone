import type { Action } from "../api/actions.ts"
import { SIDE_NAMES } from "../sides.ts"

export const YOUR_CHANGES = "your changes"

const LOST = {
  logDiaper: "this entry",
  editDiaper: YOUR_CHANGES,
  deleteDiaper: "the delete",
  restoreDiaper: "the restore",
  logFeed: "this entry",
  startFeed: "this entry",
  switchSide: "the switch",
  pauseFeed: "the pause",
  resumeFeed: "resuming",
  addBottle: "this entry",
  finishFeed: "the finish",
  editFeed: YOUR_CHANGES,
  editSegment: YOUR_CHANGES,
  deleteFeed: "the delete",
  deletePortion: "the delete",
  editPortion: YOUR_CHANGES,
  restoreFeed: "the restore",
  logMeasurement: "this entry",
  editMeasurement: YOUR_CHANGES,
  deleteMeasurement: "the delete",
  restoreMeasurement: "the restore",
  logSleep: "this entry",
  startSleep: "this entry",
  wakeSleep: "the wake-up",
  editSleep: YOUR_CHANGES,
  deleteSleep: "the delete",
  restoreSleep: "the restore",
  logDose: "this entry",
  editDose: YOUR_CHANGES,
  deleteDose: "the delete",
  restoreDose: "the restore",
} as const satisfies Record<Action["kind"], string>

const TAPPED = new Set<Action["kind"]>(["switchSide", "pauseFeed", "resumeFeed", "finishFeed", "wakeSleep"])

export const lostWith = (action: Action) =>
  action.kind === "resumeFeed" ? `resuming on ${SIDE_NAMES[action.payload.side]}` : LOST[action.kind]

export const tappedAt = (action: Action) =>
  TAPPED.has(action.kind) && "occurredAt" in action.payload ? action.payload.occurredAt : null
