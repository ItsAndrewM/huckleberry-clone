import type { Failed, Sending, SheetKind } from "./sending.ts"

const CANT_SAVE_AS_IS = new Set(["ACTION_REPLAY_MISMATCH", "FEED_ALREADY_ACTIVE"])

export const actionIdOf = ({ action }: Sending) => action.payload.actionId

export const withoutAction = (held: ReadonlyArray<Failed>, actionId: string) =>
  held.filter(({ sending }) => actionIdOf(sending) !== actionId)

export const heldFor = (held: ReadonlyArray<Failed>, sheet: SheetKind) =>
  held.find(({ sending }) => sending.sheet === sheet) ?? null

export const isHeld = (held: ReadonlyArray<Failed>, sending: Sending) =>
  held.some((failed) => actionIdOf(failed.sending) === actionIdOf(sending))

export const settlesWithoutAsking = (error: Error) => "code" in error && CANT_SAVE_AS_IS.has(String(error.code))
