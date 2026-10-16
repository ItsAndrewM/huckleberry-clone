import { Schema } from "effect"
import { Action } from "../api/actions.ts"

export const SheetKind = Schema.Literals([
  "diaper",
  "bottle",
  "nursing",
  "pastFeed",
  "measurement",
  "details",
  "logAt",
  "editDiaper",
  "editFeed",
  "sleep",
  "pastSleep",
  "editSleep",
  "dose",
  "editDose",
  "supplement",
  "undo",
])
export type SheetKind = typeof SheetKind.Type

export const Sending = Schema.Struct({ sheet: SheetKind, action: Action })
export type Sending = typeof Sending.Type

export interface Failed {
  readonly sending: Sending
  readonly error: Error
}

export interface Tap {
  readonly at: number
  readonly actionId: string
}

export interface Recovery {
  readonly label: string
  readonly sendingAt: (tap: Tap) => Sending
}

const CLOSES_ON_SEND = new Set<Action["kind"]>([
  "logDiaper",
  "logFeed",
  "startFeed",
  "addBottle",
  "finishFeed",
  "logMeasurement",
  "editMeasurement",
  "deleteMeasurement",
  "deleteDiaper",
  "deleteFeed",
  "logSleep",
  "startSleep",
  "wakeSleep",
  "deleteSleep",
  "logDose",
  "deleteDose",
])

const CLOSES_ON_SAVE = new Set<Action["kind"]>(["editDiaper", "editPortion", "editFeed"])

const savesAPastSleep = ({ sheet, action }: Sending) => sheet === "pastSleep" && action.kind === "editSleep"

const EDIT_SHEETS = new Set<SheetKind>(["editDiaper", "editFeed", "editSleep", "editDose"])

export const editsARecord = (sheet: SheetKind) => EDIT_SHEETS.has(sheet)

export const opensOnOne = (sheet: SheetKind) => editsARecord(sheet) || sheet === "dose"

export const addsOrEdits = (sheet: SheetKind | null) => sheet === "measurement"

export const isUndo = ({ sheet }: Sending) => sheet === "undo"

export const closesOnSend = (sending: Sending) =>
  !isUndo(sending) && (editsARecord(sending.sheet) || CLOSES_ON_SEND.has(sending.action.kind))

export const closesOnSave = (sending: Sending) =>
  (!editsARecord(sending.sheet) && CLOSES_ON_SAVE.has(sending.action.kind)) || savesAPastSleep(sending)
