import { describe, expect, it } from "vitest"
import { savedState, sendingState, shownState } from "../src/sheets/sheets-state.ts"
import { afterFailures, BOTTLE_HELD, DIAPER, DIAPER_HELD, SAVED_DIAPER } from "./held-fixtures.ts"
import { NOW } from "./today-fixtures.ts"

describe("a sheet kept open offline", () => {
  const retried = sendingState(afterFailures(DIAPER_HELD), DIAPER, false)

  it("closes when the save it kept open lands, and offers its Undo", () => {
    expect(retried.open).toBe("diaper")
    const state = savedState(retried, DIAPER, SAVED_DIAPER, NOW)
    expect(state.open).toBeNull()
    expect(state.toast).toMatchObject({ message: "Diaper saved", undo: { action: { kind: "deleteDiaper" } } })
  })

  it("opens the next held entry's sheet as it closes", () => {
    const state = sendingState(afterFailures(DIAPER_HELD, BOTTLE_HELD), DIAPER, false)
    expect(savedState(state, DIAPER, SAVED_DIAPER, NOW).open).toBe("bottle")
  })

  it("leaves alone a sheet the parent has opened since", () => {
    const bottle = shownState(retried, "bottle")
    expect(savedState(bottle, DIAPER, SAVED_DIAPER, NOW).open).toBe("bottle")
  })
})
