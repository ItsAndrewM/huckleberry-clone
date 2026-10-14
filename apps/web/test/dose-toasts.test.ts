import { describe, expect, it } from "vitest"
import type { Sending } from "../src/sheets/sending.ts"
import { CLOSED, savedState } from "../src/sheets/sheets-state.ts"
import { restoredToast, TOAST_MS } from "../src/sheets/undo.ts"
import { dosedAt, NOW, VITAMIN_D } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const UUID = expect.stringMatching(/^[0-9a-f-]{36}$/u)
const DOSE = dosedAt(NOW - 60_000, { id: "dose-1", version: 1 })

const LOGGED: Sending = {
  sheet: "dose",
  action: {
    kind: "logDose",
    payload: { actionId: ACTION_ID, supplementId: VITAMIN_D, occurredAt: NOW - 60_000, confirmedDuplicate: false },
  },
}

const DELETED: Sending = {
  sheet: "editDose",
  action: { kind: "deleteDose", id: "dose-1", payload: { actionId: ACTION_ID, version: 1 } },
}

describe("a saved dose's toast", () => {
  it("says the dose was saved, with an Undo that deletes it at the version the household answered", () => {
    expect(savedState(CLOSED, LOGGED, { dose: DOSE, changed: [] }, NOW).toast).toEqual({
      message: "Dose saved",
      undo: { sheet: "undo", action: { kind: "deleteDose", id: "dose-1", payload: { actionId: UUID, version: 1 } } },
      until: NOW + TOAST_MS,
    })
  })

  it("says a dose was deleted, with an Undo that restores it", () => {
    const deleted = { ...DOSE, version: 2, deletedAt: NOW }
    expect(savedState(CLOSED, DELETED, { dose: deleted, changed: [] }, NOW).toast).toMatchObject({
      message: "Dose deleted",
      undo: { action: { kind: "restoreDose", id: "dose-1", payload: { version: 2 } } },
    })
  })

  it("says a dose was restored from Recently deleted, with an Undo that deletes it again", () => {
    expect(restoredToast({ dose: { ...DOSE, version: 3 }, changed: [] }, NOW, ACTION_ID)).toEqual({
      message: "Dose restored",
      undo: {
        sheet: "undo",
        action: { kind: "deleteDose", id: "dose-1", payload: { actionId: ACTION_ID, version: 3 } },
      },
      until: NOW + TOAST_MS,
    })
  })
})
