import { FeedConflict } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import type { Sending } from "../src/sheets/sending.ts"
import { CLOSED, expiredState, failedState, savedState, sendingState } from "../src/sheets/sheets-state.ts"
import { TOAST_MS } from "../src/sheets/undo.ts"
import { diaperAt, feedAt, NOW } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"

const DIAPER: Sending = {
  sheet: "diaper",
  action: { kind: "logDiaper", payload: { actionId: ACTION_ID, occurredAt: NOW, wet: true, dirty: false } },
}

const SWITCH: Sending = {
  sheet: "nursing",
  action: { kind: "switchSide", id: "feed-1", payload: { actionId: ACTION_ID, version: 3, occurredAt: NOW } },
}

describe("sending", () => {
  it("closes a sheet that creates an entry while online, so the entry shows at once", () => {
    expect(sendingState({ ...CLOSED, open: "diaper" }, DIAPER, true).open).toBeNull()
  })

  it("keeps the sheet open offline, and for a running feed's controls", () => {
    expect(sendingState({ ...CLOSED, open: "diaper" }, DIAPER, false).open).toBe("diaper")
    expect(sendingState({ ...CLOSED, open: "nursing" }, SWITCH, true).open).toBe("nursing")
  })
})

describe("a failed send", () => {
  it("reopens its sheet with the reason", () => {
    const failed = { sending: DIAPER, error: new Offline() }
    expect(failedState(CLOSED, failed, NOW)).toEqual({ open: "diaper", failed, toast: null })
  })

  it("says so in a toast when it was an undo", () => {
    const undo: Sending = {
      sheet: "diaper",
      action: { kind: "deleteDiaper", id: "d1", payload: { actionId: ACTION_ID, version: 1 } },
    }
    const state = failedState(CLOSED, { sending: undo, error: new Offline() }, NOW)
    expect(state).toEqual({
      ...CLOSED,
      toast: { message: "No connection, so that wasn't undone.", undo: null, until: NOW + TOAST_MS },
    })
  })
})

describe("a saved entry", () => {
  it("offers to undo a diaper with the version the household answered", () => {
    const diaper = diaperAt(NOW, { id: "diaper-1", version: 1 })
    const { toast } = savedState(CLOSED, DIAPER, { diaper, changed: [] }, NOW)
    expect(toast).toMatchObject({
      message: "Diaper saved",
      until: NOW + TOAST_MS,
      undo: { sheet: "diaper", action: { kind: "deleteDiaper", id: "diaper-1", payload: { version: 1 } } },
    })
  })

  it("offers to undo a bottle added to a running feed by deleting just that bottle", () => {
    const portion = { occurredAt: NOW, breastMilkMl: 40, formulaMl: 0 }
    const sending: Sending = {
      sheet: "bottle",
      action: { kind: "addBottle", id: "feed-1", payload: { actionId: ACTION_ID, version: 2, ...portion } },
    }
    const feed = feedAt(NOW - 600_000, { id: "feed-1", version: 3, portions: [{ id: "portion-9", ...portion }] })
    const { toast } = savedState(CLOSED, sending, { feed, changed: [] }, NOW)
    expect(toast?.undo?.action).toMatchObject({
      kind: "deletePortion",
      id: "portion-9",
      payload: { version: 3, deleteIfEmpty: false },
    })
  })

  it("lets the toast go once its time is up, but not before", () => {
    const diaper = diaperAt(NOW, { id: "diaper-1" })
    const state = savedState(CLOSED, DIAPER, { diaper, changed: [] }, NOW)
    expect(expiredState(state, NOW + TOAST_MS - 1)).toBe(state)
    expect(expiredState(state, NOW + TOAST_MS).toast).toBeNull()
  })

  it("has nothing to undo for a running feed's controls", () => {
    const feed = feedAt(NOW, { id: "feed-1", version: 4 })
    expect(savedState(CLOSED, SWITCH, { feed, changed: [] }, NOW).toast).toBeNull()
  })
})

describe("a conflict", () => {
  it("reopens the running feed's sheet with the household's copy", () => {
    const current = feedAt(NOW, { id: "feed-1", version: 4 })
    const failed = { sending: SWITCH, error: new FeedConflict({ code: "STALE_VERSION", current }) }
    expect(failedState({ ...CLOSED, open: "nursing" }, failed, NOW)).toMatchObject({ open: "nursing", failed })
  })
})
