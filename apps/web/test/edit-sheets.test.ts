import { DiaperConflict } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import { heldFor } from "../src/sheets/held.ts"
import { closesOnSend, type Failed, type Sending } from "../src/sheets/sending.ts"
import {
  CLOSED,
  discardedState,
  dismissedKindState,
  dismissedState,
  failedState,
  savedState,
  sendingState,
  shownState,
} from "../src/sheets/sheets-state.ts"
import { TOAST_MS } from "../src/sheets/undo.ts"
import { afterFailures, BOTTLE_HELD, DIAPER_HELD } from "./held-fixtures.ts"
import { diaperAt, feedAt, NOW } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"

const edited = (id: string, actionId = ACTION_ID): Sending => ({
  sheet: "editDiaper",
  action: { kind: "editDiaper", id, payload: { actionId, version: 1, occurredAt: NOW, wet: true, dirty: true } },
})

const deleted = (sheet: Sending["sheet"], id: string): Sending => ({
  sheet,
  action: { kind: "deleteFeed", id, payload: { actionId: ACTION_ID, version: 2 } },
})

const offline = (sending: Sending): Failed => ({ sending, error: new Offline() })

describe("an edit sheet", () => {
  it("closes when its save or delete leaves, as Growth's does", () => {
    expect(closesOnSend(edited("diaper-1"))).toBe(true)
    expect(closesOnSend(deleted("editFeed", "feed-1"))).toBe(true)
    expect(sendingState(shownState(CLOSED, "editDiaper", "diaper-1"), edited("diaper-1"), true).open).toBeNull()
  })

  it("reopens on the record a failed save names, with the reason", () => {
    const failed = offline(edited("diaper-1"))
    expect(failedState(CLOSED, failed, NOW)).toMatchObject({
      open: "editDiaper",
      editing: "diaper-1",
      held: [failed],
    })
  })

  it("shows only its own record's failure, so another diaper's sheet stays clean", () => {
    const failed = offline(edited("diaper-1"))
    const other = failedState(shownState(CLOSED, "editDiaper", "diaper-2"), failed, NOW)
    expect(heldFor(other.held, "editDiaper", "diaper-2")).toBeNull()
    expect(heldFor(other.held, "editDiaper", "diaper-1")).toBe(failed)
  })

  it("asks before letting its own record's failure go as it closes, and then opens the other record's", () => {
    const first = offline(edited("diaper-1", "action-1"))
    const second = offline(edited("diaper-2", "action-2"))
    const asking = dismissedState(afterFailures(first, second))
    expect(asking).toMatchObject({ open: "editDiaper", editing: "diaper-1", asking: true })
    expect(discardedState(asking, first)).toMatchObject({ open: "editDiaper", editing: "diaper-2", held: [second] })
  })

  it("keeps a held new entry while it closes, and opens that entry's sheet next", () => {
    const state = dismissedState(shownState(afterFailures(DIAPER_HELD), "editDiaper", "diaper-1"))
    expect(state).toMatchObject({ open: "diaper", editing: null, held: [DIAPER_HELD] })
  })

  it("reopens on a failed delete rather than saying an undo failed", () => {
    const failed = offline(deleted("editFeed", "feed-1"))
    expect(failedState(CLOSED, failed, NOW)).toMatchObject({ open: "editFeed", editing: "feed-1", toast: null })
  })
})

describe("a delete", () => {
  it("offers Undo, which restores the entry at the version its delete answered", () => {
    const feed = feedAt(NOW, { id: "feed-1", version: 3, deletedAt: NOW, portions: [] })
    const { toast } = savedState(CLOSED, deleted("editFeed", "feed-1"), { feed, changed: [] }, NOW)
    expect(toast).toMatchObject({
      message: "Bottle deleted",
      until: NOW + TOAST_MS,
      undo: { sheet: "undo", action: { kind: "restoreFeed", id: "feed-1", payload: { version: 3 } } },
    })
  })

  it("names a diaper, and a feed with sides, in its toast", () => {
    const diaper = diaperAt(NOW, { id: "diaper-1", version: 2, deletedAt: NOW })
    const diaperDelete: Sending = {
      sheet: "editDiaper",
      action: { kind: "deleteDiaper", id: "diaper-1", payload: { actionId: ACTION_ID, version: 1 } },
    }
    expect(savedState(CLOSED, diaperDelete, { diaper, changed: [] }, NOW).toast?.message).toBe("Diaper deleted")
    const nursed = feedAt(NOW, {
      id: "feed-1",
      deletedAt: NOW,
      segments: [{ id: "s1", side: "left", startedAt: NOW - 600_000, endedAt: NOW }],
    })
    expect(savedState(CLOSED, deleted("nursing", "feed-1"), { feed: nursed, changed: [] }, NOW).toast?.message).toBe(
      "Feed deleted",
    )
  })

  it("closes the Nursing sheet as it leaves, since the feed it shows is going", () => {
    expect(closesOnSend(deleted("nursing", "feed-1"))).toBe(true)
  })

  it("shows nothing when its Undo lands, and a toast when its Undo fails", () => {
    const restore: Sending = {
      sheet: "undo",
      action: { kind: "restoreDiaper", id: "diaper-1", payload: { actionId: ACTION_ID, version: 2 } },
    }
    const diaper = diaperAt(NOW, { id: "diaper-1", version: 3 })
    expect(savedState(CLOSED, restore, { diaper, changed: [] }, NOW).toast).toBeNull()
    const error = new DiaperConflict({ code: "STALE_VERSION", current: diaper })
    expect(failedState(CLOSED, { sending: restore, error }, NOW)).toMatchObject({
      open: null,
      held: [],
      toast: { message: "That wasn't undone." },
    })
  })
})

describe("an opening", () => {
  it("carries the time it was asked to open at, and a reopen for a held entry starts without one", () => {
    const shown = shownState(CLOSED, "bottle", null, NOW - 600_000)
    expect(shown).toMatchObject({ open: "bottle", at: NOW - 600_000, editing: null })
    const reopened = dismissedState(shownState(afterFailures(BOTTLE_HELD), "logAt", null, NOW))
    expect(reopened).toMatchObject({ open: "bottle", at: null })
  })

  it("opens again for another record or time, and stays put for the same one", () => {
    const shown = shownState(CLOSED, "editDiaper", "diaper-1")
    expect(shownState(shown, "editDiaper", "diaper-1")).toBe(shown)
    expect(shownState(shown, "editDiaper", "diaper-2")).toMatchObject({ editing: "diaper-2", opened: shown.opened + 1 })
  })

  it("can be dismissed by kind, leaving any other sheet open", () => {
    const details = shownState(CLOSED, "details")
    expect(dismissedKindState(details, "details").open).toBeNull()
    const bottle = shownState(CLOSED, "bottle")
    expect(dismissedKindState(bottle, "details")).toBe(bottle)
  })
})
