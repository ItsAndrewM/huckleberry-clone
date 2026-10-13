import type { Action } from "../api/actions.ts"
import type { Saved } from "../api/send.ts"
import { actionIdOf, heldFor, isOnOpening, recordOf, settlesWithoutAsking, withoutAction } from "./held.ts"
import { closesOnSave, closesOnSend, type Failed, isUndo, type Sending, type SheetKind } from "./sending.ts"
import { editLost, type Toast, toastFor, undoLost } from "./undo.ts"

export interface SheetsState {
  readonly open: SheetKind | null
  readonly editing: string | null
  readonly at: number | null
  readonly opened: number
  readonly held: ReadonlyArray<Failed>
  readonly asking: boolean
  readonly keptOpen: string | null
  readonly toast: Toast | null
  readonly queued: boolean
}

export const CLOSED: SheetsState = {
  open: null,
  editing: null,
  at: null,
  opened: 0,
  held: [],
  asking: false,
  keptOpen: null,
  toast: null,
  queued: false,
}

const NEW_ENTRIES = new Set<Action["kind"]>([
  "logDiaper",
  "logFeed",
  "startFeed",
  "addBottle",
  "logMeasurement",
  "logSleep",
  "startSleep",
])

export const isEntry = ({ action }: Sending) => NEW_ENTRIES.has(action.kind)

const goesWithItsSheet = ({ sending, error }: Failed) => !isEntry(sending) || settlesWithoutAsking(error)

const withoutGoing = (held: ReadonlyArray<Failed>, sheet: SheetKind | null, editing: string | null) =>
  held.filter((failed) => !isOnOpening(failed, sheet, editing) || !goesWithItsSheet(failed))

interface Opening {
  readonly sheet: SheetKind | null
  readonly editing: string | null
  readonly at: number | null
}

const NOWHERE: Opening = { sheet: null, editing: null, at: null }

const openingFor = (failed: Failed | undefined): Opening =>
  failed === undefined ? NOWHERE : { sheet: failed.sending.sheet, editing: recordOf(failed.sending), at: null }

const opening = (state: SheetsState, { sheet, editing, at }: Opening, queued: boolean): SheetsState => ({
  ...state,
  open: sheet,
  editing,
  at,
  opened: sheet === null ? state.opened : state.opened + 1,
  asking: false,
  keptOpen: null,
  queued,
})

const leaving = (state: SheetsState): SheetsState => ({
  ...state,
  held: withoutGoing(state.held, state.open, state.editing),
})

const closing = (state: SheetsState) => {
  const left = leaving(state)
  return opening(left, openingFor(left.held[0]), true)
}

export const shownState = (
  state: SheetsState,
  sheet: SheetKind,
  editing: string | null = null,
  at: number | null = null,
) =>
  state.open === sheet && state.editing === editing && state.at === at
    ? state
    : opening(leaving(state), { sheet, editing, at }, false)

export const dismissedState = (state: SheetsState): SheetsState => {
  if (state.open === null) return state
  const shown = heldFor(state.held, state.open, state.editing)
  return shown !== null && !goesWithItsSheet(shown) ? { ...state, asking: true } : closing(state)
}

export const dismissedKindState = (state: SheetsState, sheet: SheetKind): SheetsState =>
  state.open === sheet ? dismissedState(state) : state

export const keptState = (state: SheetsState): SheetsState => ({ ...state, asking: false })

export const discardedState = (state: SheetsState, failed: Failed): SheetsState => {
  const held = withoutAction(state.held, actionIdOf(failed.sending))
  return state.asking ? closing({ ...state, held }) : { ...state, held }
}

export const failedState = (state: SheetsState, failed: Failed, now: number): SheetsState => {
  if (isUndo(failed.sending)) return { ...state, toast: undoLost(failed.error, now) }
  const own = state.keptOpen === actionIdOf(failed.sending)
  if (closesOnSave(failed.sending) && !own) return { ...state, toast: editLost(failed.error, now) }
  const held = [...state.held, failed]
  const keptOpen = own ? null : state.keptOpen
  return state.open === null ? opening({ ...state, held }, openingFor(failed), true) : { ...state, held, keptOpen }
}

export const restoredState = (held: ReadonlyArray<Failed>): SheetsState => ({ ...CLOSED, held })

export const reopenedState = (state: SheetsState): SheetsState => {
  const first = state.held[0]
  return state.open !== null || first === undefined ? state : opening(state, openingFor(first), true)
}

export const sendingState = (state: SheetsState, sending: Sending, online: boolean): SheetsState => {
  const toast = isUndo(sending) ? null : state.toast
  const held = withoutGoing(withoutAction(state.held, actionIdOf(sending)), sending.sheet, recordOf(sending))
  const sent = { ...state, held, toast }
  if (closesOnSend(sending) && online) return state.open === null ? sent : closing(sent)
  if (!closesOnSend(sending) && !closesOnSave(sending)) return sent
  return state.open === sending.sheet ? { ...sent, keptOpen: actionIdOf(sending) } : sent
}

export const savedState = (state: SheetsState, sending: Sending, saved: Saved, now: number): SheetsState => {
  const toasted = { ...state, toast: toastFor(sending, saved, now) ?? state.toast }
  return state.keptOpen === actionIdOf(sending) ? closing(toasted) : toasted
}

export const announcedState = (state: SheetsState, toast: Toast): SheetsState => ({ ...state, toast })

export const expiredState = (state: SheetsState, now: number): SheetsState =>
  state.toast !== null && now >= state.toast.until ? { ...state, toast: null } : state
