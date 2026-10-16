import { FeedConflict } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { letGo } from "../src/sheets/held.ts"
import type { Failed, Sending } from "../src/sheets/sending.ts"
import {
  CLOSED,
  dismissedState,
  failedState,
  sendingState,
  type SheetsState,
  shownState,
} from "../src/sheets/sheets-state.ts"
import { afterFailures, BOTTLE, BOTTLE_HELD, DIAPER_HELD, held, start } from "./held-fixtures.ts"
import { feedAt, NOW } from "./today-fixtures.ts"

const control = (kind: "switchSide" | "pauseFeed", actionId: string): Sending => ({
  sheet: "nursing",
  action: { kind, id: "feed-1", payload: { actionId, version: 3, occurredAt: NOW } },
})

const PAUSE = control("pauseFeed", "action-pause")
const THEIRS = feedAt(NOW - 600_000, { id: "feed-1", status: "active", endedAt: null, version: 4 })

const REFUSED_SWITCH: Failed = {
  sending: control("switchSide", "action-switch"),
  error: new FeedConflict({ code: "STALE_VERSION", current: THEIRS }),
}

const refusedInItsSheet = failedState(shownState(CLOSED, "nursing"), REFUSED_SWITCH, NOW)

const failedIn = (state: SheetsState, failed: Failed) => failedState(state, failed, NOW)

describe("a refused running-feed control", () => {
  it("shows in its sheet until that sheet's next send, which lets it go", () => {
    expect(refusedInItsSheet).toMatchObject({ open: "nursing", held: [REFUSED_SWITCH] })
    expect(sendingState(refusedInItsSheet, PAUSE, true).held).toEqual([])
  })

  it("closes its sheet at once when dismissed, with no question, and is dropped", () => {
    expect(dismissedState(refusedInItsSheet)).toMatchObject({ open: null, held: [], asking: false })
  })

  it("goes when its sheet hands over to another sheet, so it doesn't come back after", () => {
    expect(shownState(refusedInItsSheet, "bottle")).toMatchObject({ open: "bottle", held: [] })
  })

  it("keeps waiting, and opens its sheet, when another sheet's entry is sent", () => {
    const waiting = failedState(shownState(CLOSED, "bottle"), REFUSED_SWITCH, NOW)
    expect(sendingState(waiting, BOTTLE, true)).toMatchObject({ open: "nursing", held: [REFUSED_SWITCH] })
  })
})

describe("a control the sheet let go", () => {
  const START_CHANGE: Sending = {
    sheet: "nursing",
    action: {
      kind: "editSegment",
      id: "segment-1",
      payload: { actionId: "action-start", version: 3, side: "left", startedAt: NOW, endedAt: null },
    },
  }

  it("is let go once it's no longer held, while its sheet shows and its own resend isn't on its way", () => {
    expect(letGo({ open: "nursing", busy: null }, "nursing", null, "action-pause")).toBe(true)
    expect(letGo({ open: "nursing", busy: START_CHANGE }, "nursing", null, "action-pause")).toBe(true)
  })

  it("isn't while it's held, while its own resend is on its way, or while its sheet is closed or another shows", () => {
    expect([
      letGo({ open: "nursing", busy: null }, "nursing", held(PAUSE), "action-pause"),
      letGo({ open: "nursing", busy: PAUSE }, "nursing", null, "action-pause"),
      letGo({ open: null, busy: null }, "nursing", null, "action-pause"),
      letGo({ open: "sleep", busy: null }, "nursing", null, "action-pause"),
    ]).toEqual([false, false, false, false])
  })
})

describe("a new entry beside a refused control", () => {
  it("still asks before it's discarded when its sheet is closed", () => {
    const started = afterFailures(held(start("action-start")))
    expect(dismissedState(started)).toMatchObject({ open: "nursing", asking: true })
  })

  it("stays held, with the other entry, when the control goes", () => {
    const state = [DIAPER_HELD, BOTTLE_HELD].reduce(failedIn, refusedInItsSheet)
    expect(state.held).toEqual([REFUSED_SWITCH, DIAPER_HELD, BOTTLE_HELD])
    expect(sendingState(state, PAUSE, true).held).toEqual([DIAPER_HELD, BOTTLE_HELD])
    expect(dismissedState(state)).toMatchObject({ open: "diaper", held: [DIAPER_HELD, BOTTLE_HELD], asking: false })
  })
})
