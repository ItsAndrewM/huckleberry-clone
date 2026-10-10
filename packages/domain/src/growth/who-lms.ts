import lmsGirls from "../../data/who/lms-girls.json" with { type: "json" }

export type GrowthMetric = "weightForAge" | "lengthForAge" | "headCircumferenceForAge"

export interface Lms {
  readonly L: number
  readonly M: number
  readonly S: number
}

export const WHO_LAST_DAY = 730

export const girlsLms = (metric: GrowthMetric, ageDays: number): Lms | null => lmsGirls[metric][ageDays] ?? null
