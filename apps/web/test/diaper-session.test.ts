import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import { sessionOf } from "../src/features/diaper/diaper-session.ts"
import type { Failed, Sending } from "../src/sheets/sending.ts"
import { NOW as WHEN_NOW, whenAt } from "../src/sheets/when.ts"
import { MINUTE, NOW, ZONE } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SENT_AT = NOW - 40 * MINUTE

const failedWith = (sending: Sending): Failed => ({ sending, error: new Offline() })

const LOGGED: Sending = {
  sheet: "diaper",
  action: { kind: "logDiaper", payload: { actionId: ACTION_ID, occurredAt: SENT_AT, wet: false, dirty: true } },
}

const UNDONE: Sending = {
  sheet: "diaper",
  action: { kind: "deleteDiaper", id: "diaper-1", payload: { actionId: ACTION_ID, version: 1 } },
}

describe("a Diaper sheet's session", () => {
  it("starts at Now under a new actionId when nothing failed", () => {
    const session = sessionOf(null, ZONE, null)
    expect(session.actionId).toMatch(UUID)
    expect(session.when).toEqual(WHEN_NOW)
  })

  it("starts at the time it was opened at, from History's empty slot, under a new actionId", () => {
    const session = sessionOf(null, ZONE, SENT_AT)
    expect(session.actionId).toMatch(UUID)
    expect(session.when).toEqual(whenAt(SENT_AT, ZONE))
  })

  it("keeps a failed save's own time over the time the sheet was opened at", () => {
    expect(sessionOf(failedWith(LOGGED), ZONE, NOW).when).toEqual(whenAt(SENT_AT, ZONE))
  })

  it("picks a failed save up where it left off: the same actionId, and the time sent on the household's clock", () => {
    expect(sessionOf(failedWith(LOGGED), ZONE, null)).toEqual({ actionId: ACTION_ID, when: whenAt(SENT_AT, ZONE) })
  })

  it("starts over when the failure wasn't a logged diaper", () => {
    const session = sessionOf(failedWith(UNDONE), ZONE, null)
    expect(session.actionId).toMatch(UUID)
    expect(session.actionId).not.toBe(ACTION_ID)
    expect(session.when).toEqual(WHEN_NOW)
  })
})
