import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import { pendingId } from "../src/api/pending.ts"
import { kindShown, sentWake, sleepStartSession } from "../src/features/sleep/sleep-session.ts"
import {
  deleteAction,
  runningEdit,
  sleepState,
  sleepWaits,
  startAction,
  wakeAction,
} from "../src/features/sleep/sleep-state.ts"
import type { Sending } from "../src/sheets/sending.ts"
import { NOW as NOW_WHEN, whenAt } from "../src/sheets/when.ts"
import { MINUTE, NOW, sleptAt, ZONE } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const UUID = expect.stringMatching(/^[0-9a-f-]{36}$/u)
const SEVEN_THIRTY_PM = Date.UTC(2026, 9, 10, 2, 30)
const TWO_PM = Date.UTC(2026, 9, 9, 21)
const RUNNING = sleptAt(NOW - 40 * MINUTE, { id: "sleep-1", endedAt: null, version: 3 })

describe("the sleep sheet's state", () => {
  it("starts a sleep when none runs, waits on one being started, and controls a running one", () => {
    expect(sleepState(null)).toEqual({ kind: "idle" })
    expect(sleepState({ ...RUNNING, id: pendingId(ACTION_ID) })).toEqual({ kind: "starting" })
    expect(sleepState(RUNNING)).toEqual({ kind: "running", sleep: RUNNING })
  })

  it("holds the controls while the sleep sheet sends", () => {
    const sending: Sending = { sheet: "sleep", action: wakeAction(RUNNING, NOW) }
    expect([sleepWaits(sending), sleepWaits({ ...sending, sheet: "nursing" }), sleepWaits(null)]).toEqual([
      true,
      false,
      false,
    ])
  })

  it("starts, wakes, edits and deletes with the sleep's version and a fresh actionId", () => {
    expect(startAction(ACTION_ID, "night", NOW)).toEqual({
      kind: "startSleep",
      payload: { actionId: ACTION_ID, kind: "night", startedAt: NOW },
    })
    expect(wakeAction(RUNNING, NOW)).toEqual({
      kind: "wakeSleep",
      id: "sleep-1",
      payload: { actionId: UUID, version: 3, occurredAt: NOW },
    })
    expect(runningEdit(RUNNING, "night", NOW - 50 * MINUTE)).toEqual({
      kind: "editSleep",
      id: "sleep-1",
      payload: { actionId: UUID, version: 3, kind: "night", startedAt: NOW - 50 * MINUTE, endedAt: null },
    })
    expect(deleteAction(RUNNING)).toEqual({
      kind: "deleteSleep",
      id: "sleep-1",
      payload: { actionId: UUID, version: 3 },
    })
  })
})

describe("a sleep being started", () => {
  it("starts now, with a fresh actionId and the label left to the clock", () => {
    expect(sleepStartSession(null, ZONE)).toEqual({ actionId: UUID, when: NOW_WHEN, picked: null })
  })

  it("comes back as it was sent after a failure, so its retry sends the same start", () => {
    const failed = {
      sending: { sheet: "sleep" as const, action: startAction(ACTION_ID, "nap", TWO_PM) },
      error: new Offline(),
    }
    expect(sleepStartSession(failed, ZONE)).toEqual({ actionId: ACTION_ID, when: whenAt(TWO_PM, ZONE), picked: "nap" })
  })

  it("is a night from 7 PM to 7 AM on the household's clock and a nap otherwise, until a parent picks one", () => {
    const at = (instant: number) => ({ ok: true as const, instant })
    expect(kindShown(null, at(SEVEN_THIRTY_PM), ZONE, NOW)).toBe("night")
    expect(kindShown(null, at(TWO_PM), ZONE, NOW)).toBe("nap")
    expect(kindShown("nap", at(SEVEN_THIRTY_PM), ZONE, NOW)).toBe("nap")
  })

  it("follows the moment it's shown while the start can't be read yet", () => {
    expect(kindShown(null, { ok: false, issue: "unreadable" }, ZONE, SEVEN_THIRTY_PM)).toBe("night")
  })
})

describe("a wake", () => {
  it("is now, unless a failed wake is held, which keeps the time it sent", () => {
    const failed = {
      sending: { sheet: "sleep" as const, action: wakeAction(RUNNING, NOW - MINUTE) },
      error: new Offline(),
    }
    expect(sentWake(null, ZONE)).toEqual(NOW_WHEN)
    expect(sentWake(failed, ZONE)).toEqual(whenAt(NOW - MINUTE, ZONE))
  })
})
