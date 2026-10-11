import type { Failed, Sending, SheetKind } from "./sending.ts"

export const actionIdOf = ({ action }: Sending) => action.payload.actionId

export const withoutAction = (held: ReadonlyArray<Failed>, actionId: string) =>
  held.filter(({ sending }) => actionIdOf(sending) !== actionId)

export const heldFor = (held: ReadonlyArray<Failed>, sheet: SheetKind) =>
  held.find(({ sending }) => sending.sheet === sheet) ?? null

export const isHeld = (held: ReadonlyArray<Failed>, sending: Sending) =>
  held.some((failed) => actionIdOf(failed.sending) === actionIdOf(sending))
