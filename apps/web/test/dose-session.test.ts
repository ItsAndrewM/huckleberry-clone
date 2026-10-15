import { DoseConflict } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import {
  doseDescription,
  doseSessionOf,
  duplicateMessage,
  duplicateOf,
  formKeyOf,
  occurredAtOf,
  supplementIdOf,
} from "../src/features/supplement/dose-session.ts"
import type { Household } from "../src/sheets/failure.ts"
import type { Failed, Sending } from "../src/sheets/sending.ts"
import { NOW as NOW_WHEN, whenAt } from "../src/sheets/when.ts"
import { ANDREW, dosedAt, EMILY, MINUTE, NOW, VITAMIN_D, ZONE } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

const HOUSEHOLD: Household = {
  caregivers: [
    { id: ANDREW, displayName: "Andrew" },
    { id: EMILY, displayName: "Emily" },
  ],
  timeZone: ZONE,
  childName: "Robin",
  locale: "en-US",
}

const logged = (confirmedDuplicate: boolean): Sending => ({
  sheet: "dose",
  action: {
    kind: "logDose",
    payload: { actionId: ACTION_ID, supplementId: VITAMIN_D, occurredAt: NOW - 5 * MINUTE, confirmedDuplicate },
  },
})

const failedWith = (error: Error, confirmedDuplicate = false): Failed => ({
  sending: logged(confirmedDuplicate),
  error,
})

describe("doseSessionOf", () => {
  it("logs a new dose of the supplement the sheet opened on, now, asking first about a second dose that day", () => {
    expect(doseSessionOf(null, "supplement-iron", ZONE, null)).toEqual({
      actionId: expect.stringMatching(UUID),
      supplementId: "supplement-iron",
      when: NOW_WHEN,
      occurredAt: null,
      confirmedDuplicate: false,
    })
  })

  it("starts at the time History's empty slot was tapped", () => {
    expect(doseSessionOf(null, VITAMIN_D, ZONE, NOW - 60 * MINUTE).when).toEqual(whenAt(NOW - 60 * MINUTE, ZONE))
  })

  it("reopens on a dose that wasn't saved with its own action, supplement, time and answer to the second-dose question", () => {
    expect(doseSessionOf(failedWith(new Offline(), true), null, ZONE, null)).toEqual({
      actionId: ACTION_ID,
      supplementId: VITAMIN_D,
      when: whenAt(NOW - 5 * MINUTE, ZONE),
      occurredAt: NOW - 5 * MINUTE,
      confirmedDuplicate: true,
    })
  })

  it("logs at the held dose's own instant, to the second, until its time is changed", () => {
    const sentAt = NOW - 5 * MINUTE + 37_000
    const payload = { actionId: ACTION_ID, supplementId: VITAMIN_D, occurredAt: sentAt, confirmedDuplicate: false }
    const failed: Failed = { sending: { sheet: "dose", action: { kind: "logDose", payload } }, error: new Offline() }
    const session = doseSessionOf(failed, null, ZONE, null)
    expect(occurredAtOf(session, session.when, ZONE, NOW)).toEqual({ ok: true, instant: sentAt })
    expect(occurredAtOf(session, NOW_WHEN, ZONE, NOW)).toEqual({ ok: true, instant: NOW })
  })
})

describe("formKeyOf", () => {
  it("is the held dose's own action, so the form starts again on each dose it shows", () => {
    const resent: Failed = {
      sending: {
        sheet: "dose",
        action: {
          kind: "logDose",
          payload: { actionId: "action-2", supplementId: VITAMIN_D, occurredAt: NOW, confirmedDuplicate: true },
        },
      },
      error: new Offline(),
    }
    expect(formKeyOf(failedWith(new Offline()))).toBe(ACTION_ID)
    expect(formKeyOf(resent)).toBe("action-2")
  })

  it("is the same for every new dose, which has no held dose to belong to", () => {
    expect(formKeyOf(null)).toBe("new")
  })
})

describe("supplementIdOf", () => {
  it("is the held dose's supplement when one is held, and the opening's otherwise", () => {
    expect(supplementIdOf(failedWith(new Offline()), "supplement-iron")).toBe(VITAMIN_D)
    expect(supplementIdOf(null, "supplement-iron")).toBe("supplement-iron")
    expect(supplementIdOf(null, null)).toBeNull()
  })
})

describe("duplicateOf", () => {
  it("finds a second dose that day, with the one already logged and the same dose resent as meant", () => {
    const current = dosedAt(NOW - 180 * MINUTE)
    const failed = failedWith(new DoseConflict({ code: "SUPPLEMENT_DUPLICATE_DAY", current }))
    const duplicate = duplicateOf(failed)
    expect(duplicate).toMatchObject({ failed, current })
    expect(duplicate?.resend()).toEqual({
      sheet: "dose",
      action: {
        kind: "logDose",
        payload: {
          actionId: expect.stringMatching(UUID),
          supplementId: VITAMIN_D,
          occurredAt: NOW - 5 * MINUTE,
          confirmedDuplicate: true,
        },
      },
    })
    expect(duplicate?.resend().action.payload.actionId).not.toBe(ACTION_ID)
  })

  it("finds nothing for another failure, or for no failure", () => {
    expect(duplicateOf(failedWith(new Offline()))).toBeNull()
    const replayed = new DoseConflict({ code: "ACTION_REPLAY_MISMATCH", current: dosedAt(NOW) })
    expect(duplicateOf(failedWith(replayed))).toBeNull()
    expect(duplicateOf(null)).toBeNull()
  })
})

describe("doseDescription", () => {
  it("says one tap saves the dose, but not while the sheet asks about a second dose that day", () => {
    expect(doseDescription(null)).toBe("One tap saves it.")
    expect(doseDescription(failedWith(new Offline()))).toBe("One tap saves it.")
    const second = new DoseConflict({ code: "SUPPLEMENT_DUPLICATE_DAY", current: dosedAt(NOW - 200 * MINUTE) })
    expect(doseDescription(failedWith(second))).toBeUndefined()
  })
})

describe("duplicateMessage", () => {
  it("says when the day's dose was logged and by whom, then asks", () => {
    expect(duplicateMessage("Vitamin D", dosedAt(NOW - 200 * MINUTE), HOUSEHOLD)).toBe(
      "Vitamin D was logged at 6:10 AM by Emily. Record another dose anyway?",
    )
  })
})
