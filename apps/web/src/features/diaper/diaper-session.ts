import type { Failed } from "../../sheets/sending.ts"
import { NOW, type Resolved, resolveSent, type When, whenAt } from "../../sheets/when.ts"

export interface Session {
  readonly actionId: string
  readonly when: When
  readonly occurredAt: number | null
}

export const sessionOf = (failed: Failed | null, zone: string, at: number | null): Session => {
  const action = failed?.sending.action
  if (action?.kind !== "logDiaper") {
    return { actionId: crypto.randomUUID(), when: at === null ? NOW : whenAt(at, zone), occurredAt: null }
  }
  const { actionId, occurredAt } = action.payload
  return { actionId, when: whenAt(occurredAt, zone), occurredAt }
}

export const occurredAtOf = (session: Session, when: When, zone: string, now: number): Resolved =>
  resolveSent(session.occurredAt, session.when, when, zone, now)
