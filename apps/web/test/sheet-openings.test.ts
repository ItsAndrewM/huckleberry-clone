import { describe, expect, it } from "vitest"
import { CLOSED, failedState, sendingState, shownState } from "../src/sheets/sheets-state.ts"
import { afterFailures, DIAPER, DIAPER_HELD, diaper, held } from "./held-fixtures.ts"
import { NOW } from "./today-fixtures.ts"

describe("each opening of a sheet", () => {
  it("counts as a new opening, so the sheet's form starts afresh", () => {
    const shown = shownState(CLOSED, "diaper")
    expect(shown.opened).toBe(CLOSED.opened + 1)
    expect(shownState(shown, "diaper")).toBe(shown)
    expect(afterFailures(DIAPER_HELD).opened).toBe(CLOSED.opened + 1)
  })

  it("is counted when a failure lands in its own open sheet, so the form starts again from the failure", () => {
    const shown = shownState(CLOSED, "diaper")
    expect(failedState(shown, DIAPER_HELD, NOW).opened).toBe(shown.opened + 1)
  })

  it("is counted when the sheet opens again for the next held entry of the same kind", () => {
    const next = held(diaper("action-next"))
    const state = afterFailures(DIAPER_HELD, next)
    const reopened = sendingState(state, DIAPER, true)
    expect(reopened).toMatchObject({ open: "diaper", held: [next], opened: state.opened + 1 })
  })
})
