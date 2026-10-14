import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import { pastSleepEntry, pastSleepSession, spanOf } from "../src/features/sleep/past-sleep.ts"
import { whenAt } from "../src/sheets/when.ts"
import { MINUTE, NOW, ZONE } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const UUID = expect.stringMatching(/^[0-9a-f-]{36}$/u)
const HOUR = 60 * MINUTE
const times = (start: number, end: number) => ({ fellAsleep: whenAt(start, ZONE), woke: whenAt(end, ZONE) })

describe("a past sleep's first values", () => {
  it("is the hour before now", () => {
    expect(pastSleepSession(null, NOW, ZONE, null)).toEqual({
      actionId: UUID,
      ...times(NOW - HOUR, NOW),
      picked: null,
    })
  })

  it("starts at the slot History's Log at picked, an hour long unless that runs past now", () => {
    expect(pastSleepSession(null, NOW, ZONE, NOW - 5 * HOUR)).toMatchObject(times(NOW - 5 * HOUR, NOW - 4 * HOUR))
    expect(pastSleepSession(null, NOW, ZONE, NOW - 20 * MINUTE)).toMatchObject(times(NOW - 20 * MINUTE, NOW))
  })

  it("comes back as it was sent after a failure, so its retry sends the same sleep", () => {
    const action = {
      kind: "logSleep" as const,
      payload: { actionId: ACTION_ID, kind: "night" as const, startedAt: NOW - 3 * HOUR, endedAt: NOW - HOUR },
    }
    const failed = { sending: { sheet: "pastSleep" as const, action }, error: new Offline() }
    expect(pastSleepSession(failed, NOW, ZONE, null)).toEqual({
      actionId: ACTION_ID,
      ...times(NOW - 3 * HOUR, NOW - HOUR),
      picked: "night",
    })
  })
})

describe("a past sleep's span", () => {
  it("runs from when she fell asleep to when she woke", () => {
    expect(spanOf(times(NOW - 3 * HOUR, NOW - HOUR), ZONE, NOW)).toEqual({
      ok: true,
      startedAt: NOW - 3 * HOUR,
      endedAt: NOW - HOUR,
    })
  })

  it("needs a wake after she fell asleep", () => {
    expect(spanOf(times(NOW - HOUR, NOW - 2 * HOUR), ZONE, NOW)).toEqual({ ok: false, tooLong: false })
  })

  it("lasts a day at most, and says so", () => {
    expect(spanOf(times(NOW - 25 * HOUR, NOW), ZONE, NOW)).toEqual({ ok: false, tooLong: true })
    expect(spanOf(times(NOW - 24 * HOUR, NOW), ZONE, NOW)).toMatchObject({ ok: true })
  })

  it("can't end in the future", () => {
    expect(spanOf(times(NOW - HOUR, NOW + 10 * MINUTE), ZONE, NOW)).toEqual({ ok: false, tooLong: false })
  })
})

describe("the past sleep sent", () => {
  it("is a nap or a night by its start, until a parent picks one", () => {
    const evening = times(Date.UTC(2026, 9, 9, 2, 30), Date.UTC(2026, 9, 9, 12))
    expect(pastSleepEntry(ACTION_ID, evening, null, ZONE, NOW)).toEqual({
      actionId: ACTION_ID,
      kind: "night",
      startedAt: Date.UTC(2026, 9, 9, 2, 30),
      endedAt: Date.UTC(2026, 9, 9, 12),
    })
    expect(pastSleepEntry(ACTION_ID, evening, "nap", ZONE, NOW)?.kind).toBe("nap")
    expect(pastSleepEntry(ACTION_ID, times(NOW, NOW - HOUR), null, ZONE, NOW)).toBeNull()
  })
})
