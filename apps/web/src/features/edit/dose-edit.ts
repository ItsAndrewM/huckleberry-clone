import type { Dose } from "@bt/contracts"
import type { DoseAction } from "../../api/actions.ts"
import type { Failed } from "../../sheets/sending.ts"
import { type Resolved, resolveWhen, sameWhen, type When, whenAt } from "../../sheets/when.ts"
import { type Display, supplementName } from "../today/display.ts"
import type { Target } from "./diaper-edit.ts"

export interface DoseEditSession {
  readonly actionId: string
  readonly target: Target
  readonly occurredAt: number
  readonly when: When
}

export const doseEditSession = (failed: Failed | null, dose: Dose, zone: string): DoseEditSession => {
  const action = failed?.sending.action
  if (action?.kind === "editDose") {
    const { actionId, version, occurredAt } = action.payload
    return { actionId, target: { id: action.id, version }, occurredAt, when: whenAt(occurredAt, zone) }
  }
  const { id, version, occurredAt } = dose
  return { actionId: crypto.randomUUID(), target: { id, version }, occurredAt, when: whenAt(occurredAt, zone) }
}

export const movedTo = (session: DoseEditSession, when: When, zone: string, now: number): Resolved =>
  sameWhen(when, session.when) ? { ok: true, instant: session.occurredAt } : resolveWhen(when, zone, now)

export const doseEdit = (session: DoseEditSession, occurredAt: number): DoseAction => ({
  kind: "editDose",
  id: session.target.id,
  payload: { actionId: session.actionId, version: session.target.version, occurredAt },
})

export const givenParts = (display: Display, dose: Dose) =>
  [supplementName(display, dose.supplementId), dose.dose].filter((part) => part !== "")

export const doseDelete = ({ id, version }: Target): DoseAction => ({
  kind: "deleteDose",
  id,
  payload: { actionId: crypto.randomUUID(), version },
})
