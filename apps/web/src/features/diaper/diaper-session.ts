import type { Failed } from "../../sheets/sending.ts"
import { NOW, type When, whenAt } from "../../sheets/when.ts"

export interface Session {
  readonly actionId: string
  readonly when: When
}

export const sessionOf = (failed: Failed | null, zone: string): Session => {
  const action = failed?.sending.action
  if (action?.kind !== "logDiaper") return { actionId: crypto.randomUUID(), when: NOW }
  return { actionId: action.payload.actionId, when: whenAt(action.payload.occurredAt, zone) }
}
