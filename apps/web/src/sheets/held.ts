import { FeedConflict, NotFound } from "@bt/contracts"
import { StaleDraft } from "./drafts.ts"
import { editsARecord, type Failed, type Sending, type SheetKind } from "./sending.ts"

const CANT_SAVE_AS_IS = new Set(["ACTION_REPLAY_MISMATCH", "FEED_ALREADY_ACTIVE", "SLEEP_ALREADY_ACTIVE"])

export const actionIdOf = ({ action }: Sending) => action.payload.actionId

export const withoutAction = (held: ReadonlyArray<Failed>, actionId: string) =>
  held.filter(({ sending }) => actionIdOf(sending) !== actionId)

export const recordOf = ({ action }: Sending): string | null => ("id" in action ? action.id : null)

export const isOnOpening = ({ sending }: Failed, sheet: SheetKind | null, editing: string | null) =>
  sending.sheet === sheet && (!editsARecord(sending.sheet) || recordOf(sending) === editing)

export const heldFor = (held: ReadonlyArray<Failed>, sheet: SheetKind, editing: string | null = null) =>
  held.find((failed) => isOnOpening(failed, sheet, editing)) ?? null

export const isHeld = (held: ReadonlyArray<Failed>, sending: Sending) =>
  held.some((failed) => actionIdOf(failed.sending) === actionIdOf(sending))

export const settlesWithoutAsking = (error: Error) => "code" in error && CANT_SAVE_AS_IS.has(String(error.code))

const refusedByTheCore = (error: Error) =>
  error instanceof NotFound || (error instanceof FeedConflict && error.code !== "ACTION_REPLAY_MISMATCH")

export const mayHoldReceipt = (error: Error) => !(error instanceof StaleDraft) && !refusedByTheCore(error)
