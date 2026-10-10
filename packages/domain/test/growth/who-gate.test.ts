import { describe, expect, it } from "vitest"
import hcfaPercentiles from "../../data/who/hcfa-girls-percentiles-expanded-tables.json" with { type: "json" }
import hcfaZScores from "../../data/who/hcfa-girls-zscore-expanded-tables.json" with { type: "json" }
import lhfaPercentiles from "../../data/who/lhfa-girls-percentiles-expanded-tables.json" with { type: "json" }
import lhfaZScores from "../../data/who/lhfa-girls-zscore-expanded-tables.json" with { type: "json" }
import wfaPercentiles from "../../data/who/wfa-girls-percentiles-expanded-tables.json" with { type: "json" }
import wfaZScores from "../../data/who/wfa-girls-zscore-expanded-tables.json" with { type: "json" }
import { percentileFor, WHO_LAST_DAY, zScoreFor } from "../../src/index.ts"

const PERCENTILE_TOLERANCE = 0.5
const Z_TOLERANCE = 0.002

const INDICATORS = [
  { metric: "weightForAge", recordedPerWhoUnit: 1000, percentiles: wfaPercentiles, zScores: wfaZScores },
  { metric: "lengthForAge", recordedPerWhoUnit: 1, percentiles: lhfaPercentiles, zScores: lhfaZScores },
  { metric: "headCircumferenceForAge", recordedPerWhoUnit: 1, percentiles: hcfaPercentiles, zScores: hcfaZScores },
] as const

const PERCENTILE_COLUMNS = [
  { column: "P3", expected: 3 },
  { column: "P15", expected: 15 },
  { column: "P50", expected: 50 },
  { column: "P85", expected: 85 },
  { column: "P97", expected: 97 },
] as const

const SD_COLUMNS = [
  { column: "SD4neg", expected: -4 },
  { column: "SD3neg", expected: -3 },
  { column: "SD2neg", expected: -2 },
  { column: "SD1neg", expected: -1 },
  { column: "SD0", expected: 0 },
  { column: "SD1", expected: 1 },
  { column: "SD2", expected: 2 },
  { column: "SD3", expected: 3 },
  { column: "SD4", expected: 4 },
] as const

const DAYS = Array.from({ length: WHO_LAST_DAY + 1 }, (_, day) => day)

const within = (score: number | "unavailable", expected: number, tolerance: number) =>
  score !== "unavailable" && Math.abs(score - expected) <= tolerance

const percentileCases = INDICATORS.flatMap(({ metric, recordedPerWhoUnit, percentiles }) =>
  PERCENTILE_COLUMNS.map(({ column, expected }) => ({
    metric,
    column,
    expected,
    recordedPerWhoUnit,
    published: percentiles[column],
  })),
)

const zScoreCases = INDICATORS.flatMap(({ metric, recordedPerWhoUnit, zScores }) =>
  SD_COLUMNS.map(({ column, expected }) => ({
    metric,
    column,
    expected,
    recordedPerWhoUnit,
    published: zScores[column],
  })),
)

describe("the percentile gate: WHO's own tables, read back through the engine", () => {
  it.each(percentileCases)(
    "maps WHO's $column for $metric to percentile $expected within 0.5 points, on every day from 0 to 730",
    ({ metric, expected, recordedPerWhoUnit, published }) => {
      const misses = DAYS.filter((day) => {
        const value = published[day]
        if (value === undefined) return true
        return !within(percentileFor(metric, "female", day, value * recordedPerWhoUnit), expected, PERCENTILE_TOLERANCE)
      })
      expect(misses).toEqual([])
    },
  )

  it.each(zScoreCases)(
    "maps WHO's $column for $metric to z $expected within 0.002, on every day from 0 to 730",
    ({ metric, expected, recordedPerWhoUnit, published }) => {
      const misses = DAYS.filter((day) => {
        const value = published[day]
        if (value === undefined) return true
        return !within(zScoreFor(metric, "female", day, value * recordedPerWhoUnit), expected, Z_TOLERANCE)
      })
      expect(misses).toEqual([])
    },
  )
})
