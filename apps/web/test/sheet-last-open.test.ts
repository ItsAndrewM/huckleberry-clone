import { describe, expect, it } from "vitest"
import { lastOpen } from "../src/sheets/use-last-open.ts"

describe("lastOpen", () => {
  it("shows what the sheet holds while it's open", () => {
    expect(lastOpen(1_000, true, 2_000)).toBe(2_000)
    expect(lastOpen(1_000, true, null)).toBeNull()
  })

  it("keeps what it showed while open once it closes, though the next sheet clears it", () => {
    expect(lastOpen(1_000, false, null)).toBe(1_000)
    expect(lastOpen(1_000, false, 2_000)).toBe(1_000)
  })
})
