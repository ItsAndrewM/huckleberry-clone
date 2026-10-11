import { describe, expect, it } from "vitest"
import { updatedLine } from "../src/shell/updated.ts"

const ZONE = "America/Vancouver"
const MINUTE = 60_000
const HALF_PAST_NINE_IN_VANCOUVER = Date.UTC(2026, 9, 9, 16, 30)
const HALF_PAST_ELEVEN_AT_NIGHT_IN_VANCOUVER = Date.UTC(2026, 9, 10, 6, 30)
const plain = (line: string) => line.replace(/\s/gu, " ")

describe("updatedLine", () => {
  it("says when the app last heard from the household, in the household's zone", () => {
    const line = updatedLine(HALF_PAST_NINE_IN_VANCOUVER, HALF_PAST_NINE_IN_VANCOUVER + 5 * MINUTE, ZONE, "en-US")
    expect(plain(line)).toBe("Updated 9:30 AM.")
  })

  it("adds the day once the household's midnight has passed, though the UTC date hasn't changed", () => {
    const tenPastMidnight = HALF_PAST_ELEVEN_AT_NIGHT_IN_VANCOUVER + 40 * MINUTE
    const line = updatedLine(HALF_PAST_ELEVEN_AT_NIGHT_IN_VANCOUVER, tenPastMidnight, ZONE, "en-US")
    expect(plain(line)).toBe("Updated Oct 9, 11:30 PM.")
  })

  it("leaves the day out until the household's midnight, though the UTC date has changed", () => {
    const tenToMidnight = HALF_PAST_ELEVEN_AT_NIGHT_IN_VANCOUVER + 20 * MINUTE
    const line = updatedLine(HALF_PAST_ELEVEN_AT_NIGHT_IN_VANCOUVER - 8 * 60 * MINUTE, tenToMidnight, ZONE, "en-US")
    expect(plain(line)).toBe("Updated 3:30 PM.")
  })
})
