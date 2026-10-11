import {
  MAX_HEAD_CM,
  MAX_LENGTH_CM,
  MAX_WEIGHT_G,
  MIN_HEAD_CM,
  MIN_LENGTH_CM,
  MIN_WEIGHT_G,
  type Units,
} from "@bt/contracts"
import { CM_PER_INCH, gramsFromPoundsOunces, poundsOuncesFromGrams, roundTo, validateOuncePart } from "@bt/domain"

export type WeightUnit = Units["weight"]
export type LengthUnit = Units["length"]
export type EntryUnit = WeightUnit | LengthUnit

export interface Entry<Unit extends EntryUnit> {
  readonly unit: Unit
  readonly base: number | null
  readonly text: string
  readonly ounces: string
}

export type EntryIssue = "not_a_number" | "ounces" | "out_of_range"

export type Reading =
  | { readonly kind: "empty" }
  | { readonly kind: "value"; readonly value: number }
  | { readonly kind: "invalid"; readonly issue: EntryIssue }

export interface Limits {
  readonly min: number
  readonly max: number
}

export type MetricKey = "weightG" | "lengthCm" | "headCm"

export const LIMITS = {
  weightG: { min: MIN_WEIGHT_G, max: MAX_WEIGHT_G },
  lengthCm: { min: MIN_LENGTH_CM, max: MAX_LENGTH_CM },
  headCm: { min: MIN_HEAD_CM, max: MAX_HEAD_CM },
} as const satisfies { readonly [key in MetricKey]: Limits }

const RECORDED_PER_UNIT = { kg: 1000, g: 1, cm: 1, in: CM_PER_INCH } as const
const SHOWN_DECIMALS = { kg: 3, g: 0, cm: 1, in: 2 } as const

const shown = (base: number | null, unit: EntryUnit) => {
  if (base === null) return { text: "", ounces: "" }
  if (unit !== "lb_oz")
    return { text: String(roundTo(base / RECORDED_PER_UNIT[unit], SHOWN_DECIMALS[unit])), ounces: "" }
  const { pounds, ounces } = poundsOuncesFromGrams(base, 1)
  return { text: String(pounds), ounces: String(ounces) }
}

export const entryOf = <Unit extends EntryUnit>(base: number | null, unit: Unit): Entry<Unit> => ({
  unit,
  base,
  ...shown(base, unit),
})

const EMPTY: Reading = { kind: "empty" }

const valued = (value: number | null): Reading => (value === null ? EMPTY : { kind: "value", value })

const invalid = (issue: EntryIssue): Reading => ({ kind: "invalid", issue })

const untouched = (entry: Entry<EntryUnit>) => {
  const { text, ounces } = shown(entry.base, entry.unit)
  return entry.text === text && entry.ounces === ounces
}

const DECIMAL = /^(?:\d+\.?\d*|\.\d+)$/u

const typed = (text: string) => {
  const trimmed = text.trim()
  if (trimmed === "") return 0
  return DECIMAL.test(trimmed) ? Number(trimmed) : null
}

const parsedPoundsOunces = ({ text, ounces }: Entry<EntryUnit>): Reading => {
  const pounds = typed(text)
  const extra = typed(ounces)
  if (pounds === null || extra === null) return invalid("not_a_number")
  return validateOuncePart(extra) === null ? valued(gramsFromPoundsOunces(pounds, extra)) : invalid("ounces")
}

const parsed = (entry: Entry<EntryUnit>): Reading => {
  if (untouched(entry)) return valued(entry.base)
  if (entry.text.trim() === "" && entry.ounces.trim() === "") return EMPTY
  if (entry.unit === "lb_oz") return parsedPoundsOunces(entry)
  const value = typed(entry.text)
  return value === null ? invalid("not_a_number") : valued(value * RECORDED_PER_UNIT[entry.unit])
}

export const readingOf = (entry: Entry<EntryUnit>, { min, max }: Limits): Reading => {
  const reading = parsed(entry)
  if (reading.kind !== "value") return reading
  return reading.value >= min && reading.value <= max ? reading : invalid("out_of_range")
}

export const withUnit = <Unit extends EntryUnit>(entry: Entry<Unit>, unit: Unit): Entry<Unit> =>
  untouched(entry) ? entryOf(entry.base, unit) : { ...entry, unit, ounces: unit === "lb_oz" ? entry.ounces : "" }
