import type { Growth, Measurement, MeasurementEdit, SavedMeasurement } from "@bt/contracts"
import type { MeasurementAction } from "./actions.ts"
import { type Author, pendingId, pendingMeasurement } from "./pending.ts"

const without = (growth: Growth, id: string): Growth => ({
  measurements: growth.measurements.filter((measurement) => measurement.id !== id),
})

const withMeasurement = (growth: Growth, measurement: Measurement): Growth => ({
  measurements: [measurement, ...without(growth, measurement.id).measurements].toSorted(
    (a, b) => b.measuredAt - a.measuredAt,
  ),
})

const measurementIn = (growth: Growth, id: string) => growth.measurements.find((measurement) => measurement.id === id)

const edited = (
  measurement: Measurement,
  { measuredAt, weightG, lengthCm, headCm }: MeasurementEdit,
  { by, now }: Author,
): Measurement => ({ ...measurement, measuredAt, weightG, lengthCm, headCm, updatedBy: by, updatedAt: now })

export const pendingGrowth = (growth: Growth, action: MeasurementAction, author: Author): Growth => {
  switch (action.kind) {
    case "logMeasurement":
      return withMeasurement(growth, pendingMeasurement(action.payload, author))
    case "editMeasurement": {
      const current = measurementIn(growth, action.id)
      return current === undefined ? growth : withMeasurement(growth, edited(current, action.payload, author))
    }
    case "deleteMeasurement":
      return measurementIn(growth, action.id) === undefined ? growth : without(growth, action.id)
    case "restoreMeasurement":
      return growth
  }
}

export const savedGrowth = (growth: Growth, { measurement }: SavedMeasurement, action: MeasurementAction): Growth => {
  const settled = without(growth, pendingId(action.payload.actionId))
  return measurement.deletedAt === null ? withMeasurement(settled, measurement) : without(settled, measurement.id)
}

export const withdrawnGrowth = (growth: Growth, action: MeasurementAction, before: Growth): Growth => {
  if (action.kind === "logMeasurement") return without(growth, pendingId(action.payload.actionId))
  const previous = measurementIn(before, action.id)
  if (previous === undefined) return growth
  const current = measurementIn(growth, action.id)
  const newerChangeOwnsIt =
    current === undefined ? action.kind === "editMeasurement" : current.version !== previous.version
  return newerChangeOwnsIt ? growth : withMeasurement(growth, previous)
}
