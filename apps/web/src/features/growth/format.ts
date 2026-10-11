import type { Units } from "@bt/contracts"
import { type GrowthMetric, inchesFromCm, type MonthsAndDays, poundsOuncesFromGrams, roundTo } from "@bt/domain"

const ORDINALS = new Intl.PluralRules("en-US", { type: "ordinal" })

const ORDINAL_SUFFIX = {
  zero: "th",
  one: "st",
  two: "nd",
  few: "rd",
  many: "th",
  other: "th",
} satisfies { readonly [rule in Intl.LDMLPluralRule]: string }

const ordinal = (whole: number) => `${whole}${ORDINAL_SUFFIX[ORDINALS.select(whole)]}`

export const formatPercentile = (percentile: number | "unavailable") => {
  if (percentile === "unavailable") return "Percentile unavailable"
  const whole = Math.round(percentile)
  if (whole < 1) return "<1st"
  return whole > 99 ? ">99th" : ordinal(whole)
}

export const formatAge = (age: MonthsAndDays | null) => {
  if (age === null) return "Before birth"
  const { months, days } = age
  if (months === 0) return days === 0 ? "Birth" : `${days} d`
  return days === 0 ? `${months} mo` : `${months} mo ${days} d`
}

const oneDecimal = (value: number) => roundTo(value, 1).toFixed(1)

const formatWeight = (grams: number, weight: Units["weight"]) => {
  if (weight === "g") return `${Math.round(grams)} g`
  if (weight === "kg") return `${roundTo(grams / 1000, 2).toFixed(2)} kg`
  const { pounds, ounces } = poundsOuncesFromGrams(grams, 1)
  return `${pounds} lb ${ounces.toFixed(1)} oz`
}

export const formatMeasurement = (metric: GrowthMetric, value: number, units: Units) => {
  if (metric === "weightForAge") return formatWeight(value, units.weight)
  return units.length === "in" ? `${oneDecimal(inchesFromCm(value))} in` : `${oneDecimal(value)} cm`
}

export const formatMeasuredOn = (instant: number, timeZone: string, locale?: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone }).format(instant)
