import { describe, expect, it } from "vitest"
import { QUARTER_HOUR_MS, slotIn } from "../../src/index.ts"
import { atMinute, MINUTE } from "./fixtures.ts"

const TWO_AM = { start: atMinute(120), end: atMinute(180) }
const LATER = atMinute(600)

describe("slotIn", () => {
  it("rounds a tap down to its quarter hour", () => {
    expect(slotIn(TWO_AM, 0.34, LATER)).toBe(atMinute(135))
    expect(QUARTER_HOUR_MS).toBe(15 * MINUTE)
  })

  it("gives the hour's start for a tap at its top, or one from the keyboard, which has no position", () => {
    expect(slotIn(TWO_AM, 0, LATER)).toBe(atMinute(120))
    expect(slotIn(TWO_AM, -2.5, LATER)).toBe(atMinute(120))
  })

  it("keeps a tap on the row's bottom edge in its last quarter, not the next hour", () => {
    expect(slotIn(TWO_AM, 1, LATER)).toBe(atMinute(165))
    expect(slotIn(TWO_AM, 3, LATER)).toBe(atMinute(165))
  })

  it("does nothing for a tap after now, and rounds one before it down as usual", () => {
    expect(slotIn(TWO_AM, 0.25, atMinute(130))).toBeNull()
    expect(slotIn(TWO_AM, 0.1, atMinute(130))).toBe(atMinute(120))
  })
})
