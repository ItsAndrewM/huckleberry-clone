import type { Action } from "../api/actions.ts"
import { Offline } from "../api/errors.ts"
import type { Saved } from "../api/send.ts"
import { closesOnSend, type Failed, type Sending, type SheetKind } from "./sending.ts"
import { TOAST_MS, type Toast, toastFor } from "./undo.ts"

export interface SheetsState {
  readonly open: SheetKind | null
  readonly failed: Failed | null
  readonly toast: Toast | null
}

export const CLOSED: SheetsState = { open: null, failed: null, toast: null }

const UNDOES = new Set<Action["kind"]>(["deleteDiaper", "deleteFeed", "deletePortion"])

export const sendingState = (state: SheetsState, sending: Sending, online: boolean): SheetsState => ({
  ...state,
  open: online && closesOnSend(sending) ? null : state.open,
  failed: null,
  toast: UNDOES.has(sending.action.kind) ? null : state.toast,
})

const undoFailure = (error: Error, now: number): Toast => ({
  message: error instanceof Offline ? "No connection, so that wasn't undone." : "That wasn't undone.",
  undo: null,
  until: now + TOAST_MS,
})

export const failedState = (state: SheetsState, failed: Failed, now: number): SheetsState => {
  if (UNDOES.has(failed.sending.action.kind)) return { ...state, toast: undoFailure(failed.error, now) }
  return { ...state, open: failed.sending.sheet, failed }
}

export const savedState = (state: SheetsState, sending: Sending, saved: Saved, now: number): SheetsState => ({
  ...state,
  toast: toastFor(sending, saved, now) ?? state.toast,
})

export const expiredState = (state: SheetsState, now: number): SheetsState =>
  state.toast !== null && now >= state.toast.until ? { ...state, toast: null } : state
