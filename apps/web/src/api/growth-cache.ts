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
      const current = growth.measurements.find(({ id }) => id === action.id)
      return current === undefined ? growth : withMeasurement(growth, edited(current, action.payload, author))
    }
    case "deleteMeasurement":
      return without(growth, action.id)
  }
}

export const savedGrowth = (growth: Growth, { measurement }: SavedMeasurement, action: MeasurementAction): Growth => {
  const settled = without(growth, pendingId(action.payload.actionId))
  return measurement.deletedAt === null ? withMeasurement(settled, measurement) : without(settled, measurement.id)
}

const measurementIn = (growth: Growth, id: string) => growth.measurements.find((measurement) => measurement.id === id)

export const withdrawnGrowth = (growth: Growth, action: MeasurementAction, before: Growth): Growth => {
  if (action.kind === "logMeasurement") return without(growth, pendingId(action.payload.actionId))
  const previous = measurementIn(before, action.id)
  const current = measurementIn(growth, action.id)
  if (previous === undefined || (current !== undefined && current.version !== previous.version)) return growth
  return withMeasurement(growth, previous)
}
