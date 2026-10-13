import { describe, expect, it } from "vitest"
import { announcedState, CLOSED } from "../src/sheets/sheets-state.ts"
import { restoredToast, TOAST_MS } from "../src/sheets/undo.ts"
import { measurement } from "./growth-fixtures.ts"
import { diaperAt, feedAt, NOW, nursedFor } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"

const BOTTLE = { id: "portion-1", occurredAt: NOW, breastMilkMl: 60, formulaMl: 0 }

describe("restoredToast", () => {
  it("offers to delete a restored diaper again, from the version the restore answered, for five seconds", () => {
    const diaper = diaperAt(NOW, { id: "diaper-1", version: 3 })
    expect(restoredToast({ diaper, changed: [] }, NOW, ACTION_ID)).toEqual({
      message: "Diaper restored",
      undo: {
        sheet: "undo",
        action: { kind: "deleteDiaper", id: "diaper-1", payload: { actionId: ACTION_ID, version: 3 } },
      },
      until: NOW + TOAST_MS,
    })
  })

  it("names a restored feed a bottle when it holds only bottles, and offers to delete it again", () => {
    const bottle = feedAt(NOW, { id: "feed-1", version: 5, portions: [BOTTLE] })
    const nursed = nursedFor(feedAt(NOW, { id: "feed-2", version: 4 }), "left", 10)
    const toasts = [
      restoredToast({ feed: bottle, changed: [] }, NOW, ACTION_ID),
      restoredToast({ feed: nursed, changed: [] }, NOW, ACTION_ID),
    ]
    expect(toasts.map(({ message }) => message)).toEqual(["Bottle restored", "Feed restored"])
    expect(toasts.map(({ undo }) => undo)).toEqual([
      { sheet: "undo", action: { kind: "deleteFeed", id: "feed-1", payload: { actionId: ACTION_ID, version: 5 } } },
      { sheet: "undo", action: { kind: "deleteFeed", id: "feed-2", payload: { actionId: ACTION_ID, version: 4 } } },
    ])
  })

  it("offers no Undo for a measurement, which its card can delete at any time (M4.4)", () => {
    const restored = measurement("m1", NOW, { weightG: 4300 })
    expect(restoredToast({ measurement: restored, changed: [] }, NOW, ACTION_ID)).toEqual({
      message: "Measurement restored",
      undo: null,
      until: NOW + TOAST_MS,
    })
  })
})

describe("announcedState", () => {
  it("shows the toast, leaving any sheet and held entry as they were", () => {
    const toast = { message: "Diaper restored", undo: null, until: NOW + TOAST_MS }
    const state = { ...CLOSED, open: "bottle", opened: 2 } as const
    expect(announcedState(state, toast)).toEqual({ ...state, toast })
  })
})
