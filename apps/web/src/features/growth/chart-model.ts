import type { Measurement, Me, Sex, Units } from "@bt/contracts"
import {
  ageInDays,
  ageInMonthsAndDays,
  CM_PER_INCH,
  CURVE_PERCENTILES,
  type CurvePercentile,
  GRAMS_PER_POUND,
  type GrowthMetric,
  localDateOf,
  percentileFor,
  valueAtPercentile,
  WHO_LAST_DAY,
} from "@bt/domain"
import { formatAge, formatAgeWords, formatMeasuredOn, formatMeasurement, formatPercentile } from "./format.ts"
import type { GrowthMetricInfo } from "./metrics.ts"

export const DAYS_PER_MONTH = 30.4375

export interface AgeWindow {
  readonly months: number
  readonly lastDay: number
  readonly tickMonths: number
}

const AGE_WINDOWS = [
  { months: 6, lastDay: 182, tickMonths: 1 },
  { months: 12, lastDay: 365, tickMonths: 2 },
  { months: 24, lastDay: WHO_LAST_DAY, tickMonths: 3 },
] as const satisfies ReadonlyArray<AgeWindow>

export const ageWindowFor = (ageToday: number): AgeWindow =>
  AGE_WINDOWS.find(({ lastDay }) => ageToday <= lastDay) ?? AGE_WINDOWS[2]

export const monthTicks = ({ months, tickMonths }: AgeWindow): ReadonlyArray<number> =>
  Array.from({ length: months / tickMonths + 1 }, (_, index) => index * tickMonths)

export type AxisUnit = "kg" | "lb" | "cm" | "in"

export const axisLabel = (info: GrowthMetricInfo, unit: AxisUnit) => `${info.name} (${unit})`

export const axisUnitOf = (metric: GrowthMetric, units: Units): AxisUnit => {
  if (metric !== "weightForAge") return units.length
  return units.weight === "lb_oz" ? "lb" : "kg"
}

const RECORDED_PER_AXIS_UNIT = {
  kg: 1000,
  lb: GRAMS_PER_POUND,
  cm: 1,
  in: CM_PER_INCH,
} satisfies { readonly [unit in AxisUnit]: number }

export const inAxisUnit = (recorded: number, unit: AxisUnit): number => recorded / RECORDED_PER_AXIS_UNIT[unit]

export interface ChartPoint {
  readonly months: number
  readonly value: number
}

export interface Curve {
  readonly percentile: CurvePercentile
  readonly label: string
  readonly points: ReadonlyArray<ChartPoint>
}

export const curvesFor = (
  metric: GrowthMetric,
  sex: Sex,
  ageWindow: AgeWindow,
  unit: AxisUnit,
): ReadonlyArray<Curve> | "unavailable" => {
  if (valueAtPercentile(metric, sex, 0, 50) === "unavailable") return "unavailable"
  const days = Array.from({ length: ageWindow.lastDay + 1 }, (_, day) => day)
  return CURVE_PERCENTILES.map((percentile) => ({
    percentile,
    label: formatPercentile(percentile),
    points: days.flatMap((day) => {
      const value = valueAtPercentile(metric, sex, day, percentile)
      return value === "unavailable" ? [] : [{ months: day / DAYS_PER_MONTH, value: inAxisUnit(value, unit) }]
    }),
  }))
}

export interface CurveEnd extends ChartPoint {
  readonly label: string
}

export const curveEnds = (curves: ReadonlyArray<Curve>): ReadonlyArray<CurveEnd> =>
  curves.flatMap(({ label, points }) => {
    const end = points.at(-1)
    return end === undefined ? [] : [{ ...end, label }]
  })

export interface GrowthRow {
  readonly id: string
  readonly measuredOn: string
  readonly age: string
  readonly ageWords: string
  readonly value: string
  readonly percentile: string
  readonly point: ChartPoint | null
}

export const datedOf = (measurement: Measurement, { household, child }: Me, locale?: string) => {
  const measuredOn = localDateOf(measurement.measuredAt, household.timeZone)
  return {
    ageDays: ageInDays(measuredOn, child.birthDate),
    measuredOn: formatMeasuredOn(measurement.measuredAt, household.timeZone, locale),
    age: formatAge(ageInMonthsAndDays(measuredOn, child.birthDate)),
    ageWords: formatAgeWords(ageInMonthsAndDays(measuredOn, child.birthDate)),
  }
}

export const growthRowOf = (
  measurement: Measurement,
  info: GrowthMetricInfo,
  me: Me,
  locale?: string,
): GrowthRow | null => {
  const recorded = info.recorded(measurement)
  if (recorded === null) return null
  const { household, child } = me
  const { ageDays, measuredOn, age, ageWords } = datedOf(measurement, me, locale)
  const onTheChart = ageDays >= 0 && ageDays <= WHO_LAST_DAY
  return {
    id: measurement.id,
    measuredOn,
    age,
    ageWords,
    value: formatMeasurement(info.metric, recorded, household.units),
    percentile: formatPercentile(percentileFor(info.metric, child.sex, ageDays, recorded)),
    point: onTheChart
      ? { months: ageDays / DAYS_PER_MONTH, value: inAxisUnit(recorded, axisUnitOf(info.metric, household.units)) }
      : null,
  }
}

export const growthRows = (
  measurements: ReadonlyArray<Measurement>,
  info: GrowthMetricInfo,
  me: Me,
  locale?: string,
): ReadonlyArray<GrowthRow> => measurements.flatMap((measurement) => growthRowOf(measurement, info, me, locale) ?? [])
