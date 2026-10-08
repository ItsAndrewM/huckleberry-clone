export const GRAMS_PER_POUND = 453.59237
export const OUNCES_PER_POUND = 16
export const GRAMS_PER_OUNCE = GRAMS_PER_POUND / OUNCES_PER_POUND
export const CM_PER_INCH = 2.54
export const ML_PER_FL_OZ = 29.5735295625

export interface PoundsOunces {
  readonly pounds: number
  readonly ounces: number
}

export const roundTo = (value: number, decimals: number): number => {
  const scale = 10 ** decimals
  return Math.round(value * scale) / scale
}

export const gramsFromPoundsOunces = (pounds: number, ounces: number): number =>
  (pounds * OUNCES_PER_POUND + ounces) * GRAMS_PER_OUNCE

export const poundsOuncesFromGrams = (grams: number, ounceDecimals: number): PoundsOunces => {
  const totalOunces = roundTo(grams / GRAMS_PER_OUNCE, ounceDecimals)
  const pounds = Math.floor(totalOunces / OUNCES_PER_POUND)
  return { pounds, ounces: roundTo(totalOunces - pounds * OUNCES_PER_POUND, ounceDecimals) }
}

export const cmFromInches = (inches: number): number => inches * CM_PER_INCH

export const inchesFromCm = (cm: number): number => cm / CM_PER_INCH

export const flOzFromMl = (ml: number): number => ml / ML_PER_FL_OZ

export const mlFromFlOz = (flOz: number): number => roundTo(flOz * ML_PER_FL_OZ, 1)
