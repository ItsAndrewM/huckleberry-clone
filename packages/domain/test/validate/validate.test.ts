import { describe, expect, it } from "vitest"
import {
  FUTURE_TOLERANCE_MS,
  validateDurationSeconds,
  validateEndAfterStart,
  validateNotBeforeBirth,
  validateNotInFuture,
  validateOunces,
  validateVolumeMl,
} from "../../src/index.ts"
import { VANCOUVER } from "../fixtures/zones.ts"

const at = (iso: string) => Date.parse(iso)

describe("validateVolumeMl", () => {
  it.each([60, 0.1, 40.1, 1000])("accepts %s mL", (ml) => {
    expect(validateVolumeMl(ml)).toBeNull()
  })

  it.each([
    [0, "not_positive"],
    [-5, "not_positive"],
    [Number.NaN, "not_finite"],
    [Number.POSITIVE_INFINITY, "not_finite"],
    [40.15, "too_many_decimals"],
    [0.01, "too_many_decimals"],
  ])("rejects %s mL as %s", (ml, issue) => {
    expect(validateVolumeMl(ml)).toBe(issue)
  })
})

describe("validateDurationSeconds", () => {
  it.each([
    [1, null],
    [0, "not_positive"],
    [-60, "not_positive"],
    [Number.NaN, "not_finite"],
  ])("%s seconds gives %s", (seconds, issue) => {
    expect(validateDurationSeconds(seconds)).toBe(issue)
  })
})

describe("validateEndAfterStart", () => {
  it.each([
    [10, 11, null],
    [10, 10, "end_not_after_start"],
    [11, 10, "end_not_after_start"],
  ])("start %s, end %s gives %s", (start, end, issue) => {
    expect(validateEndAfterStart(start, end)).toBe(issue)
  })
})

describe("validateNotBeforeBirth", () => {
  const birthDate = "2026-09-20"
  const birthDayStart = at("2026-09-20T07:00:00Z")

  it("accepts anything from local midnight on the birth date", () => {
    expect(validateNotBeforeBirth(birthDayStart, birthDate, VANCOUVER)).toBeNull()
  })

  it("rejects the evening before, in the household's time zone", () => {
    expect(validateNotBeforeBirth(birthDayStart - 1, birthDate, VANCOUVER)).toBe("before_birth")
  })
})

describe("validateNotInFuture", () => {
  const now = at("2026-10-06T18:00:00Z")

  it("allows up to five minutes ahead of the server, for phone clock skew (AC 21)", () => {
    expect(FUTURE_TOLERANCE_MS).toBe(5 * 60_000)
    expect(validateNotInFuture(now + FUTURE_TOLERANCE_MS, now)).toBeNull()
    expect(validateNotInFuture(now - 60_000, now)).toBeNull()
  })

  it("rejects anything later", () => {
    expect(validateNotInFuture(now + FUTURE_TOLERANCE_MS + 1, now)).toBe("in_future")
  })

  it("takes a different tolerance", () => {
    expect(validateNotInFuture(now + 1, now, 0)).toBe("in_future")
  })
})

describe("validateOunces", () => {
  it.each([
    [0, null],
    [15.9, null],
    [16, "out_of_range"],
    [-0.1, "out_of_range"],
    [Number.NaN, "not_finite"],
  ])("%s oz gives %s", (ounces, issue) => {
    expect(validateOunces(ounces)).toBe(issue)
  })
})
