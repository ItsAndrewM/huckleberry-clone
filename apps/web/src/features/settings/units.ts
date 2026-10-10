import { LengthUnit, type Units, VolumeUnit, WeightUnit } from "@bt/contracts"
import { Schema } from "effect"

export type UnitKind = keyof Units

export const UNIT_ROWS = [
  {
    kind: "volume",
    label: "Bottles",
    options: [
      { value: "ml", label: "mL" },
      { value: "fl_oz", label: "fl oz" },
    ],
  },
  {
    kind: "weight",
    label: "Weight",
    options: [
      { value: "kg", label: "kg" },
      { value: "g", label: "g" },
      { value: "lb_oz", label: "lb & oz" },
    ],
  },
  {
    kind: "length",
    label: "Length",
    options: [
      { value: "cm", label: "cm" },
      { value: "in", label: "in" },
    ],
  },
] as const satisfies ReadonlyArray<{
  kind: UnitKind
  label: string
  options: ReadonlyArray<{ value: string; label: string }>
}>

const isVolume = Schema.is(VolumeUnit)
const isWeight = Schema.is(WeightUnit)
const isLength = Schema.is(LengthUnit)

export const unitChange = (kind: UnitKind, value: string): Partial<Units> | undefined => {
  if (kind === "volume") return isVolume(value) ? { volume: value } : undefined
  if (kind === "weight") return isWeight(value) ? { weight: value } : undefined
  return isLength(value) ? { length: value } : undefined
}
