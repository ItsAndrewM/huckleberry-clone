import { describe, expect, it } from "vitest"
import { pendingId } from "../src/api/pending.ts"
import { supplementRows } from "../src/features/today/supplement-rows.ts"
import { DISPLAY, local } from "./history-fixtures.ts"
import { ANDREW, dosedAt, supplementOf, VITAMIN_D } from "./today-fixtures.ts"

const IRON = supplementOf({ id: "supplement-iron", name: "Iron", dose: "1 mL" })
const PROBIOTIC = supplementOf({ id: "supplement-probiotic", name: "Probiotic", dose: "" })
const STOPPED = supplementOf({ id: "supplement-stopped", name: "Fluoride", stoppedAt: local("06:00") })
const DISPLAYED = { ...DISPLAY, supplements: [supplementOf(), IRON, PROBIOTIC, STOPPED] }

describe("supplementRows", () => {
  it("gives each supplement in use a row, in the household's order, leaving out one that's stopped", () => {
    const rows = supplementRows(DISPLAYED, [])
    expect(rows.map(({ id }) => id)).toEqual([VITAMIN_D, IRON.id, PROBIOTIC.id])
  })

  it("says a supplement isn't logged yet today, with its dose when one is written down", () => {
    expect(supplementRows(DISPLAYED, []).map(({ title, detail }) => [title, detail])).toEqual([
      ["Vitamin D not logged yet today", ["400 IU"]],
      ["Iron not logged yet today", ["1 mL"]],
      ["Probiotic not logged yet today", []],
    ])
  })

  it("says when today's dose was logged and by whom, with the dose it was given at", () => {
    const [row] = supplementRows(DISPLAYED, [dosedAt(local("09:10"), { dose: "800 IU" })])
    expect(row).toEqual({
      id: VITAMIN_D,
      name: "Vitamin D",
      title: "Vitamin D logged at 9:10 AM",
      detail: ["by Emily", "800 IU"],
    })
  })

  it("counts a second dose and names the last, and says a dose is saving until the household answers", () => {
    const doses = [dosedAt(local("09:10")), dosedAt(local("14:02"), { createdBy: ANDREW })]
    const [row] = supplementRows(DISPLAYED, doses)
    expect(row).toMatchObject({
      title: "Vitamin D logged twice today, last at 2:02 PM",
      detail: ["by Andrew", "400 IU"],
    })
    const saving = [...doses, dosedAt(local("15:00"), { id: pendingId("action-1") })]
    expect(supplementRows(DISPLAYED, saving)[0]).toMatchObject({
      title: "Vitamin D logged 3 times today, last at 3:00 PM",
      detail: ["Saving…", "400 IU"],
    })
  })

  it("names no one for a caregiver the household doesn't list", () => {
    const [row] = supplementRows(DISPLAYED, [dosedAt(local("09:10"), { createdBy: "gone" })])
    expect(row?.detail).toEqual(["400 IU"])
  })

  it("gives no rows when no supplement is in use", () => {
    expect(supplementRows({ ...DISPLAY, supplements: [STOPPED] }, [dosedAt(local("09:10"))])).toEqual([])
  })
})
