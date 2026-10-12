import type { Action } from "../api/actions.ts"
import type { Saved } from "../api/send.ts"
import { actionIdOf, heldFor, settlesWithoutAsking, withoutAction } from "./held.ts"
import { closesOnSave, closesOnSend, type Failed, type Sending, type SheetKind } from "./sending.ts"
import { editLost, type Toast, toastFor, undoLost } from "./undo.ts"

export interface SheetsState {
  readonly open: SheetKind | null
  readonly opened: number
  readonly held: ReadonlyArray<Failed>
  readonly asking: boolean
  readonly keptOpen: string | null
  readonly toast: Toast | null
  readonly queued: boolean
}

export const CLOSED: SheetsState = {
  open: null,
  opened: 0,
  held: [],
  asking: false,
  keptOpen: null,
  toast: null,
  queued: false,
}

const UNDOES = new Set<Action["kind"]>(["deleteDiaper", "deleteFeed", "deletePortion"])

const NEW_ENTRIES = new Set<Action["kind"]>(["logDiaper", "logFeed", "startFeed", "addBottle", "logMeasurement"])

export const isEntry = ({ action }: Sending) => NEW_ENTRIES.has(action.kind)

const goesWithItsSheet = ({ sending, error }: Failed) => !isEntry(sending) || settlesWithoutAsking(error)

const withoutGoing = (held: ReadonlyArray<Failed>, sheet: SheetKind | null) =>
  held.filter((failed) => failed.sending.sheet !== sheet || !goesWithItsSheet(failed))

const opening = (state: SheetsState, sheet: SheetKind | null, queued: boolean): SheetsState => ({
  ...state,
  open: sheet,
  opened: sheet === null ? state.opened : state.opened + 1,
  asking: false,
  keptOpen: null,
  queued,
})

const leaving = (state: SheetsState): SheetsState => ({ ...state, held: withoutGoing(state.held, state.open) })

const closing = (state: SheetsState) => {
  const left = leaving(state)
  return opening(left, left.held[0]?.sending.sheet ?? null, true)
}

export const shownState = (state: SheetsState, sheet: SheetKind) =>
  state.open === sheet ? state : opening(leaving(state), sheet, false)

export const dismissedState = (state: SheetsState): SheetsState => {
  if (state.open === null) return state
  const shown = heldFor(state.held, state.open)
  return shown !== null && !goesWithItsSheet(shown) ? { ...state, asking: true } : closing(state)
}

export const keptState = (state: SheetsState): SheetsState => ({ ...state, asking: false })

export const discardedState = (state: SheetsState, failed: Failed): SheetsState => {
  const held = withoutAction(state.held, actionIdOf(failed.sending))
  return state.asking ? closing({ ...state, held }) : { ...state, held }
}

export const failedState = (state: SheetsState, failed: Failed, now: number): SheetsState => {
  if (UNDOES.has(failed.sending.action.kind)) return { ...state, toast: undoLost(failed.error, now) }
  const own = state.keptOpen === actionIdOf(failed.sending)
  if (closesOnSave(failed.sending) && !own) return { ...state, toast: editLost(failed.error, now) }
  const held = [...state.held, failed]
  const keptOpen = own ? null : state.keptOpen
  return state.open === null ? opening({ ...state, held }, failed.sending.sheet, true) : { ...state, held, keptOpen }
}

export const restoredState = (held: ReadonlyArray<Failed>): SheetsState => ({ ...CLOSED, held })

export const reopenedState = (state: SheetsState): SheetsState => {
  const first = state.held[0]
  return state.open !== null || first === undefined ? state : opening(state, first.sending.sheet, true)
}

export const sendingState = (state: SheetsState, sending: Sending, online: boolean): SheetsState => {
  const toast = UNDOES.has(sending.action.kind) ? null : state.toast
  const held = withoutGoing(withoutAction(state.held, actionIdOf(sending)), sending.sheet)
  const sent = { ...state, held, toast }
  if (closesOnSend(sending) && online) return state.open === null ? sent : closing(sent)
  if (!closesOnSend(sending) && !closesOnSave(sending)) return sent
  return state.open === sending.sheet ? { ...sent, keptOpen: actionIdOf(sending) } : sent
}

export const savedState = (state: SheetsState, sending: Sending, saved: Saved, now: number): SheetsState => {
  const toasted = { ...state, toast: toastFor(sending, saved, now) ?? state.toast }
  return state.keptOpen === actionIdOf(sending) ? closing(toasted) : toasted
}

export const expiredState = (state: SheetsState, now: number): SheetsState =>
  state.toast !== null && now >= state.toast.until ? { ...state, toast: null } : state
