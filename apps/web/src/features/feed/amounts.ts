import { MAX_BOTTLE_ML, type VolumeUnit } from "@bt/contracts"
import { flOzFromMl, mlFromFlOz, roundTo } from "@bt/domain"

export const STEP_ML = 10
export const STEP_FL_OZ = 0.5

export const UNIT_LABELS = { ml: "mL", fl_oz: "fl oz" } as const satisfies Record<VolumeUnit, string>

const clamped = (ml: number) => Math.min(MAX_BOTTLE_ML, Math.max(0, roundTo(ml, 1)))

export const amountText = (ml: number, unit: VolumeUnit) =>
  unit === "ml" ? String(roundTo(ml, 1)) : roundTo(flOzFromMl(ml), 1).toFixed(1)

export const stepped = (ml: number, unit: VolumeUnit, steps: number) => {
  if (unit === "ml") return clamped(ml + steps * STEP_ML)
  return clamped(mlFromFlOz(roundTo(flOzFromMl(ml), 1) + steps * STEP_FL_OZ))
}

export const parsedAmount = (text: string, unit: VolumeUnit): number | null => {
  const value = text.trim() === "" ? 0 : Number(text)
  if (!Number.isFinite(value) || value < 0) return null
  const ml = unit === "ml" ? roundTo(value, 1) : mlFromFlOz(value)
  return ml <= MAX_BOTTLE_ML ? ml : null
}
