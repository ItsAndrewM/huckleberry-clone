import type { Action } from "../api/actions.ts"
import { Offline } from "../api/errors.ts"
import type { Saved } from "../api/send.ts"
import { type Draft, isFresh, renewed, StaleDraft } from "./drafts.ts"
import { actionIdOf, heldFor, withoutAction } from "./held.ts"
import { settlesWithoutAsking } from "./recovery.ts"
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

const NEW_ENTRIES = new Set<Action["kind"]>(["logDiaper", "logFeed", "startFeed", "addBottle"])

export const isEntry = ({ action }: Sending) => NEW_ENTRIES.has(action.kind)

const withoutControls = (held: ReadonlyArray<Failed>, sheet: SheetKind | null) =>
  held.filter(({ sending }) => sending.sheet !== sheet || isEntry(sending))

const opening = (state: SheetsState, sheet: SheetKind | null): SheetsState => ({
  ...state,
  open: sheet,
  opened: sheet === null ? state.opened : state.opened + 1,
  asking: false,
  keptOpen: null,
})

const leaving = (state: SheetsState): SheetsState => ({ ...state, held: withoutControls(state.held, state.open) })

const closing = (state: SheetsState) => {
  const left = leaving(state)
  return opening(left, left.held[0]?.sending.sheet ?? null)
}

export const shownState = (state: SheetsState, sheet: SheetKind) =>
  state.open === sheet ? state : opening(leaving(state), sheet)

export const dismissedState = (state: SheetsState): SheetsState => {
  if (state.open === null) return state
  const shown = heldFor(state.held, state.open)
  if (shown === null) return closing(state)
  if (settlesWithoutAsking(shown.error)) {
    return closing({ ...state, held: withoutAction(state.held, actionIdOf(shown.sending)) })
  }
  return isEntry(shown.sending) ? { ...state, asking: true } : closing(state)
}

export const keptState = (state: SheetsState): SheetsState => ({ ...state, asking: false })

export const discardedState = (state: SheetsState, failed: Failed): SheetsState => {
  const held = withoutAction(state.held, actionIdOf(failed.sending))
  return state.asking ? closing({ ...state, held }) : { ...state, held }
}

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

export const sendingState = (state: SheetsState, sending: Sending, online: boolean): SheetsState => {
  const toast = UNDOES.has(sending.action.kind) ? null : state.toast
  const held = withoutControls(withoutAction(state.held, actionIdOf(sending)), sending.sheet)
  const sent = { ...state, held, toast }
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
