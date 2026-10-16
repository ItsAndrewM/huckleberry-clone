import type { Action } from "../api/actions.ts"
import type { Saved } from "../api/send.ts"
import {
  actionIdOf,
  editingOf,
  heldFor,
  isHeld,
  isOnOpening,
  recordOf,
  settlesWithoutAsking,
  withoutAction,
} from "./held.ts"
import { stillSaveable } from "./saveable.ts"
import {
  addsOrEdits,
  closesOnSave,
  closesOnSend,
  type Failed,
  isEntry,
  isUndo,
  type Sending,
  type SheetKind,
} from "./sending.ts"
import { editLost, type Toast, toastFor, undoLost } from "./undo.ts"

export interface Pending {
  readonly sending: Sending
  readonly blocker: Failed
}

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
  readonly pending: Pending | null
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
  pending: null,
}

const asksFirst = (failed: Failed) =>
  isEntry(failed.sending) ? !settlesWithoutAsking(failed.error) : stillSaveable(failed)

const STEPS = new Set<Action["kind"]>(["switchSide", "pauseFeed", "resumeFeed", "finishFeed", "wakeSleep"])

const TAPS = new Set<Action["kind"]>([...STEPS, "startFeed", "startSleep"])

const DELETES = new Set<Action["kind"]>([
  "deleteFeed",
  "deletePortion",
  "deleteSleep",
  "deleteDiaper",
  "deleteDose",
  "deleteMeasurement",
])

const replaces = (fresh: Sending, held: Sending) =>
  recordOf(fresh) === recordOf(held) &&
  (DELETES.has(fresh.action.kind) || (STEPS.has(fresh.action.kind) && STEPS.has(held.action.kind)))

const replacedBy =
  (fresh: Sending, resend: boolean) =>
  (failed: Failed): boolean =>
    isEntry(failed.sending)
      ? settlesWithoutAsking(failed.error)
      : !stillSaveable(failed) || closesOnSave(failed.sending) || (!resend && replaces(fresh, failed.sending))

const withoutGoing = (held: ReadonlyArray<Failed>, sheet: SheetKind | null, editing: string | null) =>
  held.filter((failed) => !isOnOpening(failed, sheet, editing) || asksFirst(failed))

const withoutReplaced = (held: ReadonlyArray<Failed>, fresh: Sending, resend: boolean) =>
  held.filter((failed) => !isOnOpening(failed, fresh.sheet, editingOf(fresh)) || !replacedBy(fresh, resend)(failed))

export const blockerFor = (state: SheetsState, fresh: Sending): Failed | null =>
  TAPS.has(fresh.action.kind) || isHeld(state.held, fresh)
    ? null
    : (state.held.find(
        (failed) =>
          isOnOpening(failed, fresh.sheet, editingOf(fresh)) &&
          !isEntry(failed.sending) &&
          !replacedBy(fresh, false)(failed),
      ) ?? null)

const rankOf = ({ sending }: Failed) => {
  if (STEPS.has(sending.action.kind)) return 0
  return isEntry(sending) ? 1 : 2
}

const heldWith = (held: ReadonlyArray<Failed>, failed: Failed): ReadonlyArray<Failed> => {
  const behind = held.findIndex(
    (other) => isOnOpening(other, failed.sending.sheet, editingOf(failed.sending)) && rankOf(other) > rankOf(failed),
  )
  return behind === -1 ? [...held, failed] : [...held.slice(0, behind), failed, ...held.slice(behind)]
}

interface Opening {
  readonly sheet: SheetKind | null
  readonly editing: string | null
  readonly at: number | null
}

const NOWHERE: Opening = { sheet: null, editing: null, at: null }

const openingFor = (failed: Failed | undefined): Opening =>
  failed === undefined ? NOWHERE : { sheet: failed.sending.sheet, editing: editingOf(failed.sending), at: null }

const opening = (state: SheetsState, { sheet, editing, at }: Opening, queued: boolean): SheetsState => ({
  ...state,
  open: sheet,
  editing,
  at,
  opened: sheet === null ? state.opened : state.opened + 1,
  asking: false,
  keptOpen: null,
  queued,
  pending: null,
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
  return shown !== null && asksFirst(shown) ? { ...state, asking: true, pending: null } : closing(state)
}

export const dismissedKindState = (state: SheetsState, sheet: SheetKind): SheetsState =>
  state.open === sheet ? dismissedState(state) : state

export const keptState = (state: SheetsState): SheetsState => ({ ...state, asking: false, pending: null })

export const askedBeforeSending = (state: SheetsState, sending: Sending, blocker: Failed): SheetsState => ({
  ...state,
  asking: true,
  pending: { sending, blocker },
})

const askedNext = (state: SheetsState, sending: Sending): SheetsState => {
  const blocker = blockerFor(state, sending)
  return blocker === null ? { ...state, asking: false, pending: null } : askedBeforeSending(state, sending, blocker)
}

export const discardedState = (state: SheetsState, failed: Failed): SheetsState => {
  const held = withoutAction(state.held, actionIdOf(failed.sending))
  if (state.pending !== null) return askedNext({ ...state, held }, state.pending.sending)
  return state.asking ? closing({ ...state, held }) : { ...state, held }
}

const onTheRecordItOpenedWith = (state: SheetsState, failed: Failed) =>
  !addsOrEdits(state.open) || editingOf(failed.sending) === state.editing

const landsInItsOwnSheet = (state: SheetsState, failed: Failed, own: boolean) =>
  closesOnSend(failed.sending) &&
  (own || (isOnOpening(failed, state.open, state.editing) && onTheRecordItOpenedWith(state, failed)))

const stillAsking = (state: SheetsState, reopened: SheetsState): SheetsState =>
  state.pending === null ? reopened : { ...reopened, asking: true, pending: state.pending }

export const failedState = (state: SheetsState, failed: Failed, now: number): SheetsState => {
  if (isUndo(failed.sending)) return { ...state, toast: undoLost(failed.error, now) }
  const own = state.keptOpen === actionIdOf(failed.sending)
  if (closesOnSave(failed.sending) && !own) return { ...state, toast: editLost(failed.error, now) }
  const held = heldWith(state.held, failed)
  if (state.open === null) return opening({ ...state, held }, openingFor(failed), true)
  if (landsInItsOwnSheet(state, failed, own)) {
    return stillAsking(state, opening({ ...state, held }, openingFor(failed), false))
  }
  return { ...state, held, keptOpen: own ? null : state.keptOpen }
}

export const restoredState = (held: ReadonlyArray<Failed>): SheetsState => ({
  ...CLOSED,
  held: held.reduce<ReadonlyArray<Failed>>((ranked, failed) => heldWith(ranked, failed), []),
})

export const reopenedState = (state: SheetsState): SheetsState => {
  const first = state.held[0]
  return state.open !== null || first === undefined ? state : opening(state, openingFor(first), true)
}

export const sendingState = (state: SheetsState, sending: Sending, online: boolean): SheetsState => {
  const toast = isUndo(sending) ? null : state.toast
  const held = withoutReplaced(withoutAction(state.held, actionIdOf(sending)), sending, isHeld(state.held, sending))
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
