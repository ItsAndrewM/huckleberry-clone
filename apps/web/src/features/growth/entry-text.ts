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
  switch (reading.issue) {
    case "not_a_number":
      return "Enter a number."
    case "ounces":
      return "Ounces go up to 15.9."
    case "out_of_range":
      return "Out of range. Check the number and its unit."
  }
}
