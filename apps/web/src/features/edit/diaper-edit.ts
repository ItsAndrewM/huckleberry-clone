import type { Diaper } from "@bt/contracts"
import type { DiaperAction } from "../../api/actions.ts"
import type { Failed } from "../../sheets/sending.ts"
import { type When, whenAt } from "../../sheets/when.ts"

export interface DiaperKind {
  readonly wet: boolean
  readonly dirty: boolean
}

export interface Target {
  readonly id: string
  readonly version: number
}

export interface DiaperEditSession {
  readonly actionId: string
  readonly target: Target
  readonly when: When
  readonly kind: DiaperKind
}

export const diaperEditSession = (failed: Failed | null, diaper: Diaper, zone: string): DiaperEditSession => {
  const action = failed?.sending.action
  if (action?.kind === "editDiaper") {
    const { actionId, version, occurredAt, wet, dirty } = action.payload
    return { actionId, target: { id: action.id, version }, when: whenAt(occurredAt, zone), kind: { wet, dirty } }
  }
  const { id, version, occurredAt, wet, dirty } = diaper
  return {
    actionId: crypto.randomUUID(),
    target: { id, version },
    when: whenAt(occurredAt, zone),
    kind: { wet, dirty },
  }
}

export const diaperEdit = (session: DiaperEditSession, kind: DiaperKind, occurredAt: number): DiaperAction => ({
  kind: "editDiaper",
  id: session.target.id,
  payload: { actionId: session.actionId, version: session.target.version, occurredAt, ...kind },
})

export const diaperDelete = ({ id, version }: Target): DiaperAction => ({
  kind: "deleteDiaper",
  id,
  payload: { actionId: crypto.randomUUID(), version },
})
