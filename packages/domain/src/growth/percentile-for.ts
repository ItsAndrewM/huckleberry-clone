import { percentile } from "./normal-cdf.ts"
import { girlsLms, type GrowthMetric } from "./who-lms.ts"
import { zScoreLMS } from "./z-score.ts"

type Sex = "female" | "male"

const RECORDED_PER_WHO_UNIT = {
  weightForAge: 1000,
  lengthForAge: 1,
  headCircumferenceForAge: 1,
} satisfies { readonly [metric in GrowthMetric]: number }

export const zScoreFor = (metric: GrowthMetric, sex: Sex, ageDays: number, value: number): number | "unavailable" => {
  const lms = sex === "female" ? girlsLms(metric, ageDays) : null
  if (lms === null || !(Number.isFinite(value) && value > 0)) return "unavailable"
  return zScoreLMS(value / RECORDED_PER_WHO_UNIT[metric], lms)
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
