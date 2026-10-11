import { describe, expect, it } from "vitest"
import { failedFor, type Sheets } from "../src/sheets/sheets-context.ts"
import {
  CLOSED,
  discardedState,
  dismissedState,
  keptState,
  sendingState,
  type SheetsState,
  shownState,
} from "../src/sheets/sheets-state.ts"
import { afterFailures, BOTTLE_HELD, DIAPER, DIAPER_HELD, diaper, held, start } from "./held-fixtures.ts"

const sheetsOf = (state: SheetsState): Sheets => ({
  ...state,
  editing: null,
  busy: null,
  show: () => {},
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
