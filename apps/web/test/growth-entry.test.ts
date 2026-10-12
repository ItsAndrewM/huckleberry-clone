import { MAX_HEAD_CM, MAX_LENGTH_CM, MAX_WEIGHT_G, MIN_HEAD_CM, MIN_LENGTH_CM, MIN_WEIGHT_G } from "@bt/contracts"
import { CM_PER_INCH, gramsFromPoundsOunces } from "@bt/domain"
import { describe, expect, it } from "vitest"
import { entryMessage } from "../src/features/growth/entry-text.ts"
import { type Entry, type EntryUnit, entryOf, LIMITS, readingOf, withUnit } from "../src/features/growth/entry.ts"

const typedIn = <Unit extends EntryUnit>(unit: Unit, text: string, ounces = ""): Entry<Unit> => ({
  ...entryOf(null, unit),
  text,
  ounces,
})

describe("entryOf", () => {
  it.each([
    [4325.6, "kg", "4.326", ""],
    [4300, "kg", "4.3", ""],
    [4325.6, "g", "4326", ""],
    [4300, "lb_oz", "9", "7.7"],
    [3600, "lb_oz", "7", "15"],
    [54.5, "cm", "54.5", ""],
    [54.5, "in", "21.46", ""],
  ] as const)("shows %d stored as %s in the box as %j and %j", (base, unit, text, ounces) => {
    expect(entryOf(base, unit)).toEqual({ unit, base, text, ounces })
  })

  it("leaves the box empty for a metric that wasn't measured", () => {
    expect(entryOf(null, "lb_oz")).toEqual({ unit: "lb_oz", base: null, text: "", ounces: "" })
  })
})

describe("readingOf", () => {
  it("reads a value the parent hasn't touched as stored, not as the box rounds it", () => {
    expect(readingOf(entryOf(4325.678, "lb_oz"), LIMITS.weightG)).toEqual({ kind: "value", value: 4325.678 })
    expect(readingOf(entryOf(54.55, "in"), LIMITS.lengthCm)).toEqual({ kind: "value", value: 54.55 })
  })

  it.each([
    ["kg", "4.325", "", 4325],
    ["kg", "4.", "", 4000],
    ["kg", ".5", "", 500],
    ["g", " 4325 ", "", 4325],
    ["lb_oz", "9", "8.5", 4323.302277],
    ["lb_oz", "", "8", gramsFromPoundsOunces(0, 8)],
    ["lb_oz", "9", "", gramsFromPoundsOunces(9, 0)],
  ] as const)("reads a typed weight in %s, %j and %j, in grams", (unit, text, ounces, grams) => {
    expect(readingOf(typedIn(unit, text, ounces), LIMITS.weightG)).toEqual({ kind: "value", value: grams })
  })

  it("reads a typed length in inches in centimetres", () => {
    expect(readingOf(typedIn("in", "21.5"), LIMITS.lengthCm)).toEqual({ kind: "value", value: 21.5 * CM_PER_INCH })
  })

  it.each([
    [typedIn("kg", "1.001"), LIMITS.weightG, 1001],
    [typedIn("in", "8.04"), LIMITS.lengthCm, 20.4216],
    [typedIn("lb_oz", "9", "7.7"), LIMITS.weightG, 4300.622658],
  ] as const)("stores %j to six decimals, without the noise of converting it", (entry, limits, stored) => {
    expect(readingOf(entry, limits)).toEqual({ kind: "value", value: stored })
  })

  it("keeps a value the parent hasn't touched exactly as stored, noise and all", () => {
    expect(readingOf(entryOf(1000.9999999999999, "kg"), LIMITS.weightG)).toEqual({
      kind: "value",
      value: 1000.9999999999999,
    })
  })

  it("applies the limits to the rounded number, the one that is stored", () => {
    expect(readingOf(typedIn("g", "199.9999996"), LIMITS.weightG)).toEqual({ kind: "value", value: 200 })
  })

  it("reads a box the parent cleared as no value", () => {
    expect(readingOf({ ...entryOf(4300, "kg"), text: " " }, LIMITS.weightG)).toEqual({ kind: "empty" })
    expect(readingOf({ ...entryOf(4300, "lb_oz"), text: "", ounces: "" }, LIMITS.weightG)).toEqual({ kind: "empty" })
  })

  it.each([
    [typedIn("kg", "abc"), "not_a_number"],
    [typedIn("kg", "4,3"), "not_a_number"],
    [typedIn("kg", "-4"), "not_a_number"],
    [typedIn("kg", "+4"), "not_a_number"],
    [typedIn("kg", "."), "not_a_number"],
    [typedIn("kg", "4.3.2"), "not_a_number"],
    [typedIn("kg", "1e1"), "not_a_number"],
    [typedIn("kg", "0x10"), "not_a_number"],
    [typedIn("kg", "Infinity"), "not_a_number"],
    [typedIn("lb_oz", "9", "x"), "not_a_number"],
    [typedIn("lb_oz", "9", "16"), "ounces"],
    [typedIn("kg", "0"), "out_of_range"],
    [typedIn("kg", "40.001"), "out_of_range"],
    [typedIn("g", "199"), "out_of_range"],
  ] as const)("refuses %j as %s", (entry, issue) => {
    expect(readingOf(entry, LIMITS.weightG)).toEqual({ kind: "invalid", issue })
  })

  it("refuses a run of digits too long to be finite, though it matches the pattern", () => {
    const tooLong = "9".repeat(400)
    expect(readingOf(typedIn("kg", tooLong), LIMITS.weightG)).toEqual({ kind: "invalid", issue: "not_a_number" })
    expect(readingOf(typedIn("lb_oz", "9", tooLong), LIMITS.weightG)).toEqual({
      kind: "invalid",
      issue: "not_a_number",
    })
  })

  it.each([
    [typedIn("g", String(MIN_WEIGHT_G)), LIMITS.weightG, MIN_WEIGHT_G],
    [typedIn("kg", String(MAX_WEIGHT_G / 1000)), LIMITS.weightG, MAX_WEIGHT_G],
    [typedIn("cm", String(MIN_LENGTH_CM)), LIMITS.lengthCm, MIN_LENGTH_CM],
    [typedIn("cm", String(MAX_LENGTH_CM)), LIMITS.lengthCm, MAX_LENGTH_CM],
    [typedIn("cm", String(MIN_HEAD_CM)), LIMITS.headCm, MIN_HEAD_CM],
    [typedIn("cm", String(MAX_HEAD_CM)), LIMITS.headCm, MAX_HEAD_CM],
  ] as const)("takes %j, exactly at its limit, as a value", (entry, limits, value) => {
    expect(readingOf(entry, limits)).toEqual({ kind: "value", value })
  })

  it.each([
    [typedIn("cm", String(MAX_LENGTH_CM + 0.1)), LIMITS.lengthCm],
    [typedIn("cm", String(MIN_HEAD_CM - 0.1)), LIMITS.headCm],
    [typedIn("cm", String(MAX_HEAD_CM + 0.1)), LIMITS.headCm],
  ] as const)("refuses %j, just outside its limit, as out_of_range", (entry, limits) => {
    expect(readingOf(entry, limits)).toEqual({ kind: "invalid", issue: "out_of_range" })
  })

  it("holds each metric to its own limits", () => {
    expect(readingOf(typedIn("cm", "19.9"), LIMITS.lengthCm)).toEqual({ kind: "invalid", issue: "out_of_range" })
    expect(readingOf(typedIn("cm", "19.9"), LIMITS.headCm)).toEqual({ kind: "value", value: 19.9 })
  })
})

describe("withUnit", () => {
  it("keeps a stored value exact when the parent only switches units", () => {
    const there = withUnit(entryOf(4325.678, "kg"), "lb_oz")
    expect(there).toMatchObject({ unit: "lb_oz", text: "9", ounces: "8.6" })
    expect(readingOf(withUnit(there, "g"), LIMITS.weightG)).toEqual({ kind: "value", value: 4325.678 })
  })

  it("reads a number the parent typed in the unit picked after it", () => {
    const switched = withUnit(typedIn("kg", "4325"), "g")
    expect(switched).toEqual({ unit: "g", base: null, text: "4325", ounces: "" })
    expect(readingOf(switched, LIMITS.weightG)).toEqual({ kind: "value", value: 4325 })
  })

  it("drops typed ounces when the weight moves to a unit without them", () => {
    expect(withUnit(typedIn("lb_oz", "9", "8"), "kg")).toEqual({ unit: "kg", base: null, text: "9", ounces: "" })
  })

  it("keeps text it can't read as typed, under the new unit", () => {
    expect(withUnit(typedIn("cm", "abc"), "in")).toEqual({ unit: "in", base: null, text: "abc", ounces: "" })
  })
})

describe("entryMessage", () => {
  it.each([
    [typedIn("kg", "abc"), "Enter a number."],
    [typedIn("lb_oz", "9", "16"), "Ounces go up to 15.9."],
    [typedIn("kg", "4325"), "Out of range. Check the number and its unit."],
  ] as const)("explains %j", (entry, message) => {
    expect(entryMessage(readingOf(entry, LIMITS.weightG))).toBe(message)
  })

  it("says nothing about a value it can read, or an empty box", () => {
    expect(entryMessage(readingOf(typedIn("kg", "4.3"), LIMITS.weightG))).toBeNull()
    expect(entryMessage(readingOf(entryOf(null, "kg"), LIMITS.weightG))).toBeNull()
  })
})
