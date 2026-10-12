import { DiaperConflict, FeedConflict, NotFound } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import type { Failed, Sending } from "../src/sheets/sending.ts"
import { failedFor, type Sheets } from "../src/sheets/sheets-context.ts"
import {
  CLOSED,
  discardedState,
  dismissedState,
  failedState,
  keptState,
  savedState,
  sendingState,
  type SheetsState,
  shownState,
} from "../src/sheets/sheets-state.ts"
import {
  afterFailures,
  BOTTLE,
  BOTTLE_HELD,
  DIAPER,
  DIAPER_HELD,
  diaper,
  held,
  SAVED_DIAPER,
  start,
} from "./held-fixtures.ts"
import { diaperAt, feedAt, NOW } from "./today-fixtures.ts"

const sheetsOf = (state: SheetsState): Sheets => ({
  ...state,
  editing: null,
  at: null,
  keeping: true,
  busy: null,
  show: () => {},
  showAt: () => {},
  close: () => {},
  keep: () => {},
  discard: () => {},
  send: () => {},
})

describe("two saves that fail on one bar of signal", () => {
  it.each([
    { first: DIAPER_HELD, second: BOTTLE_HELD },
    { first: BOTTLE_HELD, second: DIAPER_HELD },
  ])("holds both, with the $first.sending.sheet sheet open and the other waiting", ({ first, second }) => {
    const state = afterFailures(first, second)
    expect(state.held).toEqual([first, second])
    expect(state.open).toBe(first.sending.sheet)
  })

  it("lets Try again send only its own entry, and opens the other's sheet as the first one closes", () => {
    const state = sendingState(afterFailures(DIAPER_HELD, BOTTLE_HELD), DIAPER, true)
    expect(state.held).toEqual([BOTTLE_HELD])
    expect(state.open).toBe("bottle")
  })

  it("keeps holding the other entry while Try again waits offline in its own sheet", () => {
    const state = sendingState(afterFailures(DIAPER_HELD, BOTTLE_HELD), DIAPER, false)
    expect(state.held).toEqual([BOTTLE_HELD])
    expect(state.open).toBe("diaper")
  })

  it("keeps every held entry when another entry is sent", () => {
    const state = sendingState(shownState(afterFailures(BOTTLE_HELD), "diaper"), diaper("action-new"), false)
    expect(state.held).toEqual([BOTTLE_HELD])
  })
})

describe("closing a sheet while an entry is held", () => {
  it("opens the held entry's sheet when a sheet with nothing held is closed", () => {
    const state = dismissedState(shownState(afterFailures(BOTTLE_HELD), "diaper"))
    expect(state).toMatchObject({ open: "bottle", held: [BOTTLE_HELD], asking: false })
  })

  it("opens the held entry's sheet when another sheet's save closes it", () => {
    const state = sendingState(shownState(afterFailures(BOTTLE_HELD), "diaper"), diaper("action-new"), true)
    expect(state.open).toBe("bottle")
  })

  it("closes as before when nothing is held", () => {
    expect(dismissedState(shownState(CLOSED, "diaper")).open).toBeNull()
  })

  it("keeps a started feed held while the parent logs a past feed, and offers it again after", () => {
    const started = held(start("action-start"))
    const pastFeed = shownState(afterFailures(started), "pastFeed")
    expect(pastFeed).toMatchObject({ open: "pastFeed", held: [started] })
    expect(dismissedState(pastFeed)).toMatchObject({ open: "nursing", held: [started] })
  })
})

describe("dismissing a sheet that shows a held entry", () => {
  it("asks first, and Keep goes back to the form with the entry still held", () => {
    const asking = dismissedState(afterFailures(DIAPER_HELD))
    expect(asking).toMatchObject({ open: "diaper", held: [DIAPER_HELD], asking: true })
    expect(keptState(asking)).toMatchObject({ open: "diaper", held: [DIAPER_HELD], asking: false })
  })

  it("lets Discard drop only its own entry, closing the sheet and opening the next held entry's", () => {
    const state = discardedState(dismissedState(afterFailures(DIAPER_HELD, BOTTLE_HELD)), DIAPER_HELD)
    expect(state).toMatchObject({ open: "bottle", held: [BOTTLE_HELD], asking: false })
  })

  it("leaves the sheet open for an entry discarded from inside its form", () => {
    expect(discardedState(afterFailures(DIAPER_HELD), DIAPER_HELD)).toMatchObject({ open: "diaper", held: [] })
  })
})

const SAVED_ALREADY: Failed = {
  sending: DIAPER,
  error: new DiaperConflict({ code: "ACTION_REPLAY_MISMATCH", current: diaperAt(NOW, { id: "diaper-1" }) }),
}

const THEIRS_RUNNING: Failed = {
  sending: start("action-start"),
  error: new FeedConflict({ code: "FEED_ALREADY_ACTIVE", current: feedAt(NOW, { id: "feed-1", status: "active" }) }),
}

const OVERLAP: Failed = {
  sending: BOTTLE,
  error: new FeedConflict({ code: "SEGMENT_OVERLAP", current: feedAt(NOW) }),
}

const SWITCHING: Sending = {
  sheet: "nursing",
  action: {
    kind: "switchSide",
    id: "feed-1",
    to: "left",
    payload: { actionId: "action-switch", version: 1, occurredAt: NOW },
  },
}

const FINISHING: Sending = {
  sheet: "nursing",
  action: {
    kind: "finishFeed",
    id: "feed-1",
    payload: { actionId: "action-finish", version: 1, occurredAt: NOW, deleteIfEmpty: false },
  },
}

const EDIT: Sending = {
  sheet: "diaper",
  action: {
    kind: "editDiaper",
    id: "diaper-1",
    payload: { actionId: "action-edit", version: 1, occurredAt: NOW, wet: true, dirty: true },
  },
}

describe("dismissing a sheet whose entry can't be saved as it is", () => {
  it.each([
    { case: "a diaper that was already saved", failed: SAVED_ALREADY },
    { case: "a start that met the other phone's feed", failed: THEIRS_RUNNING },
  ])("closes without asking after $case, and lets the entry go", ({ failed }) => {
    expect(dismissedState(afterFailures(failed))).toMatchObject({ open: null, held: [], asking: false })
  })

  it.each([
    { case: "no connection", failed: DIAPER_HELD },
    { case: "an overlap", failed: OVERLAP },
  ])("still asks after $case", ({ failed }) => {
    expect(dismissedState(afterFailures(failed))).toMatchObject({
      open: failed.sending.sheet,
      held: [failed],
      asking: true,
    })
  })

  it("opens the next held entry's sheet as it closes", () => {
    expect(dismissedState(afterFailures(SAVED_ALREADY, BOTTLE_HELD))).toMatchObject({
      open: "bottle",
      held: [BOTTLE_HELD],
      asking: false,
    })
  })
})

describe("a start that met the other phone's feed, when the parent carries on with theirs", () => {
  it("lets the start go once the sheet's own control is sent", () => {
    expect(sendingState(afterFailures(THEIRS_RUNNING), SWITCHING, true)).toMatchObject({ open: "nursing", held: [] })
  })

  it("closes the sheet when their feed is finished, rather than reopening it on the start", () => {
    expect(sendingState(afterFailures(THEIRS_RUNNING), FINISHING, true)).toMatchObject({ open: null, held: [] })
  })

  it("lets the start go when the parent turns to another sheet", () => {
    expect(shownState(afterFailures(THEIRS_RUNNING), "bottle")).toMatchObject({ open: "bottle", held: [] })
  })

  it("keeps a start that failed with no connection while the other sheet's entry is sent", () => {
    const offline = held(start("action-start"))
    expect(sendingState(shownState(afterFailures(offline), "diaper"), diaper("action-new"), true).held).toEqual([
      offline,
    ])
  })
})

describe("saving the changes as an edit", () => {
  const editing = sendingState(shownState(CLOSED, "diaper"), EDIT, true)

  it("keeps the sheet open until the edit lands, then closes it", () => {
    expect(editing).toMatchObject({ open: "diaper", keptOpen: "action-edit" })
    expect(savedState(editing, EDIT, SAVED_DIAPER, NOW).open).toBeNull()
  })

  it("holds a failed edit in the sheet it was saved from, keeping that sheet's form", () => {
    const failed = { sending: EDIT, error: new Offline() }
    expect(failedState(editing, failed, NOW)).toMatchObject({
      open: "diaper",
      opened: editing.opened,
      held: [failed],
      keptOpen: null,
    })
  })

  it.each([
    { error: new Offline(), message: "No connection, so your changes weren't saved." },
    { error: new NotFound(), message: "Your changes weren't saved." },
  ])("says '$message' in a toast when the edit fails after its sheet was closed", ({ error, message }) => {
    const state = failedState(dismissedState(editing), { sending: EDIT, error }, NOW)
    expect(state).toMatchObject({ open: null, held: [], toast: { message, undo: null } })
  })
})

describe("failedFor", () => {
  it("gives each sheet its oldest held entry", () => {
    const first = held(start("action-start-1"))
    const second = held(start("action-start-2"))
    const sheets = sheetsOf(afterFailures(first, DIAPER_HELD, second))
    expect(failedFor(sheets, "nursing")).toBe(first)
    expect(failedFor(sheets, "diaper")).toBe(DIAPER_HELD)
    expect(failedFor(sheets, "bottle")).toBeNull()
  })
})
