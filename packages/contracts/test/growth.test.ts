import { Exit, Result, Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  Growth,
  invalidInputFrom,
  MAX_HEAD_CM,
  MAX_LENGTH_CM,
  MAX_WEIGHT_G,
  type Measurement,
  MeasurementConflict,
  MeasurementEdit,
  MIN_HEAD_CM,
  MIN_LENGTH_CM,
  MIN_WEIGHT_G,
  NewMeasurement,
} from "../src/index.ts"

const ACTION_ID = "8b2f9c3e-1d4a-4f6b-9e7c-5a3b2c1d0e9f"
const AT = Date.UTC(2026, 9, 8, 14, 30)
const NO_METRICS = { weightG: null, lengthCm: null, headCm: null }

const MEASUREMENT: Measurement = {
  id: "measurement-1",
  measuredAt: AT,
  weightG: 4210.5,
  lengthCm: 54.2,
  headCm: null,
  version: 2,
  createdBy: "caregiver-1",
  createdAt: AT,
  updatedBy: "caregiver-2",
  updatedAt: AT + 60_000,
  deletedAt: null,
}

const fieldErrors = <A, I extends Schema.Json>(schema: Schema.Codec<A, I>, input: Schema.Json) => {
  const decoded = Schema.decodeUnknownResult(Schema.toCodecJson(schema), { errors: "all" })(input)
  return Result.isFailure(decoded) ? invalidInputFrom(decoded.failure.issue).fieldErrors : []
}

type Metric = "weightG" | "lengthCm" | "headCm"

const newMeasurement = (metrics: Partial<Record<Metric, Schema.Json>>) => ({
  actionId: ACTION_ID,
  measuredAt: AT,
  ...NO_METRICS,
  ...metrics,
})

describe("a new measurement", () => {
  it.each([
    ["a weight", { weightG: 3400 }],
    ["a length", { lengthCm: 51.5 }],
    ["a head circumference", { headCm: 34.75 }],
    ["a weight from pounds and ounces, unrounded", { weightG: 3401.942775 }],
  ])("can hold just %s", (_label, metrics) => {
    expect(fieldErrors(NewMeasurement, newMeasurement(metrics))).toEqual([])
  })

  it.each([
    ["its minimum", { weightG: MIN_WEIGHT_G, lengthCm: MIN_LENGTH_CM, headCm: MIN_HEAD_CM }],
    ["its maximum", { weightG: MAX_WEIGHT_G, lengthCm: MAX_LENGTH_CM, headCm: MAX_HEAD_CM }],
  ])("can hold each metric at %s", (_label, metrics) => {
    expect(fieldErrors(NewMeasurement, newMeasurement(metrics))).toEqual([])
  })

  it("must hold at least one metric, and names all three when it holds none", () => {
    expect(fieldErrors(NewMeasurement, newMeasurement({}))).toEqual([
      { path: "weightG", issue: "invalid" },
      { path: "lengthCm", issue: "invalid" },
      { path: "headCm", issue: "invalid" },
    ])
  })

  it.each([
    ["3.5 typed into a grams field, a weight in kilograms", 3.5],
    ["3500 typed into a kilograms field, a weight in grams", 3_500_000],
  ])("refuses %s", (_label, weightG) => {
    expect(fieldErrors(NewMeasurement, newMeasurement({ weightG }))).toEqual([{ path: "weightG", issue: "invalid" }])
  })

  it.each<[Metric, Schema.Json]>([
    ["weightG", MIN_WEIGHT_G - 0.1],
    ["weightG", MAX_WEIGHT_G + 0.1],
    ["weightG", 0],
    ["weightG", -3400],
    ["weightG", "3400"],
    ["lengthCm", MIN_LENGTH_CM - 0.1],
    ["lengthCm", MAX_LENGTH_CM + 0.1],
    ["headCm", MIN_HEAD_CM - 0.1],
    ["headCm", MAX_HEAD_CM + 0.1],
  ])("refuses %s of %j", (metric, value) => {
    expect(fieldErrors(NewMeasurement, newMeasurement({ weightG: 3400, [metric]: value }))).toEqual([
      { path: metric, issue: "invalid" },
    ])
  })

  it("needs every metric's key, with null for one not measured", () => {
    expect(fieldErrors(NewMeasurement, { actionId: ACTION_ID, measuredAt: AT, weightG: 3400 })).toEqual([
      { path: "lengthCm", issue: "invalid" },
      { path: "headCm", issue: "invalid" },
    ])
  })
})

describe("an edit to a measurement", () => {
  const edit = { actionId: ACTION_ID, version: 2, measuredAt: AT, weightG: 4210.5, lengthCm: 54.2, headCm: 37.1 }

  it("carries every field and the version it was made from", () => {
    expect(fieldErrors(MeasurementEdit, edit)).toEqual([])
    const unversioned = { actionId: ACTION_ID, measuredAt: AT, weightG: 4210.5, lengthCm: 54.2, headCm: 37.1 }
    expect(fieldErrors(MeasurementEdit, unversioned)).toEqual([{ path: "version", issue: "invalid" }])
  })

  it("clears a metric with null, keeping the others", () => {
    expect(fieldErrors(MeasurementEdit, { ...edit, headCm: null })).toEqual([])
  })

  it("can't clear the last metric, and names all three", () => {
    expect(fieldErrors(MeasurementEdit, { ...edit, ...NO_METRICS })).toEqual([
      { path: "weightG", issue: "invalid" },
      { path: "lengthCm", issue: "invalid" },
      { path: "headCm", issue: "invalid" },
    ])
  })
})

describe("MeasurementConflict", () => {
  const decode = Schema.decodeUnknownExit(Schema.toCodecJson(MeasurementConflict))

  it.each(["STALE_VERSION", "ACTION_REPLAY_MISMATCH"])("carries %s with the measurement it's about", (code) => {
    const exit = decode({ _tag: "Conflict", code, current: MEASUREMENT })
    expect(Exit.isSuccess(exit) && exit.value.current).toEqual(MEASUREMENT)
  })

  it("refuses a code a measurement can't conflict on", () => {
    expect(Exit.isFailure(decode({ _tag: "Conflict", code: "FEED_EMPTY", current: MEASUREMENT }))).toBe(true)
  })
})

describe("Growth", () => {
  it("lists measurements", () => {
    expect(fieldErrors(Growth, { measurements: [MEASUREMENT] })).toEqual([])
  })
})
