import { Schema } from "effect"
import { Action } from "../api/actions.ts"

export const SheetKind = Schema.Literals(["diaper", "bottle", "nursing", "pastFeed"])
export type SheetKind = typeof SheetKind.Type

export const Sending = Schema.Struct({ sheet: SheetKind, action: Action })
export type Sending = typeof Sending.Type

export interface Failed {
  readonly sending: Sending
  readonly error: Error
}

const CLOSES_ON_SEND = new Set<Action["kind"]>([
  "logDiaper",
  "logFeed",
  "startFeed",
  "addBottle",
  "finishFeed",
  "editDiaper",
  "editPortion",
])

export const closesOnSend = ({ action }: Sending) => CLOSES_ON_SEND.has(action.kind)
