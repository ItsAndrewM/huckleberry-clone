import type { Action } from "../api/actions.ts"
import { Offline } from "../api/errors.ts"
import type { Saved } from "../api/send.ts"
import { type Draft, isFresh, StaleDraft } from "./drafts.ts"
import { closesOnSend, type Failed, type Sending, type SheetKind } from "./sending.ts"
import { TOAST_MS, type Toast, toastFor } from "./undo.ts"

export interface SheetsState {
  readonly open: SheetKind | null
  readonly opened: number
  readonly held: ReadonlyArray<Failed>
  readonly asking: boolean
  readonly keptOpen: string | null
  readonly toast: Toast | null
}

export const CLOSED: SheetsState = { open: null, opened: 0, held: [], asking: false, keptOpen: null, toast: null }

const UNDOES = new Set<Action["kind"]>(["deleteDiaper", "deleteFeed", "deletePortion"])

const actionIdOf = ({ action }: Sending) => action.payload.actionId

const withoutEntry = (held: ReadonlyArray<Failed>, actionId: string) =>
  held.filter(({ sending }) => actionIdOf(sending) !== actionId)

export const heldFor = (held: ReadonlyArray<Failed>, sheet: SheetKind) =>
  held.find(({ sending }) => sending.sheet === sheet) ?? null

const opening = (state: SheetsState, sheet: SheetKind | null): SheetsState => ({
  ...state,
  open: sheet,
  opened: sheet === null ? state.opened : state.opened + 1,
  asking: false,
  keptOpen: null,
})

const closing = (state: SheetsState) => opening(state, state.held[0]?.sending.sheet ?? null)

export const shownState = (state: SheetsState, sheet: SheetKind) =>
  state.open === sheet ? state : opening(state, sheet)

export const dismissedState = (state: SheetsState): SheetsState => {
  if (state.open === null) return state
  return heldFor(state.held, state.open) === null ? closing(state) : { ...state, asking: true }
}

export const keptState = (state: SheetsState): SheetsState => ({ ...state, asking: false })

export const discardedState = (state: SheetsState, failed: Failed): SheetsState => {
  const held = withoutEntry(state.held, actionIdOf(failed.sending))
  return state.asking ? closing({ ...state, held }) : { ...state, held }
}

const withActionId = <Sent extends Action>(action: Sent, actionId: string): Sent => ({
  ...action,
  payload: { ...action.payload, actionId },
})

const renewed = ({ sheet, action }: Sending, actionId: string): Sending => ({
  sheet,
  action: withActionId(action, actionId),
})

const undoFailure = (error: Error, now: number): Toast => ({
  message: error instanceof Offline ? "No connection, so that wasn't undone." : "That wasn't undone.",
  undo: null,
  until: now + TOAST_MS,
})

export const failedState = (state: SheetsState, failed: Failed, now: number): SheetsState => {
  if (UNDOES.has(failed.sending.action.kind)) return { ...state, toast: undoFailure(failed.error, now) }
  const held = [...state.held, failed]
  const keptOpen = state.keptOpen === actionIdOf(failed.sending) ? null : state.keptOpen
  return state.open === null ? opening({ ...state, held }, failed.sending.sheet) : { ...state, held, keptOpen }
}

export const restoredState = (draft: Draft | null, now: number, actionId: string): SheetsState => {
  if (draft === null || isFresh(draft, now)) return CLOSED
  const failed = { sending: renewed(draft.sending, actionId), error: new StaleDraft({ createdAt: draft.createdAt }) }
  return failedState(CLOSED, failed, now)
}

export const isHeld = (state: SheetsState, sending: Sending) =>
  state.held.some((failed) => actionIdOf(failed.sending) === actionIdOf(sending))

export const sendingState = (state: SheetsState, sending: Sending, online: boolean): SheetsState => {
  const toast = UNDOES.has(sending.action.kind) ? null : state.toast
  const sent = { ...state, held: withoutEntry(state.held, actionIdOf(sending)), toast }
  if (!closesOnSend(sending)) return sent
  if (online) return closing(sent)
  return state.open === sending.sheet ? { ...sent, keptOpen: actionIdOf(sending) } : sent
}

export const savedState = (state: SheetsState, sending: Sending, saved: Saved, now: number): SheetsState => {
  const toasted = { ...state, toast: toastFor(sending, saved, now) ?? state.toast }
  return state.keptOpen === actionIdOf(sending) ? closing(toasted) : toasted
}

export const expiredState = (state: SheetsState, now: number): SheetsState =>
  state.toast !== null && now >= state.toast.until ? { ...state, toast: null } : state
