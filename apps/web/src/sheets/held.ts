import {
  DiaperConflict,
  DoseConflict,
  FeedConflict,
  InvalidInput,
  MeasurementConflict,
  NotFound,
  SleepConflict,
  Unauthorized,
} from "@bt/contracts"
import { AuthRequired } from "../api/errors.ts"
import { StaleDraft } from "./drafts.ts"
import { type Failed, opensOnOne, type Sending, type SheetKind } from "./sending.ts"

const CANT_SAVE_AS_IS = new Set(["ACTION_REPLAY_MISMATCH", "FEED_ALREADY_ACTIVE", "SLEEP_ALREADY_ACTIVE"])

export const actionIdOf = ({ action }: Sending) => action.payload.actionId

export const withoutAction = (held: ReadonlyArray<Failed>, actionId: string) =>
  held.filter(({ sending }) => actionIdOf(sending) !== actionId)

export const recordOf = ({ action }: Sending): string | null => ("id" in action ? action.id : null)

const supplementOf = ({ action }: Sending): string | null =>
  action.kind === "logDose" ? action.payload.supplementId : null

export const editingOf = (sending: Sending) => recordOf(sending) ?? supplementOf(sending)

export const isOnOpening = ({ sending }: Failed, sheet: SheetKind | null, editing: string | null) =>
  sending.sheet === sheet && (!opensOnOne(sending.sheet) || editingOf(sending) === editing)

export const heldFor = (held: ReadonlyArray<Failed>, sheet: SheetKind, editing: string | null = null) =>
  held.find((failed) => isOnOpening(failed, sheet, editing)) ?? null

export const isHeld = (held: ReadonlyArray<Failed>, sending: Sending) =>
  held.some((failed) => actionIdOf(failed.sending) === actionIdOf(sending))

export interface Showing {
  readonly open: SheetKind | null
  readonly busy: Sending | null
}

export const letGo = ({ open, busy }: Showing, sheet: SheetKind, held: Failed | null, actionId: string) =>
  held === null && open === sheet && (busy === null || actionIdOf(busy) !== actionId)

export const settlesWithoutAsking = (error: Error) => "code" in error && CANT_SAVE_AS_IS.has(String(error.code))

const refusedByTheCore = (error: Error) =>
  error instanceof NotFound || (error instanceof FeedConflict && error.code !== "ACTION_REPLAY_MISMATCH")

export const mayHoldReceipt = (error: Error) => !(error instanceof StaleDraft) && !refusedByTheCore(error)

export const isConflict = (error: Error) =>
  error instanceof FeedConflict ||
  error instanceof DiaperConflict ||
  error instanceof MeasurementConflict ||
  error instanceof SleepConflict ||
  error instanceof DoseConflict

const refusesAnotherTry = (error: Error) =>
  error instanceof AuthRequired ||
  error instanceof Unauthorized ||
  error instanceof InvalidInput ||
  error instanceof NotFound ||
  isConflict(error)

export const offersRetry = (error: Error) => !refusesAnotherTry(error)

export const savesAsItIs = (error: Error) =>
  offersRetry(error) || error instanceof AuthRequired || error instanceof Unauthorized
