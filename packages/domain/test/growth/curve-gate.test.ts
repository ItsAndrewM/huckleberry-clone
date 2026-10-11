import { describe, expect, it } from "vitest"
import hcfaPercentiles from "../../data/who/hcfa-girls-percentiles-expanded-tables.json" with { type: "json" }
import lhfaPercentiles from "../../data/who/lhfa-girls-percentiles-expanded-tables.json" with { type: "json" }
import wfaPercentiles from "../../data/who/wfa-girls-percentiles-expanded-tables.json" with { type: "json" }
import { valueAtPercentile, WHO_LAST_DAY } from "../../src/index.ts"

const WHO_PRINT_ROUNDING = 0.0005
const FLOAT_NOISE = 1e-9

const INDICATORS = [
  { metric: "weightForAge", recordedPerWhoUnit: 1000, percentiles: wfaPercentiles },
  { metric: "lengthForAge", recordedPerWhoUnit: 1, percentiles: lhfaPercentiles },
  { metric: "headCircumferenceForAge", recordedPerWhoUnit: 1, percentiles: hcfaPercentiles },
] as const

const CURVE_COLUMNS = [
  { column: "P3", curve: 3 },
  { column: "P15", curve: 15 },
  { column: "P50", curve: 50 },
  { column: "P85", curve: 85 },
  { column: "P97", curve: 97 },
] as const

const DAYS = Array.from({ length: WHO_LAST_DAY + 1 }, (_, day) => day)

const curveCases = INDICATORS.flatMap(({ metric, recordedPerWhoUnit, percentiles }) =>
  CURVE_COLUMNS.map(({ column, curve }) => ({
    metric,
    column,
    curve,
    recordedPerWhoUnit,
    printed: percentiles[column],
  })),
)

describe("the curve gate: WHO's printed P3 to P97, drawn from its L, M and S", () => {
  it.each(curveCases)(
    "draws WHO's $column for $metric within its printed rounding, on every day from 0 to 730",
    ({ metric, curve, recordedPerWhoUnit, printed }) => {
      const misses = DAYS.filter((day) => {
        const value = printed[day]
        const drawn = valueAtPercentile(metric, "female", day, curve)
        if (value === undefined || drawn === "unavailable") return true
        return Math.abs(drawn / recordedPerWhoUnit - value) > WHO_PRINT_ROUNDING + FLOAT_NOISE
      })
      expect(misses).toEqual([])
    },
  )
})
