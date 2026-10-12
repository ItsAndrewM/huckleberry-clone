import type { Measurement, Units } from "@bt/contracts"
import { isMeasurementAction, type MeasurementAction } from "../../api/actions.ts"
import type { Failed } from "../../sheets/sending.ts"
import { NOW, type Resolved, resolveWhen, type When, whenAt } from "../../sheets/when.ts"
import {
  type Entry,
  entryOf,
  type LengthUnit,
  LIMITS,
  type MetricKey,
  type Reading,
  readingOf,
  type WeightUnit,
} from "./entry.ts"

export type Values = { readonly [key in MetricKey]: number | null }

export type Readings = { readonly [key in MetricKey]: Reading }

export interface MeasurementForm {
  readonly when: When
  readonly weightG: Entry<WeightUnit>
  readonly lengthCm: Entry<LengthUnit>
  readonly headCm: Entry<LengthUnit>
}

export interface Target {
  readonly id: string
  readonly version: number
}

export interface MeasurementSession {
  readonly actionId: string
  readonly target: Target | null
  readonly measuredAt: number | null
  readonly form: MeasurementForm
}

const NO_VALUES: Values = { weightG: null, lengthCm: null, headCm: null }

const formOf = (values: Values, units: Units, when: When): MeasurementForm => ({
  when,
  weightG: entryOf(values.weightG, units.weight),
  lengthCm: entryOf(values.lengthCm, units.length),
  headCm: entryOf(values.headCm, units.length),
})

const sentSession = (action: MeasurementAction, units: Units, zone: string): MeasurementSession | null => {
  if (action.kind === "deleteMeasurement" || action.kind === "restoreMeasurement") return null
  const { payload } = action
  const target = action.kind === "editMeasurement" ? { id: action.id, version: action.payload.version } : null
  const when = whenAt(payload.measuredAt, zone)
  return { actionId: payload.actionId, target, measuredAt: payload.measuredAt, form: formOf(payload, units, when) }
}

const editSession = (editing: Measurement, units: Units, zone: string): MeasurementSession => ({
  actionId: crypto.randomUUID(),
  target: { id: editing.id, version: editing.version },
  measuredAt: editing.measuredAt,
  form: formOf(editing, units, whenAt(editing.measuredAt, zone)),
})

export const measurementSession = (
  failed: Failed | null,
  editing: Measurement | null,
  units: Units,
  zone: string,
  at: number | null,
): MeasurementSession => {
  const action = failed?.sending.action
  const sent = action !== undefined && isMeasurementAction(action) ? sentSession(action, units, zone) : null
  if (sent !== null) return sent
  if (editing !== null) return editSession(editing, units, zone)
  return {
    actionId: crypto.randomUUID(),
    target: null,
    measuredAt: null,
    form: formOf(NO_VALUES, units, at === null ? NOW : whenAt(at, zone)),
  }
}

export const readingsOf = (form: MeasurementForm): Readings => ({
  weightG: readingOf(form.weightG, LIMITS.weightG),
  lengthCm: readingOf(form.lengthCm, LIMITS.lengthCm),
  headCm: readingOf(form.headCm, LIMITS.headCm),
})

const listed = ({ weightG, lengthCm, headCm }: Readings) => [weightG, lengthCm, headCm]

const valueOf = (reading: Reading) => (reading.kind === "value" ? reading.value : null)

export const valuesOf = (readings: Readings): Values => ({
  weightG: valueOf(readings.weightG),
  lengthCm: valueOf(readings.lengthCm),
  headCm: valueOf(readings.headCm),
})

export const isComplete = (readings: Readings) =>
  listed(readings).every(({ kind }) => kind !== "invalid") && listed(readings).some(({ kind }) => kind === "value")

export const isCleared = (session: MeasurementSession, readings: Readings) =>
  session.target !== null && listed(readings).every(({ kind }) => kind === "empty")

const sameWhen = (a: When, b: When) =>
  a.kind === "now" ? b.kind === "now" : b.kind === "at" && a.local === b.local && a.pick === b.pick

export const measuredAtOf = (session: MeasurementSession, when: When, zone: string, now: number): Resolved =>
  session.measuredAt !== null && sameWhen(when, session.form.when)
    ? { ok: true, instant: session.measuredAt }
    : resolveWhen(when, zone, now)

export const saveAction = (session: MeasurementSession, values: Values, measuredAt: number): MeasurementAction => {
  const { actionId, target } = session
  if (target === null) return { kind: "logMeasurement", payload: { actionId, measuredAt, ...values } }
  const payload = { actionId, version: target.version, measuredAt, ...values }
  return { kind: "editMeasurement", id: target.id, payload }
}

export const deleteAction = ({ id, version }: Target): MeasurementAction => ({
  kind: "deleteMeasurement",
  id,
  payload: { actionId: crypto.randomUUID(), version },
})

export const recordOf = (failed: Failed | null, editing: string | null): string | null => {
  if (failed === null) return editing
  const { action } = failed.sending
  return "id" in action ? action.id : null
}
