import { Exit, Result, Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  Diaper,
  DiaperConflict,
  DiaperEdit,
  invalidInputFrom,
  NewDiaper,
  Version,
  VersionedAction,
} from "../src/index.ts"

const ACTION_ID = "8b2f9c3e-1d4a-4f6b-9e7c-5a3b2c1d0e9f"
const AT = Date.UTC(2026, 9, 8, 14, 30)

const DIAPER: Diaper = {
  id: "diaper-1",
  occurredAt: AT,
  wet: true,
  dirty: false,
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

describe("a new diaper", () => {
  it.each([
    ["wet", { wet: true, dirty: false }],
    ["dirty", { wet: false, dirty: true }],
    ["wet and dirty", { wet: true, dirty: true }],
  ])("can be %s", (_label, contents) => {
    expect(fieldErrors(NewDiaper, { actionId: ACTION_ID, occurredAt: AT, ...contents })).toEqual([])
  })

  it("must be wet or dirty, and names both fields when it's neither", () => {
    expect(fieldErrors(NewDiaper, { actionId: ACTION_ID, occurredAt: AT, wet: false, dirty: false })).toEqual([
      { path: "wet", issue: "invalid" },
      { path: "dirty", issue: "invalid" },
    ])
  })

  it("names every field that's missing or bad", () => {
    expect(fieldErrors(NewDiaper, { actionId: "first", occurredAt: AT / 1000, wet: "yes" })).toEqual([
      { path: "actionId", issue: "invalid" },
      { path: "occurredAt", issue: "invalid" },
      { path: "wet", issue: "invalid" },
      { path: "dirty", issue: "invalid" },
    ])
  })
})

describe("an edit to a diaper", () => {
  const edit = { actionId: ACTION_ID, version: 2, occurredAt: AT, wet: false, dirty: true }

  it("carries every field and the version it was made from", () => {
    expect(fieldErrors(DiaperEdit, edit)).toEqual([])
    const unversioned = { actionId: ACTION_ID, occurredAt: AT, wet: false, dirty: true }
    expect(fieldErrors(DiaperEdit, unversioned)).toEqual([{ path: "version", issue: "invalid" }])
  })

  it("must leave the diaper wet or dirty", () => {
    expect(fieldErrors(DiaperEdit, { ...edit, dirty: false })).toEqual([
      { path: "wet", issue: "invalid" },
      { path: "dirty", issue: "invalid" },
    ])
  })
})

describe("Version", () => {
  const decodes = (input: Schema.Json) => Exit.isSuccess(Schema.decodeUnknownExit(Schema.toCodecJson(Version))(input))

  it.each([1, 2, Number.MAX_SAFE_INTEGER])("accepts %d", (version) => {
    expect(decodes(version)).toBe(true)
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", null])("refuses %j", (version) => {
    expect(decodes(version)).toBe(false)
  })
})

describe("a delete or a restore", () => {
  it("carries an actionId and the version it was made from", () => {
    expect(fieldErrors(VersionedAction, { actionId: ACTION_ID, version: 1 })).toEqual([])
    expect(fieldErrors(VersionedAction, {})).toEqual([
      { path: "actionId", issue: "invalid" },
      { path: "version", issue: "invalid" },
    ])
  })
})

describe("DiaperConflict", () => {
  const decode = Schema.decodeUnknownExit(Schema.toCodecJson(DiaperConflict))

  it.each(["STALE_VERSION", "ACTION_REPLAY_MISMATCH"])("carries %s with the diaper it's about", (code) => {
    const exit = decode({ _tag: "Conflict", code, current: DIAPER })
    expect(Exit.isSuccess(exit) && exit.value.current).toEqual(DIAPER)
  })

  it("refuses a code a diaper can't conflict on", () => {
    expect(Exit.isFailure(decode({ _tag: "Conflict", code: "FEED_ALREADY_ACTIVE", current: DIAPER }))).toBe(true)
  })
})
