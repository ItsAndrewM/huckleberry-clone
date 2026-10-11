import type { Measurement } from "@bt/contracts"
import type { GrowthMetric } from "@bt/domain"

export interface GrowthMetricInfo {
  readonly metric: GrowthMetric
  readonly label: string
  readonly name: string
  readonly indicator: string
  readonly recorded: (measurement: Measurement) => number | null
}

export const GROWTH_METRICS = [
  {
    metric: "weightForAge",
    label: "Weight",
    name: "Weight",
    indicator: "Weight-for-age",
    recorded: ({ weightG }) => weightG,
  },
  {
    metric: "lengthForAge",
    label: "Length",
    name: "Length",
    indicator: "Length-for-age",
    recorded: ({ lengthCm }) => lengthCm,
  },
  {
    metric: "headCircumferenceForAge",
    label: "Head",
    name: "Head circumference",
    indicator: "Head circumference-for-age",
    recorded: ({ headCm }) => headCm,
  },
] as const satisfies ReadonlyArray<GrowthMetricInfo>
