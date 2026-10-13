import { Exit, Result, Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  invalidInputFrom,
  NewSleep,
  SavedSleep,
  Sleep,
  SleepConflict,
  SleepEdit,
  SleepsGroup,
  SleepStart,
} from "../src/index.ts"

const ACTION_ID = "8b2f9c3e-1d4a-4f6b-9e7c-5a3b2c1d0e9f"
const AT = Date.UTC(2026, 9, 8, 14, 30)
const HOUR_MS = 60 * 60 * 1000

const SLEEP: Sleep = {
  id: "sleep-1",
  kind: "nap",
  startedAt: AT,
  endedAt: null,
  version: 1,
  createdBy: "caregiver-1",
  createdAt: AT,
  updatedBy: "caregiver-1",
  updatedAt: AT,
  deletedAt: null,
}

const fieldErrors = <A, I extends Schema.Json>(schema: Schema.Codec<A, I>, input: Schema.Json) => {
  const decoded = Schema.decodeUnknownResult(Schema.toCodecJson(schema), { errors: "all" })(input)
  return Result.isFailure(decoded) ? invalidInputFrom(decoded.failure.issue).fieldErrors : []
}

describe("a sleep", () => {
  it("is a nap or a night, from its start to its end, or still running with no end", () => {
    expect(fieldErrors(Sleep, SLEEP)).toEqual([])
    expect(fieldErrors(Sleep, { ...SLEEP, kind: "night", endedAt: AT + HOUR_MS })).toEqual([])
  })

  it("refuses a kind other than nap or night", () => {
    expect(fieldErrors(Sleep, { ...SLEEP, kind: "evening" })).toEqual([{ path: "kind", issue: "invalid" }])
  })

  it("is answered with the keys its save changed", () => {
    expect(fieldErrors(SavedSleep, { sleep: SLEEP, changed: [["today"], ["day", "2026-10-08"]] })).toEqual([])
  })
})

describe("a past sleep", () => {
  it("carries its kind and both its times", () => {
    expect(fieldErrors(NewSleep, { actionId: ACTION_ID, kind: "night", startedAt: AT, endedAt: AT + HOUR_MS })).toEqual(
      [],
    )
  })

  it("names every field that's missing or bad, an end included, since a past sleep has ended", () => {
    expect(fieldErrors(NewSleep, { actionId: "first", kind: "Nap", startedAt: AT / 1000, endedAt: null })).toEqual([
      { path: "actionId", issue: "invalid" },
      { path: "kind", issue: "invalid" },
      { path: "startedAt", issue: "invalid" },
      { path: "endedAt", issue: "invalid" },
    ])
  })
})

describe("a started sleep", () => {
  it("carries its kind and its start, and no end", () => {
    expect(fieldErrors(SleepStart, { actionId: ACTION_ID, kind: "nap", startedAt: AT })).toEqual([])
    expect(fieldErrors(SleepStart, { actionId: ACTION_ID, startedAt: AT })).toEqual([
      { path: "kind", issue: "invalid" },
    ])
    const withAnEnd = { actionId: ACTION_ID, kind: "nap", startedAt: AT, endedAt: AT + HOUR_MS }
    expect(Schema.decodeUnknownSync(Schema.toCodecJson(SleepStart))(withAnEnd)).toEqual({
      actionId: ACTION_ID,
      kind: "nap",
      startedAt: AT,
    })
  })
})

describe("an edit to a sleep", () => {
  const edit = { actionId: ACTION_ID, version: 2, kind: "night", startedAt: AT, endedAt: AT + HOUR_MS }

  it("carries every field and the version it was made from", () => {
    expect(fieldErrors(SleepEdit, edit)).toEqual([])
    const unversioned = { actionId: ACTION_ID, kind: "night", startedAt: AT, endedAt: AT + HOUR_MS }
    expect(fieldErrors(SleepEdit, unversioned)).toEqual([{ path: "version", issue: "invalid" }])
    const unlabelled = { actionId: ACTION_ID, version: 2, startedAt: AT, endedAt: AT + HOUR_MS }
    expect(fieldErrors(SleepEdit, unlabelled)).toEqual([{ path: "kind", issue: "invalid" }])
  })

  it("sends no end for a sleep that's still running", () => {
    expect(fieldErrors(SleepEdit, { ...edit, endedAt: null })).toEqual([])
  })
})

describe("SleepConflict", () => {
  const decode = Schema.decodeUnknownExit(Schema.toCodecJson(SleepConflict))

  it.each(["SLEEP_ALREADY_ACTIVE", "SLEEP_OVERLAP", "STALE_VERSION", "ACTION_REPLAY_MISMATCH"])(
    "carries %s with the sleep it's about",
    (code) => {
      const exit = decode({ _tag: "Conflict", code, current: SLEEP })
      expect(Exit.isSuccess(exit) && exit.value.current).toEqual(SLEEP)
    },
  )

  it("refuses a code a sleep can't conflict on", () => {
    expect(Exit.isFailure(decode({ _tag: "Conflict", code: "FEED_ALREADY_ACTIVE", current: SLEEP }))).toBe(true)
  })
})

describe("SleepsGroup", () => {
  it("starts, wakes, logs, edits, deletes and restores a sleep", () => {
    const endpoints = Object.entries(SleepsGroup.endpoints).map(
      ([name, { method, path }]) => `${name} ${method} ${path}`,
    )
    expect(endpoints).toEqual([
      "logSleep POST /sleeps",
      "startSleep POST /sleeps/start",
      "wakeSleep POST /sleeps/:id/wake",
      "editSleep PATCH /sleeps/:id",
      "deleteSleep DELETE /sleeps/:id",
      "restoreSleep POST /sleeps/:id/restore",
    ])
  })
})
