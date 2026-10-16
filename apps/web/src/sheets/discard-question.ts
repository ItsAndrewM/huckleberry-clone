import type { Action } from "../api/actions.ts"
import { SIDE_NAMES } from "../sides.ts"
import { type Household, timeOf } from "./failure.ts"
import type { Sending } from "./sending.ts"

const LOST = {
  logDiaper: "this entry",
  editDiaper: "your changes",
  deleteDiaper: "the delete",
  restoreDiaper: "the restore",
  logFeed: "this entry",
  startFeed: "this entry",
  switchSide: "the switch",
  pauseFeed: "the pause",
  resumeFeed: "resuming",
  addBottle: "this entry",
  finishFeed: "the finish",
  editFeed: "your changes",
  editSegment: "your changes",
  deleteFeed: "the delete",
  deletePortion: "the delete",
  editPortion: "your changes",
  restoreFeed: "the restore",
  logMeasurement: "this entry",
  editMeasurement: "your changes",
  deleteMeasurement: "the delete",
  restoreMeasurement: "the restore",
  logSleep: "this entry",
  startSleep: "this entry",
  wakeSleep: "the wake-up",
  editSleep: "your changes",
  deleteSleep: "the delete",
  restoreSleep: "the restore",
  logDose: "this entry",
  editDose: "your changes",
  deleteDose: "the delete",
  restoreDose: "the restore",
} as const satisfies Record<Action["kind"], string>

const TAPPED = new Set<Action["kind"]>(["switchSide", "pauseFeed", "resumeFeed", "finishFeed", "wakeSleep"])

const lostWith = (action: Action) =>
  action.kind === "resumeFeed" ? `resuming on ${SIDE_NAMES[action.payload.side]}` : LOST[action.kind]

const tappedAt = (action: Action) =>
  TAPPED.has(action.kind) && "occurredAt" in action.payload ? action.payload.occurredAt : null

export const discardQuestion = ({ action }: Sending, household: Household | null) => {
  const at = tappedAt(action)
  const when = at === null || household === null ? "" : ` at ${timeOf(household, at)}`
  return `Discard ${lostWith(action)}${when}?`
}
