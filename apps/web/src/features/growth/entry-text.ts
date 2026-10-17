import { NUMBER_MESSAGES } from "../../number-messages.ts"
import type { EntryUnit, LengthUnit, Reading, WeightUnit } from "./entry.ts"

export interface UnitChoice<Unit extends EntryUnit> {
  readonly unit: Unit
  readonly label: string
}

export const WEIGHT_UNITS = [
  { unit: "kg", label: "kg" },
  { unit: "g", label: "g" },
  { unit: "lb_oz", label: "lb & oz" },
] as const satisfies ReadonlyArray<UnitChoice<WeightUnit>>

export const LENGTH_UNITS = [
  { unit: "cm", label: "cm" },
  { unit: "in", label: "in" },
] as const satisfies ReadonlyArray<UnitChoice<LengthUnit>>

export const entryMessage = (reading: Reading) => {
  if (reading.kind !== "invalid") return null
  return reading.issue === "ounces" ? "Ounces go up to 15.9." : NUMBER_MESSAGES[reading.issue]
}
