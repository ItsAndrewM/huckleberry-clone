import { describe, expect, it } from "vitest"
import { clockTime } from "../src/clock-time.ts"
import { formatMinutes, formatSince, formatVolume, presentParts } from "../src/features/today/format.ts"
import { ZONE } from "./today-fixtures.ts"

describe("formatMinutes", () => {
  it.each([
    [0, "0 min"],
    [30, "<1 min"],
    [59, "<1 min"],
    [60, "1 min"],
    [42 * 60 + 59, "42 min"],
    [80 * 60, "1 h 20 min"],
    [120 * 60, "2 h"],
    [125 * 60, "2 h 5 min"],
  ])("shows %i seconds as %s", (seconds, shown) => {
    expect(formatMinutes(seconds)).toBe(shown)
  })
})

describe("formatSince", () => {
  it.each([
    [-5, "Just now"],
    [59, "Just now"],
    [60, "1 min"],
    [134 * 60, "2 h 14 min"],
  ])("shows %i seconds since as %s", (seconds, shown) => {
    expect(formatSince(seconds)).toBe(shown)
  })
})

describe("formatVolume", () => {
  it.each([
    [180, "ml", "180 mL"],
    [59.1, "ml", "59 mL"],
    [180, "fl_oz", "6.1 fl oz"],
    [59.1, "fl_oz", "2.0 fl oz"],
    [0, "fl_oz", "0.0 fl oz"],
  ] as const)("shows %f mL in %s as %s", (ml, unit, shown) => {
    expect(formatVolume(ml, unit)).toBe(shown)
  })
})

describe("clockTime", () => {
  const TEN_PAST_TWO_IN_VANCOUVER = Date.UTC(2026, 9, 9, 9, 10)
  const plain = (time: string) => time.replace(/\s/gu, " ")

  it("tells the time in the household's zone, whatever the phone's zone", () => {
    expect(plain(clockTime(TEN_PAST_TWO_IN_VANCOUVER, ZONE, "en-US"))).toBe("2:10 AM")
    expect(plain(clockTime(TEN_PAST_TWO_IN_VANCOUVER, "Europe/London", "en-US"))).toBe("10:10 AM")
  })

  it("follows the phone's way of writing times", () => {
    expect(plain(clockTime(TEN_PAST_TWO_IN_VANCOUVER, ZONE, "en-CA"))).toBe("2:10 a.m.")
    expect(clockTime(TEN_PAST_TWO_IN_VANCOUVER, ZONE, "en-GB")).toBe("2:10")
  })
})

describe("presentParts", () => {
  it("keeps the parts with something in them, in order", () => {
    expect(
      presentParts([
        [0, "Left"],
        [5, "Right"],
        [0.1, "Bottle"],
      ]),
    ).toEqual(["Right", "Bottle"])
  })
})
