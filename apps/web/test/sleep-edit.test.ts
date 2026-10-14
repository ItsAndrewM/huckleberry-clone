import { SleepConflict } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import { sentAnyway, staleMessage, staleOf } from "../src/features/edit/stale.ts"
import { editedSpan, sleepDelete, sleepEdit, sleepEditSession } from "../src/features/sleep/sleep-edit.ts"
import type { Display } from "../src/features/today/display.ts"
import type { Sending } from "../src/sheets/sending.ts"
import { whenAt } from "../src/sheets/when.ts"
import { ANDREW, EMILY, MINUTE, NOW, sleptAt, ZONE } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const UUID = expect.stringMatching(/^[0-9a-f-]{36}$/u)
const FELL_ASLEEP = NOW - 90 * MINUTE + 17_000
const WOKE = NOW - 10 * MINUTE + 41_000
const NAP = sleptAt(FELL_ASLEEP, { id: "sleep-1", endedAt: WOKE, version: 2 })
const DISPLAY: Display = {
  timeZone: ZONE,
  volume: "ml",
  locale: "en-US",
  caregivers: [
    { id: ANDREW, displayName: "Andrew" },
    { id: EMILY, displayName: "Emily" },
  ],
  supplements: [],
}

describe("a finished sleep's edit", () => {
  const session = sleepEditSession(null, NAP, ZONE)

  it("opens on the sleep as it is, with a fresh actionId and its version", () => {
    expect(session).toEqual({
      actionId: UUID,
      target: { id: "sleep-1", version: 2 },
      startedAt: FELL_ASLEEP,
      endedAt: WOKE,
      times: { fellAsleep: whenAt(FELL_ASLEEP, ZONE), woke: whenAt(WOKE, ZONE) },
      kind: "nap",
    })
  })

  it("keeps the exact times it opened on while they're left alone, so a save of the label alone moves nothing", () => {
    expect(editedSpan(session, session.times, ZONE, NOW)).toEqual({ ok: true, startedAt: FELL_ASLEEP, endedAt: WOKE })
    expect(sleepEdit(session, "night", FELL_ASLEEP, WOKE)).toEqual({
      kind: "editSleep",
      id: "sleep-1",
      payload: { actionId: session.actionId, version: 2, kind: "night", startedAt: FELL_ASLEEP, endedAt: WOKE },
    })
  })

  it("takes a changed time to the minute, and needs the wake after she fell asleep", () => {
    const moved = { ...session.times, woke: whenAt(NOW - 5 * MINUTE, ZONE) }
    expect(editedSpan(session, moved, ZONE, NOW)).toMatchObject({ ok: true, endedAt: NOW - 5 * MINUTE })
    const reversed = { ...session.times, fellAsleep: whenAt(NOW - 5 * MINUTE, ZONE) }
    expect(editedSpan(session, reversed, ZONE, NOW)).toEqual({ ok: false, tooLong: false })
  })

  it("comes back as it was sent after a failure", () => {
    const action = sleepEdit({ ...session, actionId: ACTION_ID }, "night", FELL_ASLEEP, NOW - 5 * MINUTE)
    const resumed = sleepEditSession({ sending: { sheet: "editSleep", action }, error: new Offline() }, NAP, ZONE)
    expect(resumed).toMatchObject({ actionId: ACTION_ID, endedAt: NOW - 5 * MINUTE, kind: "night" })
  })

  it("deletes with the version it opened on and a fresh actionId", () => {
    expect(sleepDelete(session.target)).toEqual({
      kind: "deleteSleep",
      id: "sleep-1",
      payload: { actionId: UUID, version: 2 },
    })
  })
})

describe("a sleep the other phone changed first", () => {
  const theirs = { ...NAP, kind: "night" as const, version: 3, updatedBy: EMILY }
  const sending: Sending = {
    sheet: "editSleep",
    action: sleepEdit(sleepEditSession(null, NAP, ZONE), "nap", FELL_ASLEEP, WOKE),
  }
  const stale = staleOf({ sending, error: new SleepConflict({ code: "STALE_VERSION", current: theirs }) })

  it("says who changed it and how it reads now, and saves mine on their version", () => {
    expect(stale).toEqual({ current: { kind: "sleep", sleep: theirs }, deleting: false })
    const message = stale === null ? "" : staleMessage(DISPLAY, stale, NOW).replace(/\s/gu, " ")
    expect(message).toBe("Emily changed this a moment ago. It now reads: Night at 8:00 AM: 1 h 20 min, Woke 9:20 AM.")
    expect(sentAnyway(sending, { kind: "sleep", sleep: theirs }).action.payload).toMatchObject({ version: 3 })
  })
})
