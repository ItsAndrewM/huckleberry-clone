import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import { pendingId } from "../src/api/pending.ts"
import { kindShown, sleepStartSession, startedAtOf, wakeAt, wakeSession } from "../src/features/sleep/sleep-session.ts"
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
const SECOND = 1000
const SEVEN_THIRTY_PM = Date.UTC(2026, 9, 10, 2, 30)
const TWO_PM = Date.UTC(2026, 9, 9, 21)
const RUNNING = sleptAt(NOW - 40 * MINUTE, { id: "sleep-1", endedAt: null, version: 3 })
const FIRST_TAP = NOW - MINUTE + 37 * SECOND
const NO_WAKE_HELD = wakeSession(null, ZONE)

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
    expect(sleepStartSession(null, ZONE)).toEqual({ actionId: UUID, when: NOW_WHEN, picked: null, startedAt: null })
  })

  it("comes back as it was sent after a failure, so its retry sends the same start", () => {
    const failed = {
      sending: { sheet: "sleep" as const, action: startAction(ACTION_ID, "nap", TWO_PM) },
      error: new Offline(),
    }
    expect(sleepStartSession(failed, ZONE)).toEqual({
      actionId: ACTION_ID,
      when: whenAt(TWO_PM, ZONE),
      picked: "nap",
      startedAt: TWO_PM,
    })
  })

  it("starts at the failed start's own instant, to the second, until its time is changed", () => {
    const failed = {
      sending: { sheet: "sleep" as const, action: startAction(ACTION_ID, "nap", FIRST_TAP) },
      error: new Offline(),
    }
    const session = sleepStartSession(failed, ZONE)
    expect(startedAtOf(session, session.when, ZONE, NOW)).toEqual({ ok: true, instant: FIRST_TAP })
    expect(startedAtOf(session, NOW_WHEN, ZONE, NOW)).toEqual({ ok: true, instant: NOW })
    expect(startedAtOf(session, whenAt(NOW - 5 * MINUTE, ZONE), ZONE, NOW)).toEqual({
      ok: true,
      instant: NOW - 5 * MINUTE,
    })
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
  it("is now with a fresh actionId, unless a failed wake is held, which keeps the time and actionId it sent", () => {
    const failed = {
      sending: { sheet: "sleep" as const, action: wakeAction(RUNNING, FIRST_TAP, ACTION_ID) },
      error: new Offline(),
    }
    expect(NO_WAKE_HELD).toEqual({ actionId: UUID, when: NOW_WHEN, occurredAt: null })
    expect(wakeSession(failed, ZONE)).toEqual({
      actionId: ACTION_ID,
      when: whenAt(FIRST_TAP, ZONE),
      occurredAt: FIRST_TAP,
    })
  })

  it("sends a held wake's own instant, to the second, until Woke is changed", () => {
    const failed = {
      sending: { sheet: "sleep" as const, action: wakeAction(RUNNING, FIRST_TAP, ACTION_ID) },
      error: new Offline(),
    }
    const session = wakeSession(failed, ZONE)
    expect(wakeAt(session, session.when, ZONE, NOW, RUNNING.startedAt)).toEqual({ ok: true, instant: FIRST_TAP })
    expect(wakeAt(session, NOW_WHEN, ZONE, NOW, RUNNING.startedAt)).toEqual({ ok: true, instant: NOW })
  })
})

describe("the time of a wake", () => {
  const STARTED = NOW - 40 * MINUTE + 17 * SECOND
  const IN_LAST_SECOND = Date.UTC(2026, 9, 9, 15, 50, 59, 500)
  const picked = (instant: number) => whenAt(instant, ZONE)

  it("is the tap while Woke is Now", () => {
    expect(wakeAt(NO_WAKE_HELD, NOW_WHEN, ZONE, NOW, STARTED)).toEqual({ ok: true, instant: NOW })
  })

  it("is a second after the start while Woke is Now and this phone's clock is behind the start", () => {
    const ahead = NOW + 2 * MINUTE
    expect(wakeAt(NO_WAKE_HELD, NOW_WHEN, ZONE, NOW, ahead)).toEqual({ ok: true, instant: ahead + SECOND })
  })

  it("is a second after the start, not a millisecond, when Woke is Now within a second of it", () => {
    expect(wakeAt(NO_WAKE_HELD, NOW_WHEN, ZONE, STARTED + 400, STARTED)).toEqual({
      ok: true,
      instant: STARTED + SECOND,
    })
  })

  it("asks for a time after she fell asleep when the one picked is before it", () => {
    expect(wakeAt(NO_WAKE_HELD, picked(STARTED - 5 * MINUTE), ZONE, NOW, STARTED)).toEqual({
      ok: false,
      issue: "too_early",
    })
  })

  it("lands a picked time in the start's minute a second after the start", () => {
    expect(wakeAt(NO_WAKE_HELD, picked(STARTED), ZONE, NOW, STARTED)).toEqual({ ok: true, instant: STARTED + SECOND })
  })

  it("keeps that to the start's own minute, whether the start is in the minute's last second or not", () => {
    const wokeAt = { ok: true, instant: IN_LAST_SECOND + SECOND }
    expect(wakeAt(NO_WAKE_HELD, picked(IN_LAST_SECOND), ZONE, NOW, IN_LAST_SECOND)).toEqual(wokeAt)
    expect(wakeAt(NO_WAKE_HELD, picked(IN_LAST_SECOND + 500), ZONE, NOW, IN_LAST_SECOND)).toEqual(wokeAt)
  })

  it("keeps a picked time after the start as it is, and refuses one in the future", () => {
    expect(wakeAt(NO_WAKE_HELD, picked(NOW - MINUTE), ZONE, NOW, STARTED)).toEqual({ ok: true, instant: NOW - MINUTE })
    expect(wakeAt(NO_WAKE_HELD, picked(NOW + 10 * MINUTE), ZONE, NOW, STARTED)).toEqual({
      ok: false,
      issue: "in_future",
    })
  })
})
