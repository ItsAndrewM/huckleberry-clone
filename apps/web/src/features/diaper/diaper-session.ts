import type { Failed } from "../../sheets/sending.ts"
import { NOW, type When, whenAt } from "../../sheets/when.ts"

export interface Session {
  readonly actionId: string
  readonly when: When
}

export const sessionOf = (failed: Failed | null, zone: string, at: number | null): Session => {
  const action = failed?.sending.action
  if (action?.kind !== "logDiaper") return { actionId: crypto.randomUUID(), when: at === null ? NOW : whenAt(at, zone) }
  return { actionId: action.payload.actionId, when: whenAt(action.payload.occurredAt, zone) }
}
