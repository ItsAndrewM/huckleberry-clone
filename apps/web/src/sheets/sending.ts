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

export interface Tap {
  readonly at: number
  readonly actionId: string
}

export interface Recovery {
  readonly label: string
  readonly sendingAt: (tap: Tap) => Sending
}

const CLOSES_ON_SEND = new Set<Action["kind"]>(["logDiaper", "logFeed", "startFeed", "addBottle", "finishFeed"])

const CLOSES_ON_SAVE = new Set<Action["kind"]>(["editDiaper", "editPortion"])

export const closesOnSend = ({ action }: Sending) => CLOSES_ON_SEND.has(action.kind)

export const closesOnSave = ({ action }: Sending) => CLOSES_ON_SAVE.has(action.kind)
