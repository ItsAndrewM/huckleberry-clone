import { describe, expect, it } from "vitest"
import { girlsLms, type GrowthMetric, WHO_LAST_DAY } from "../../src/index.ts"

const METRICS: readonly GrowthMetric[] = ["weightForAge", "lengthForAge", "headCircumferenceForAge"]

describe("girlsLms", () => {
  it.each([
    { metric: "weightForAge", day: 0, lms: { L: 0.3809, M: 3.2322, S: 0.14171 } },
    { metric: "weightForAge", day: 730, lms: { L: -0.294, M: 11.4741, S: 0.12389 } },
    { metric: "lengthForAge", day: 0, lms: { L: 1, M: 49.1477, S: 0.0379 } },
    { metric: "lengthForAge", day: 730, lms: { L: 1, M: 86.4008, S: 0.03733 } },
    { metric: "headCircumferenceForAge", day: 0, lms: { L: 1, M: 33.8787, S: 0.03496 } },
    { metric: "headCircumferenceForAge", day: 730, lms: { L: 1, M: 47.1799, S: 0.02958 } },
  ] as const)("gives WHO's L, M and S for $metric on day $day", ({ metric, day, lms }) => {
    expect(girlsLms(metric, day)).toEqual(lms)
  })

  it.each(METRICS)("has a row for every day from birth to day 730 of %s", (metric) => {
    const days = Array.from({ length: WHO_LAST_DAY + 1 }, (_, day) => girlsLms(metric, day))
    expect(days).toHaveLength(731)
    expect(days.filter((lms) => lms === null)).toEqual([])
  })

  it.each([-1, 731, 0.5, Number.NaN, Number.POSITIVE_INFINITY])("has nothing for day %s", (day) => {
    expect(METRICS.map((metric) => girlsLms(metric, day))).toEqual([null, null, null])
  })
})
