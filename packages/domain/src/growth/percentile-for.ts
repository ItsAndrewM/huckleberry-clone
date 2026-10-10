import { percentile } from "./normal-cdf.ts"
import { girlsLms, type GrowthMetric } from "./who-lms.ts"
import { valueAtZ, zScoreLMS } from "./z-score.ts"

type Sex = "female" | "male"

const RECORDED_PER_WHO_UNIT = {
  weightForAge: 1000,
  lengthForAge: 1,
  headCircumferenceForAge: 1,
} satisfies { readonly [metric in GrowthMetric]: number }

export const CURVE_PERCENTILES = [3, 15, 50, 85, 97] as const
export type CurvePercentile = (typeof CURVE_PERCENTILES)[number]

const Z_OF_CURVE = {
  3: -1.8807936081512509,
  15: -1.0364333894937898,
  50: 0,
  85: 1.0364333894937898,
  97: 1.8807936081512509,
} satisfies { readonly [curve in CurvePercentile]: number }

export const zScoreFor = (metric: GrowthMetric, sex: Sex, ageDays: number, value: number): number | "unavailable" => {
  const lms = sex === "female" ? girlsLms(metric, ageDays) : null
  const whoValue = value / RECORDED_PER_WHO_UNIT[metric]
  if (lms === null || !(Number.isFinite(whoValue) && whoValue > 0)) return "unavailable"
  return zScoreLMS(whoValue, lms)
}

export const percentileFor = (
  metric: GrowthMetric,
  sex: Sex,
  ageDays: number,
  value: number,
): number | "unavailable" => {
  const z = zScoreFor(metric, sex, ageDays, value)
  return z === "unavailable" ? z : percentile(z)
}

export const valueAtPercentile = (
  metric: GrowthMetric,
  sex: Sex,
  ageDays: number,
  curve: CurvePercentile,
): number | "unavailable" => {
  const lms = sex === "female" ? girlsLms(metric, ageDays) : null
  return lms === null ? "unavailable" : valueAtZ(lms, Z_OF_CURVE[curve]) * RECORDED_PER_WHO_UNIT[metric]
}
