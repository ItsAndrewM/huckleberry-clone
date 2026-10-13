import { type Dose, DoseConflict } from "@bt/contracts"
import { type Household, nameOf, timeOf } from "../../sheets/failure.ts"
import { actionIdOf } from "../../sheets/held.ts"
import type { Failed, Sending } from "../../sheets/sending.ts"
import { NOW, type When, whenAt } from "../../sheets/when.ts"

export interface DoseSession {
  readonly actionId: string
  readonly supplementId: string | null
  readonly when: When
  readonly confirmedDuplicate: boolean
}

const loggedIn = (failed: Failed | null) => {
  const action = failed?.sending.action
  return action?.kind === "logDose" ? action : null
}

export const supplementIdOf = (failed: Failed | null, editing: string | null) =>
  loggedIn(failed)?.payload.supplementId ?? editing

export const formKeyOf = (failed: Failed | null) => (failed === null ? "new" : actionIdOf(failed.sending))

export const doseSessionOf = (
  failed: Failed | null,
  editing: string | null,
  zone: string,
  at: number | null,
): DoseSession => {
  const action = loggedIn(failed)
  if (action === null) {
    const when = at === null ? NOW : whenAt(at, zone)
    return { actionId: crypto.randomUUID(), supplementId: editing, when, confirmedDuplicate: false }
  }
  const { actionId, supplementId, occurredAt, confirmedDuplicate } = action.payload
  return { actionId, supplementId, when: whenAt(occurredAt, zone), confirmedDuplicate }
}

export interface Duplicate {
  readonly failed: Failed
  readonly current: Dose
  readonly resend: () => Sending
}

export const duplicateOf = (failed: Failed | null): Duplicate | null => {
  const action = loggedIn(failed)
  if (failed === null || action === null) return null
  const { error } = failed
  if (!(error instanceof DoseConflict) || error.code !== "SUPPLEMENT_DUPLICATE_DAY") return null
  const resend = (): Sending => ({
    sheet: failed.sending.sheet,
    action: { ...action, payload: { ...action.payload, actionId: crypto.randomUUID(), confirmedDuplicate: true } },
  })
  return { failed, current: error.current, resend }
}

export const duplicateMessage = (name: string, current: Dose, household: Household) =>
  `${name} was logged at ${timeOf(household, current.occurredAt)} by ${nameOf(household, current.createdBy)}. Record another dose anyway?`
