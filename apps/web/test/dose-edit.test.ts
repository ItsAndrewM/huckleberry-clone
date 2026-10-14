import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import { doseDelete, doseEdit, doseEditSession, givenParts, movedTo } from "../src/features/edit/dose-edit.ts"
import type { Failed } from "../src/sheets/sending.ts"
import { whenAt } from "../src/sheets/when.ts"
import { DISPLAY } from "./history-fixtures.ts"
import { dosedAt, MINUTE, NOW, supplementOf, ZONE } from "./today-fixtures.ts"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const TO_THE_SECOND = NOW - 30 * MINUTE + 37_412
const DOSE = dosedAt(TO_THE_SECOND, { id: "dose-1", version: 2 })

describe("doseEditSession", () => {
  it("opens on the dose as it is, at its exact time", () => {
    expect(doseEditSession(null, DOSE, ZONE)).toEqual({
      actionId: expect.stringMatching(UUID),
      target: { id: "dose-1", version: 2 },
      occurredAt: TO_THE_SECOND,
      when: whenAt(TO_THE_SECOND, ZONE),
    })
  })

  it("reopens on an edit that wasn't saved, with its own action, version and time", () => {
    const failed: Failed = {
      sending: {
        sheet: "editDose",
        action: { kind: "editDose", id: "dose-1", payload: { actionId: "action-1", version: 1, occurredAt: NOW } },
      },
      error: new Offline(),
    }
    expect(doseEditSession(failed, DOSE, ZONE)).toEqual({
      actionId: "action-1",
      target: { id: "dose-1", version: 1 },
      occurredAt: NOW,
      when: whenAt(NOW, ZONE),
    })
  })
})

describe("a dose's edit", () => {
  const session = doseEditSession(null, DOSE, ZONE)

  it("keeps the exact time, seconds included, when the parent leaves When alone", () => {
    expect(movedTo(session, session.when, ZONE, NOW)).toEqual({ ok: true, instant: TO_THE_SECOND })
  })

  it("moves the dose to the minute picked, from the version it opened on", () => {
    const picked = whenAt(NOW - 60 * MINUTE, ZONE)
    const moved = movedTo(session, picked, ZONE, NOW)
    expect(moved).toEqual({ ok: true, instant: NOW - 60 * MINUTE })
    expect(doseEdit(session, NOW - 60 * MINUTE)).toEqual({
      kind: "editDose",
      id: "dose-1",
      payload: { actionId: session.actionId, version: 2, occurredAt: NOW - 60 * MINUTE },
    })
  })

  it("names the dose by its supplement and the dose it was given at, above the form", () => {
    const display = { ...DISPLAY, supplements: [supplementOf()] }
    expect(givenParts(display, DOSE)).toEqual(["Vitamin D", "400 IU"])
    expect(givenParts(display, { ...DOSE, dose: "" })).toEqual(["Vitamin D"])
  })

  it("deletes the dose from the version it opened on, under an action of its own", () => {
    expect(doseDelete(session.target)).toEqual({
      kind: "deleteDose",
      id: "dose-1",
      payload: { actionId: expect.stringMatching(UUID), version: 2 },
    })
  })
})
